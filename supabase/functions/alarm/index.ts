// 시계 알람 푸시: pg_cron이 1분마다 부른다. 지금 울릴 알람을 찾아 주인 기기로 푸시를 보낸다.
// 배포: npx supabase functions deploy alarm --no-verify-jwt
// 비밀값: npx supabase secrets set ALARM_CRON_SECRET=<아무도 모르는 긴 문자열>
//        (VAPID_* · SITE_URL은 notify 함수와 같은 값을 같이 쓴다)
// 예약 작업 등록은 docs/deploy.md "알람" 참고
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** RLS를 건너뛰는 서버 전용 키 (notify 함수와 같은 순서로 찾는다) */
function serverKey(): string | null {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    const first = keys.default ?? Object.values(keys)[0]
    if (first) return first
  } catch {
    // 형식이 다르면 다음 방법으로
  }
  return Deno.env.get('BANGDEURI_SECRET_KEY') ?? null
}

interface Due {
  id: string
  owner_id: string
  time: string
  label: string
  fresh: boolean
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const secret = Deno.env.get('ALARM_CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401)

  const serviceKey = serverKey()
  if (!serviceKey) return json({ error: 'no_service_key' }, 500)
  if (!Deno.env.get('VAPID_PUBLIC_KEY') || !Deno.env.get('VAPID_PRIVATE_KEY')) return json({ error: 'no_vapid_key' }, 500)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

  // 울릴 알람을 넘기면서 다음 시각으로 옮긴다 (한 번짜리는 꺼진다)
  const { data, error } = await db.rpc('fire_due_alarms')
  if (error) return json({ error: error.message }, 500)
  // 예약 작업이 오래 멈췄다 돌아오면 한참 지난 알람은 보내지 않는다
  const due = ((data ?? []) as Due[]).filter((a) => a.fresh)
  if (!due.length) return json({ sent: 0 })

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )
  const siteUrl = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '')

  const owners = [...new Set(due.map((a) => a.owner_id))]
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth,user_id')
    .in('user_id', owners)
    .eq('on_alarm', true)

  let sent = 0
  await Promise.all(
    due.flatMap((a) =>
      (subs ?? [])
        .filter((s) => s.user_id === a.owner_id)
        .map(async (s) => {
          const payload = JSON.stringify({
            title: `⏰ ${a.label || '알람'}`,
            body: `${a.time} 알람이에요`,
            url: siteUrl ? `${siteUrl}/` : '/',
            tag: `alarm:${a.id}`,
            sticky: true,
          })
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
              TTL: 10 * 60,
              urgency: 'high',
            })
            sent++
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode
            if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
          }
        }),
    ),
  )
  return json({ sent })
})
