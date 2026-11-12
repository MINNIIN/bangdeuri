import { createClient, type RealtimeChannel, type SupabaseClient, type User } from '@supabase/supabase-js'
import { normalizeLook } from '../art/avatar'
import { normalizeDecor } from '../art/decor'
import type { Backend } from './backend'
import { CHAT_KEEP } from './rules'
import type { Peer, RoomChannel, RoomEvent } from './realtime'
import type { Alarm } from './alarm'
import { monthRange } from './calendar'
import type { AuthUser, CalEvent, ChatMessage, Drop, Profile, Room, ThemeId } from './types'
import { isPlace } from './town'

interface RoomRow {
  id: string
  slug: string
  owner_id: string
  name: string
  theme: ThemeId
  motto: string
  total_visits: number
  today_visits: number
  today_date: string
  created_at: string
  decor: unknown
  owner?: { nickname: string; look: unknown } | null
}

interface DropRow {
  id: string
  room_id: string
  item: string
  place?: string | null
  u: number
  v: number
  nickname: string
  message: string
  created_at: string
}

interface MessageRow {
  id: string
  room_id: string
  name: string
  body: string
  owner: boolean
  created_at: string
}

interface EventRow {
  id: string
  room_id: string
  date: string
  time: string | null
  title: string
  name: string
  by_owner: boolean
  private: boolean
  mine: boolean
  created_at: string
}

export const toEvent = (r: EventRow): CalEvent => ({
  id: r.id,
  roomId: r.room_id,
  date: r.date,
  time: r.time,
  title: r.title,
  name: r.name,
  byOwner: r.by_owner,
  private: r.private,
  mine: r.mine,
  createdAt: r.created_at,
})

interface AlarmRow {
  id: string
  time: string
  days: number[]
  label: string
  enabled: boolean
  next_at: string | null
}

const ALARM_SELECT = 'id,time,days,label,enabled,next_at'

export const toAlarm = (r: AlarmRow): Alarm => ({
  id: r.id,
  time: r.time,
  days: r.days ?? [],
  label: r.label,
  enabled: r.enabled,
  nextAt: r.next_at,
})

const ROOM_SELECT =
  // room_visits도 rooms↔profiles를 잇기 때문에 주인 연결을 꼭 짚어 줘야 한다 (안 그러면 PGRST201로 방 조회가 전부 실패)
  'id,slug,owner_id,name,theme,motto,total_visits,today_visits,today_date,created_at,decor,owner:profiles!rooms_owner_id_fkey(nickname,look)'

export const toRoom = (r: RoomRow): Room => ({
  id: r.id,
  slug: r.slug,
  ownerId: r.owner_id,
  name: r.name,
  theme: r.theme,
  motto: r.motto,
  totalVisits: r.total_visits,
  todayVisits: r.today_visits,
  todayDate: r.today_date,
  createdAt: r.created_at,
  decor: normalizeDecor(r.decor, r.theme),
  owner: { nickname: r.owner?.nickname ?? r.name, look: normalizeLook(r.owner?.look) },
})

export const toDrop = (r: DropRow): Drop => ({
  id: r.id,
  roomId: r.room_id,
  item: r.item,
  place: isPlace(r.place) ? r.place : 'in',
  u: r.u,
  v: r.v,
  nickname: r.nickname,
  message: r.message,
  createdAt: r.created_at,
})

export const toMessage = (r: MessageRow): ChatMessage => ({
  id: r.id,
  roomId: r.room_id,
  name: r.name,
  body: r.body,
  owner: r.owner,
  createdAt: r.created_at,
})

const toUser = (u: User | null | undefined): AuthUser | null => (u ? { id: u.id, email: u.email } : null)

/** Supabase 에러 → 화면 문구용 코드 (rules.ts ERROR_TEXT) */
function code(e: { message?: string; code?: string } | null): string {
  const m = e?.message ?? ''
  const known = m.match(/room_full|room_not_found|forbidden|too_fast|profile_required|login_required|too_many_rooms|calendar_full|too_many_alarms|bad_date/)
  if (known) return known[0]
  if (/already registered|already exists/i.test(m)) return 'email_taken'
  if (/invalid login credentials/i.test(m)) return 'bad_login'
  if (/password/i.test(m) && /at least|short|weak/i.test(m)) return 'weak_password'
  return m || 'unknown'
}

/** 에러면 던지고 아니면 data. maybeSingle()로 받은 것은 부른 쪽에서 null을 따로 본다 */
function check<R extends { data: unknown; error: { message?: string } | null }>(res: R): NonNullable<R['data']> {
  if (res.error) throw new Error(code(res.error))
  return res.data as NonNullable<R['data']>
}

