// 방 주인에게 푸시 알림 보내기: "OO님이 들어왔어요", "OO님이 라면을 두고 갔어요"
// kind: 'feedback' — 개발자 기기들에 "💌 새 메시지" (내용은 앱이 보낸 걸 믿지 않고 DB에서 아직 안 알린 것만 읽는다)
// 배포: 대시보드 Edge Functions > Deploy a new function > Via Editor (이름 notify, Verify JWT 끄기)
//       또는 npx supabase functions deploy notify --no-verify-jwt
// 비밀값: npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:나@example.com
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/**
 * RLS를 건너뛰는 서버 전용 키. Supabase가 함수에 넣어 주는 이름이 프로젝트마다 달라서 차례로 찾는다:
 * 예전 service_role 키 → 새 secret 키 묶음(SUPABASE_SECRET_KEYS) → 직접 넣은 비밀값(BANGDEURI_SECRET_KEY)
 */
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

/** 같은 사람이 같은 방에 같은 알림을 다시 보내려면 기다려야 하는 시간 */
const SAME_GAP_MS = 2 * 60 * 1000
/** 한 방에서 한 시간에 보내는 알림 최대 수 */
const HOURLY_MAX = 30

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  let body: { room_id?: string; kind?: string; name?: string; item?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_json' }, 400)
  }
  if (body.kind === 'feedback') return feedbackPush()
  const roomId = String(body.room_id ?? '')
  const kind = body.kind === 'drop' ? 'drop' : body.kind === 'enter' ? 'enter' : body.kind === 'event' ? 'event' : null
  const name = String(body.name ?? '').trim().slice(0, 10)
  const item = String(body.item ?? '').trim().slice(0, 16)
  if (!roomId || !kind || !name) return json({ error: 'bad_request' }, 400)

  const serviceKey = serverKey()
  if (!serviceKey) return json({ error: 'no_service_key' }, 500)
  if (!Deno.env.get('VAPID_PUBLIC_KEY') || !Deno.env.get('VAPID_PRIVATE_KEY')) return json({ error: 'no_vapid_key' }, 500)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

  const { data: room } = await db.from('rooms').select('id,slug,name,owner_id').eq('id', roomId).maybeSingle()
  if (!room) return json({ error: 'room_not_found' }, 404)

  // 도배 막기
  const since = new Date(Date.now() - SAME_GAP_MS).toISOString()
  const { count: same } = await db
    .from('notify_log')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .eq('kind', kind)
    .eq('name', name)
    .gt('at', since)
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: hourly } = await db
    .from('notify_log')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .gt('at', hourAgo)
  if ((same ?? 0) > 0 || (hourly ?? 0) >= HOURLY_MAX) return json({ sent: 0, skipped: 'rate' })
  await db.from('notify_log').insert({ room_id: roomId, kind, name })
  // 하루 지난 기록은 지운다
  await db.from('notify_log').delete().lt('at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .eq('user_id', room.owner_id)
    .eq(kind === 'enter' ? 'on_enter' : kind === 'drop' ? 'on_drop' : 'on_event', true)
  if (!subs?.length) return json({ sent: 0 })

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )

  const siteUrl = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '')
  const payload = JSON.stringify({
    title: `${room.name}의 미니룸`,
    body:
      kind === 'enter'
        ? `${name}님이 들어왔어요`
        : kind === 'drop'
          ? `${name}님이 ${item || '선물'}을(를) 두고 갔어요`
          : `${name}님이 달력에 일정을 적었어요`,
    url: siteUrl ? `${siteUrl}/?r=${room.slug}` : `/?r=${room.slug}`,
    tag: `${roomId}:${kind}`,
  })

  let sent = 0
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 60 * 60,
        })
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        // 알림을 끄거나 앱을 지운 기기는 정리한다
        if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
    }),
  )
  return json({ sent })
})

/** 개발자에게 한마디: 최근 10분 안에 들어왔는데 아직 안 알린 메시지를 개발자 기기들에 알린다 */
async function feedbackPush() {
  const serviceKey = serverKey()
  if (!serviceKey) return json({ error: 'no_service_key' }, 500)
  if (!Deno.env.get('VAPID_PUBLIC_KEY') || !Deno.env.get('VAPID_PRIVATE_KEY')) return json({ error: 'no_vapid_key' }, 500)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: rows } = await db
    .from('feedback')
    .select('id,body,nickname')
    .is('notified_at', null)
    .gt('created_at', since)
    .order('created_at', { ascending: true })
    .limit(20)
  if (!rows?.length) return json({ sent: 0 })
  // 먼저 알린 것으로 표시 (여러 번 불려도 한 번만 알린다)
  const { data: claimed } = await db
    .from('feedback')
    .update({ notified_at: new Date().toISOString() })
    .in('id', rows.map((r) => r.id))
    .is('notified_at', null)
    .select('id')
  const mine = rows.filter((r) => claimed?.some((c) => c.id === r.id))
  if (!mine.length) return json({ sent: 0 })

  const { data: ids } = await db.rpc('admin_user_ids')
  const adminIds = ((ids ?? []) as (string | { admin_user_ids: string })[]).map((x) => (typeof x === 'string' ? x : x.admin_user_ids))
  if (!adminIds.length) return json({ sent: 0, skipped: 'no_admin' })
  const { data: subs } = await db.from('push_subscriptions').select('endpoint,p256dh,auth').in('user_id', adminIds)
  if (!subs?.length) return json({ sent: 0 })

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )
  const first = mine[0]
  const preview = `${first.nickname ? `${first.nickname}: ` : ''}${String(first.body).slice(0, 60)}`
  const siteUrl = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '')
  const payload = JSON.stringify({
    title: mine.length > 1 ? `💌 새 메시지 ${mine.length}개` : '💌 방들이에 새 메시지',
    body: preview,
    url: siteUrl ? `${siteUrl}/?inbox` : '/?inbox',
    tag: 'feedback',
  })
  let sent = 0
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 60 * 60 })
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
    }),
  )
  return json({ sent })
}
