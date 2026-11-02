// 방 주인에게 푸시 알림 보내기: "OO님이 들어왔어요", "OO님이 라면을 두고 갔어요"
// 배포: npx supabase functions deploy notify --no-verify-jwt
// 비밀값: npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:나@example.com
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

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
  const roomId = String(body.room_id ?? '')
  const kind = body.kind === 'drop' ? 'drop' : body.kind === 'enter' ? 'enter' : null
  const name = String(body.name ?? '').trim().slice(0, 10)
  const item = String(body.item ?? '').trim().slice(0, 16)
  if (!roomId || !kind || !name) return json({ error: 'bad_request' }, 400)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

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
    .eq(kind === 'enter' ? 'on_enter' : 'on_drop', true)
  if (!subs?.length) return json({ sent: 0 })

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )

  const siteUrl = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '')
  const payload = JSON.stringify({
    title: `${room.name}의 미니룸`,
    body: kind === 'enter' ? `${name}님이 들어왔어요` : `${name}님이 ${item || '선물'}을(를) 두고 갔어요`,
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