export function createSupabaseBackend(url: string, key: string): Backend {
  const sb: SupabaseClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    realtime: { params: { eventsPerSecond: 20 } },
  })

  const uid = async () => (await sb.auth.getSession()).data.session?.user.id ?? null
  const needUid = async () => (await uid()) ?? (() => { throw new Error('login_required') })()

  // 소셜 로그인에서 돌아오면 주소에 붙은 ?code= 를 지운다
  const backTo = () => {
    const u = new URL(window.location.href)
    u.hash = ''
    return u.toString()
  }

  return {
    local: false,

    async getUser() {
      return toUser((await sb.auth.getSession()).data.session?.user)
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => cb(toUser(session?.user)))
      return () => data.subscription.unsubscribe()
    },
    async signInWith(provider) {
      check(await sb.auth.signInWithOAuth({ provider, options: { redirectTo: backTo() } }))
    },
    async signUpEmail(email, password) {
      const data = check(await sb.auth.signUp({ email: email.trim(), password }))
      // 이메일 확인을 켜 둔 프로젝트면 세션 없이 돌아온다
      if (!data.session) throw new Error('confirm_email')
    },
    async signInEmail(email, password) {
      check(await sb.auth.signInWithPassword({ email: email.trim(), password }))
    },
    async resetPassword(email) {
      check(await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: backTo() }))
    },
    async signOut() {
      await sb.auth.signOut()
    },

    async getProfile() {
      const id = await uid()
      if (!id) return null
      const row = check(await sb.from('profiles').select('id,nickname,look').eq('id', id).maybeSingle()) as Profile | null
      return row ? ({ id: row.id, nickname: row.nickname, look: normalizeLook(row.look) } as Profile) : null
    },
    async saveProfile({ nickname, look }) {
      const id = await needUid()
      const fields = { nickname: nickname.trim(), look: normalizeLook(look) }
      // upsert는 id 칸 수정 권한까지 필요해서 쓰지 않는다 (DB는 닉네임·미니미만 고칠 수 있게 막아 둠)
      const exists = check(await sb.from('profiles').select('id').eq('id', id).maybeSingle()) as { id: string } | null
      const query = exists
        ? sb.from('profiles').update(fields).eq('id', id)
        : sb.from('profiles').insert({ id, ...fields })
      const row = check(await query.select('id,nickname,look').single())
      return { id: row.id, nickname: row.nickname, look: normalizeLook(row.look) }
    },

    async createRoom(input) {
      const row = check(
        await sb.rpc('create_room', { p_name: input.name, p_theme: input.theme, p_motto: input.motto }).single<RoomRow>(),
      )
      const full = check(await sb.from('rooms').select(ROOM_SELECT).eq('id', row.id).single<RoomRow>())
      return toRoom(full)
    },
    async myRooms() {
      const id = await uid()
      if (!id) return []
      const rows = check(
        await sb.from('rooms').select(ROOM_SELECT).eq('owner_id', id).order('created_at', { ascending: false }),
      ) as unknown as RoomRow[]
      return rows.map(toRoom)
    },
    async getRoom(slug) {
      const row = check(await sb.from('rooms').select(ROOM_SELECT).eq('slug', slug).maybeSingle<RoomRow>()) as RoomRow | null
      return row ? toRoom(row) : null
    },
    async updateMotto(roomId, motto) {
      const rows = check(await sb.from('rooms').update({ motto }).eq('id', roomId).select('id'))
      if (!rows.length) throw new Error('forbidden')
    },
    async updateDecor(roomId, decor) {
      const rows = check(await sb.from('rooms').update({ decor }).eq('id', roomId).select('id'))
      if (!rows.length) throw new Error('forbidden')
    },
    async deleteRoom(roomId) {
      const rows = check(await sb.from('rooms').delete().eq('id', roomId).select('id'))
      if (!rows.length) throw new Error('forbidden')
    },
    async resetLink(roomId) {
      return check(await sb.rpc('reset_room_link', { p_room: roomId })) as string
    },
    async visit(roomId) {
      return check(await sb.rpc('visit_room', { p_room: roomId })) as { today: number; total: number }
    },
    async becomeNeighbor(roomId) {
      check(await sb.rpc('become_neighbor', { p_room: roomId }))
    },
    async neighbors(roomId) {
      const ids = (check(await sb.rpc('neighbor_room_ids', { p_room: roomId })) as string[] | null) ?? []
      if (!ids.length) return []
      const rows = check(await sb.from('rooms').select(ROOM_SELECT).in('id', ids)) as unknown as RoomRow[]
      const byId = new Map(rows.map((r) => [r.id, toRoom(r)]))
      return ids.flatMap((id) => byId.get(id) ?? [])
    },

    async listDrops(roomId) {
      const rows = check(
        await sb.from('drops').select('*').eq('room_id', roomId).order('created_at', { ascending: true }),
      ) as DropRow[]
      return rows.map(toDrop)
    },
    async addDrop(roomId, d) {
      const row = check(
        await sb
          .rpc('add_drop', {
            p_room: roomId,
            p_item: d.item,
            p_place: d.place,
            p_u: d.u,
            p_v: d.v,
            p_nickname: d.nickname,
            p_message: d.message,
          })
          .single<DropRow>(),
      )
      return toDrop(row)
    },
    async deleteDrop(roomId, dropId) {
      const rows = check(await sb.from('drops').delete().eq('room_id', roomId).eq('id', dropId).select('id'))
      if (!rows.length) throw new Error('forbidden')
    },

    async listMessages(roomId) {
      const rows = check(
        await sb
          .from('messages')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: false })
          .limit(Math.min(CHAT_KEEP, 200)),
      ) as MessageRow[]
      return rows.map(toMessage).reverse()
    },
    async postMessage(roomId, m) {
      const row = check(
        await sb.rpc('post_message', { p_room: roomId, p_name: m.name, p_body: m.body }).single<MessageRow>(),
      )
      return toMessage(row)
    },
    async deleteMessage(roomId, id) {
      const rows = check(await sb.from('messages').delete().eq('room_id', roomId).eq('id', id).select('id'))
      if (!rows.length) throw new Error('forbidden')
    },
    async countMessagesSince(roomId, since) {
      const res = await sb
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId)
        .eq('owner', false)
        .gt('created_at', since)
      return res.count ?? 0
    },

    async listEvents(roomId, month, key) {
      const { from, to } = monthRange(month)
      const rows = check(await sb.rpc('list_events', { p_room: roomId, p_from: from, p_to: to, p_key: key })) as EventRow[]
      return rows.map(toEvent)
    },
    async addEvent(roomId, e, key) {
      const row = check(
        await sb.rpc('add_event', {
          p_room: roomId,
          p_date: e.date,
          p_time: e.time ?? '',
          p_title: e.title,
          p_name: e.name,
          p_anon: e.anon,
          p_private: e.private,
          p_key: key,
        }),
      ) as EventRow
      return toEvent(row)
    },
    async deleteEvent(_roomId, id, key) {
      check(await sb.rpc('delete_event', { p_id: id, p_key: key }))
    },

    async listAlarms() {
      if (!(await uid())) return []
      const rows = check(await sb.from('alarms').select(ALARM_SELECT).order('time')) as AlarmRow[]
      return rows.map(toAlarm)
    },
    async saveAlarm(a) {
      await needUid()
      const fields = { time: a.time, days: [...new Set(a.days)].sort(), label: a.label.trim(), enabled: a.enabled }
      const row = a.id
        ? check(await sb.from('alarms').update(fields).eq('id', a.id).select(ALARM_SELECT).single<AlarmRow>())
        : check(await sb.from('alarms').insert(fields).select(ALARM_SELECT).single<AlarmRow>())
      return toAlarm(row)
    },
    async deleteAlarm(id) {
      check(await sb.from('alarms').delete().eq('id', id))
    },
    async ackAlarm(id) {
      return toAlarm(check(await sb.rpc('ack_alarm', { p_id: id }).single<AlarmRow>()))
    },
    async snoozeAlarm(id, minutes) {
      return toAlarm(check(await sb.rpc('snooze_alarm', { p_id: id, p_min: minutes }).single<AlarmRow>()))
    },

    joinRoom(roomId, me) {
      return supabaseChannel(sb.channel(`town:${roomId}`, { config: { presence: { key: me.cid }, broadcast: { self: false } } }), me)
    },

    async savePush(sub, prefs) {
      const user = await needUid()
      if (!sub.endpoint || !sub.keys) throw new Error('push_unavailable')
      check(
        await sb.from('push_subscriptions').upsert({
          endpoint: sub.endpoint,
          user_id: user,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          on_enter: prefs.enter,
          on_drop: prefs.drop,
          on_event: prefs.event,
          on_alarm: prefs.alarm,
        }),
      )
    },
    async removePush(endpoint) {
      await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)
    },
    async notify(roomId, n) {
      // 알림은 덤이라 실패해도 화면에는 알리지 않는다
      await sb.functions.invoke('notify', { body: { room_id: roomId, ...n } }).catch(() => undefined)
    },
  }
}

function supabaseChannel(ch: RealtimeChannel, me: Peer): RoomChannel {
  let peersCb: (p: Peer[]) => void = () => {}
  let eventCb: (e: RoomEvent) => void = () => {}
  let left = false

  const emitPeers = () => {
    const state = ch.presenceState<Peer>()
    const list: Peer[] = []
    for (const metas of Object.values(state)) {
      const p = metas[0]
      if (p?.cid)
        list.push({
          cid: p.cid,
          name: p.name,
          look: normalizeLook(p.look),
          owner: !!p.owner,
          homes: Array.isArray(p.homes) ? p.homes.filter((h): h is string => typeof h === 'string').slice(0, 5) : [],
        })
    }
    if (!list.some((p) => p.cid === me.cid)) list.push(me)
    peersCb(list)
  }

  ch.on('presence', { event: 'sync' }, emitPeers)
  ch.on('broadcast', { event: 'room' }, ({ payload }) => eventCb(payload as RoomEvent))
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') void ch.track(me)
  })

  return {
    send: (e) => void ch.send({ type: 'broadcast', event: 'room', payload: e }),
    onPeers: (cb) => {
      peersCb = cb
    },
    onEvent: (cb) => {
      eventCb = cb
    },
    leave() {
      if (left) return
      left = true
      void ch.untrack()
      void ch.unsubscribe()
    },
  }
}
