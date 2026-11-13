import { normalizeLook } from '../art/avatar'
import { defaultDecor, normalizeDecor } from '../art/decor'
import type { Backend } from './backend'
import { createLocalChannel } from './realtime'
import { type Alarm, MAX_ALARMS, nextAlarmAt } from './alarm'
import { dateAllowed, EVENTS_PER_MINUTE, MAX_EVENTS, monthRange, ROOM_EVENTS_PER_MINUTE } from './calendar'
import { CHAT_KEEP, kstDate, MAX_DROPS, sealLetter } from './rules'
import type { AuthUser, CalEvent, ChatMessage, Drop, Profile, Room } from './types'
import { isPlace, MAX_HOUSES } from './town'

/**
 * Supabase 키가 없을 때 쓰는 가짜 서버. 같은 브라우저 localStorage에 저장한다.
 * 로그인은 탭마다 따로(sessionStorage)라서, 한 탭은 방 주인·다른 탭은 손님으로 실시간 기능까지 혼자 시험해 볼 수 있다.
 */
const DB_KEY = 'bangdeuri:localdb:v2'
const SESSION_KEY = 'bangdeuri:local:session'

type StoredRoom = Omit<Room, 'owner'>

interface LocalDb {
  accounts: Record<string, { id: string; password: string }>
  profiles: Record<string, Profile>
  rooms: Record<string, StoredRoom>
  drops: Drop[]
  messages: ChatMessage[]
  events: StoredEvent[]
  alarms: (Alarm & { ownerId: string })[]
  /** 회원이 남의 방에 들어간 기록 (동네 이웃) */
  visits: { roomId: string; memberId: string; at: string }[]
}

/** 서버처럼 쓴 사람 계정·기기 키를 따로 들고 있는다 (목록에는 안 나간다) */
type StoredEvent = Omit<CalEvent, 'mine'> & { authorId: string | null; authorKey: string | null }

const randomId = (len: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(len)), (b) => (b % 36).toString(36)).join('')

const fail = (code: string): never => {
  throw new Error(code)
}

export function createLocalBackend(storage: Storage = localStorage, session: Storage = sessionStorage): Backend {
  const read = (): LocalDb => {
    try {
      const raw = storage.getItem(DB_KEY)
      if (raw) return { accounts: {}, profiles: {}, rooms: {}, drops: [], messages: [], events: [], alarms: [], visits: [], ...JSON.parse(raw) }
    } catch {
      // 깨진 데이터면 새로 시작
    }
    return { accounts: {}, profiles: {}, rooms: {}, drops: [], messages: [], events: [], alarms: [], visits: [] }
  }
  const write = (db: LocalDb) => storage.setItem(DB_KEY, JSON.stringify(db))

  const listeners = new Set<(u: AuthUser | null) => void>()
  const currentUser = (): AuthUser | null => {
    try {
      const raw = session.getItem(SESSION_KEY)
      return raw ? (JSON.parse(raw) as AuthUser) : null
    } catch {
      return null
    }
  }
  const setUser = (u: AuthUser | null) => {
    if (u) session.setItem(SESSION_KEY, JSON.stringify(u))
    else session.removeItem(SESSION_KEY)
    for (const cb of listeners) cb(u)
  }
  const needUser = () => currentUser() ?? fail('login_required')

  const withOwner = (db: LocalDb, r: StoredRoom): Room => {
    const p = db.profiles[r.ownerId]
    return {
      ...r,
      decor: normalizeDecor(r.decor, r.theme),
      owner: { nickname: p?.nickname ?? r.name, look: normalizeLook(p?.look) },
    }
  }
  const updateAlarm = (id: string, f: (a: Alarm & { ownerId: string }) => Alarm & { ownerId: string }): Alarm => {
    const u = needUser()
    const db = read()
    const a = db.alarms.find((x) => x.id === id && x.ownerId === u.id) ?? fail('forbidden')
    const next = f(a)
    db.alarms = db.alarms.map((x) => (x.id === id ? next : x))
    write(db)
    const { ownerId: _o, ...out } = next
    return out
  }
  const isOwner = (room: StoredRoom) => !!currentUser() && room.ownerId === currentUser()?.id
  const toEvent = (e: StoredEvent, room: StoredRoom, key: string): CalEvent => {
    const { authorId, authorKey, ...rest } = e
    const uid = currentUser()?.id
    return { ...rest, mine: isOwner(room) || (!!uid && authorId === uid) || (!!authorKey && authorKey === key) }
  }
  const ownRoom = (db: LocalDb, roomId: string) => {
    const room = db.rooms[roomId]
    if (!room) fail('room_not_found')
    if (room.ownerId !== currentUser()?.id) fail('forbidden')
    return room
  }

  return {
    local: true,

    async getUser() {
      return currentUser()
    },
    onAuthChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    async signInWith(provider) {
      // 로컬 모드에서는 소셜 로그인 흉내만 낸다 (탭마다 같은 테스트 계정)
      setUser({ id: `local-${provider}`, email: `${provider}@local.test` })
    },
    async signUpEmail(email, password) {
      const db = read()
      const key = email.trim().toLowerCase()
      if (db.accounts[key]) fail('email_taken')
      if (password.length < 6) fail('weak_password')
      const id = `local-${randomId(10)}`
      db.accounts[key] = { id, password }
      write(db)
      setUser({ id, email: key })
    },
    async signInEmail(email, password) {
      const acc = read().accounts[email.trim().toLowerCase()]
      if (!acc || acc.password !== password) fail('bad_login')
      setUser({ id: acc!.id, email: email.trim().toLowerCase() })
    },
    async resetPassword() {
      // 로컬 모드는 메일을 보내지 않는다
    },
    async signOut() {
      setUser(null)
    },

    async getProfile() {
      const u = currentUser()
      return u ? (read().profiles[u.id] ?? null) : null
    },
    async saveProfile({ nickname, look }) {
      const u = needUser()
      const db = read()
      const p: Profile = { id: u.id, nickname: nickname.trim(), look: normalizeLook(look) }
      db.profiles[u.id] = p
      write(db)
      return p
    },

    async createRoom(input) {
      const u = needUser()
      const db = read()
      if (!db.profiles[u.id]) fail('profile_required')
      const room: StoredRoom = {
        ...input,
        id: randomId(10),
        slug: randomId(8),
        ownerId: u.id,
        totalVisits: 0,
        todayVisits: 0,
        todayDate: kstDate(),
        createdAt: new Date().toISOString(),
        decor: defaultDecor(input.theme),
      }
      db.rooms[room.id] = room
      write(db)
      return withOwner(db, room)
    },
    async myRooms() {
      const u = currentUser()
      if (!u) return []
      const db = read()
      return Object.values(db.rooms)
        .filter((r) => r.ownerId === u.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => withOwner(db, r))
    },
    async getRoom(slug) {
      const db = read()
      const room = Object.values(db.rooms).find((r) => r.slug === slug)
      return room ? withOwner(db, room) : null
    },
    async updateMotto(roomId, motto) {
      const db = read()
      ownRoom(db, roomId).motto = motto
      write(db)
    },
    async updateDecor(roomId, decor) {
      const db = read()
      const room = ownRoom(db, roomId)
      room.decor = normalizeDecor(decor, room.theme)
      write(db)
    },
    async deleteRoom(roomId) {
      const db = read()
      ownRoom(db, roomId)
      delete db.rooms[roomId]
      db.drops = db.drops.filter((d) => d.roomId !== roomId)
      db.visits = db.visits.filter((v) => v.roomId !== roomId)
      db.messages = db.messages.filter((m) => m.roomId !== roomId)
      db.events = db.events.filter((e) => e.roomId !== roomId)
      write(db)
    },
    async resetLink(roomId) {
      const db = read()
      const room = ownRoom(db, roomId)
      room.slug = randomId(8)
      write(db)
      return room.slug
    },
    async visit(roomId) {
      const db = read()
      const room = db.rooms[roomId] ?? fail('room_not_found')
      const today = kstDate()
      room.todayVisits = room.todayDate === today ? room.todayVisits + 1 : 1
      room.todayDate = today
      room.totalVisits += 1
      write(db)
      return { today: room.todayVisits, total: room.totalVisits }
    },
    async becomeNeighbor(roomId) {
      const db = read()
      const room = db.rooms[roomId] ?? fail('room_not_found')
      const u = currentUser()
      if (!u || u.id === room.ownerId || !db.profiles[u.id]) return
      db.visits = db.visits.filter((v) => !(v.roomId === roomId && v.memberId === u.id))
      db.visits.unshift({ roomId, memberId: u.id, at: new Date().toISOString() })
      db.visits = db.visits.slice(0, 500)
      write(db)
    },
    async forgetNeighbor(roomId) {
      const db = read()
      const room = db.rooms[roomId]
      const u = currentUser()
      if (!room || !u || u.id === room.ownerId) return
      const ownerOf = (id: string) => db.rooms[id]?.ownerId
      db.visits = db.visits.filter(
        (v) =>
          !(v.memberId === u.id && ownerOf(v.roomId) === room.ownerId) &&
          !(v.memberId === room.ownerId && ownerOf(v.roomId) === u.id),
      )
      write(db)
    },
    async friendRooms() {
      const db = read()
      const u = currentUser()
      if (!u) return []
      const mine = new Set(Object.values(db.rooms).filter((r) => r.ownerId === u.id).map((r) => r.id))
      const latestRoomOf = (ownerId: string) =>
        Object.values(db.rooms)
          .filter((r) => r.ownerId === ownerId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      const picks: { r: StoredRoom; at: string }[] = []
      for (const v of db.visits) {
        if (v.memberId === u.id && db.rooms[v.roomId]) picks.push({ r: db.rooms[v.roomId], at: v.at })
        else if (mine.has(v.roomId)) {
          const r = latestRoomOf(v.memberId)
          if (r) picks.push({ r, at: v.at })
        }
      }
      const owners = new Set([u.id])
      return picks
        .sort((a, b) => b.at.localeCompare(a.at))
        .filter(({ r }) => (owners.has(r.ownerId) ? false : (owners.add(r.ownerId), true)))
        .slice(0, 30)
        .map(({ r, at }) => ({ room: withOwner(db, r), at }))
    },
    async neighbors(roomId) {
      const db = read()
      const room = db.rooms[roomId]
      if (!room) return []
      const latestRoomOf = (ownerId: string) =>
        Object.values(db.rooms)
          .filter((r) => r.ownerId === ownerId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      const picks: { r: StoredRoom; at: string }[] = []
      for (const v of db.visits) {
        if (v.roomId === roomId) {
          const r = latestRoomOf(v.memberId)
          if (r) picks.push({ r, at: v.at })
        } else if (v.memberId === room.ownerId && db.rooms[v.roomId]) picks.push({ r: db.rooms[v.roomId], at: v.at })
      }
      const seen = new Set([roomId])
      const owners = new Set([room.ownerId])
      return picks
        .sort((a, b) => b.at.localeCompare(a.at))
        .filter(({ r }) => {
          if (seen.has(r.id) || owners.has(r.ownerId)) return false
          seen.add(r.id)
          owners.add(r.ownerId)
          return true
        })
        .slice(0, MAX_HOUSES - 1)
        .map(({ r }) => withOwner(db, r))
    },

    async listDrops(roomId) {
      const db = read()
      const isOwner = !!db.rooms[roomId] && db.rooms[roomId].ownerId === currentUser()?.id
      return db.drops
        .filter((d) => d.roomId === roomId)
        .map((d): Drop => {
          const place = isPlace(d.place) ? d.place : 'in'
          if (place !== 'mail') return { ...d, place }
          return isOwner ? { ...d, place, hidden: false } : sealLetter({ ...d, place })
        })
    },
    async addDrop(roomId, d) {
      const db = read()
      if (!db.rooms[roomId]) fail('room_not_found')
      if (db.drops.filter((x) => x.roomId === roomId).length >= MAX_DROPS) fail('room_full')
      const drop: Drop = { ...d, place: isPlace(d.place) ? d.place : 'in', id: randomId(12), roomId, createdAt: new Date().toISOString() }
      db.drops.push(drop)
      write(db)
      return drop
    },
    async deleteDrop(roomId, dropId) {
      const db = read()
      ownRoom(db, roomId)
      db.drops = db.drops.filter((d) => !(d.id === dropId && d.roomId === roomId))
      write(db)
    },

    async listMessages(roomId) {
      return read().messages.filter((m) => m.roomId === roomId).slice(-CHAT_KEEP)
    },
    async postMessage(roomId, m) {
      const db = read()
      const room = db.rooms[roomId] ?? fail('room_not_found')
      const msg: ChatMessage = {
        id: randomId(12),
        roomId,
        name: m.name.trim(),
        body: m.body.trim(),
        owner: currentUser()?.id === room.ownerId,
        createdAt: new Date().toISOString(),
      }
      db.messages.push(msg)
      const mine = db.messages.filter((x) => x.roomId === roomId)
      if (mine.length > CHAT_KEEP) {
        const drop = new Set(mine.slice(0, mine.length - CHAT_KEEP).map((x) => x.id))
        db.messages = db.messages.filter((x) => !drop.has(x.id))
      }
      write(db)
      return msg
    },
    async deleteMessage(roomId, id) {
      const db = read()
      ownRoom(db, roomId)
      db.messages = db.messages.filter((m) => m.id !== id)
      write(db)
    },
    async countMessagesSince(roomId, since) {
      return read().messages.filter((m) => m.roomId === roomId && !m.owner && m.createdAt > since).length
    },

    async listEvents(roomId, month, key) {
      const db = read()
      const room = db.rooms[roomId]
      if (!room) return []
      const { from, to } = monthRange(month)
      return db.events
        .filter((e) => e.roomId === roomId && e.date >= from && e.date <= to && (!e.private || isOwner(room)))
        .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
        .map((e) => toEvent(e, room, key))
    },
    async addEvent(roomId, e, key) {
      const db = read()
      const room = db.rooms[roomId] ?? fail('room_not_found')
      const owner = isOwner(room)
      if (e.private && !owner) fail('forbidden')
      const today = kstDate()
      if (!dateAllowed(e.date, today)) fail('bad_date')
      const minuteAgo = new Date(Date.now() - 60_000).toISOString()
      // 꽉 참·도배 제한은 손님 일정에만 (주인은 자기 달력을 늘 쓸 수 있다)
      if (!owner) {
        const guests = db.events.filter((x) => x.roomId === roomId && !x.byOwner)
        if (guests.filter((x) => x.date >= today).length >= MAX_EVENTS) fail('calendar_full')
        if (guests.filter((x) => x.createdAt > minuteAgo).length >= ROOM_EVENTS_PER_MINUTE) fail('too_fast')
      }
      const uid = e.anon ? null : (currentUser()?.id ?? null)
      const authorKey = uid ? null : key
      const recent = db.events.filter(
        (x) => x.createdAt > minuteAgo && (uid ? x.authorId === uid : x.authorKey === authorKey),
      )
      if (recent.length >= EVENTS_PER_MINUTE) fail('too_fast')
      const ev: StoredEvent = {
        id: randomId(12),
        roomId,
        date: e.date,
        time: e.time,
        title: e.title.trim(),
        name: e.name.trim(),
        byOwner: owner && !e.anon,
        private: e.private,
        createdAt: new Date().toISOString(),
        authorId: uid,
        authorKey,
      }
      db.events.push(ev)
      write(db)
      return toEvent(ev, room, key)
    },
    async deleteEvent(roomId, id, key) {
      const db = read()
      const room = db.rooms[roomId] ?? fail('room_not_found')
      const ev = db.events.find((x) => x.id === id && x.roomId === roomId)
      if (!ev) return
      if (!toEvent(ev, room, key).mine) fail('forbidden')
      db.events = db.events.filter((x) => x !== ev && x.id !== id)
      write(db)
    },

    async listAlarms() {
      const u = currentUser()
      if (!u) return []
      return read()
        .alarms.filter((a) => a.ownerId === u.id)
        .map(({ ownerId: _o, ...a }) => a)
        .sort((a, b) => a.time.localeCompare(b.time))
    },
    async saveAlarm(input) {
      const u = needUser()
      const db = read()
      const mine = db.alarms.filter((a) => a.ownerId === u.id)
      const existing = input.id ? mine.find((a) => a.id === input.id) : undefined
      if (input.id && !existing) fail('forbidden')
      if (!existing && mine.length >= MAX_ALARMS) fail('too_many_alarms')
      const a: Alarm & { ownerId: string } = {
        id: existing?.id ?? randomId(12),
        ownerId: u.id,
        time: input.time,
        days: [...new Set(input.days)].sort(),
        label: input.label.trim(),
        enabled: input.enabled,
        nextAt: input.enabled ? new Date(nextAlarmAt(input, Date.now())).toISOString() : null,
      }
      db.alarms = existing ? db.alarms.map((x) => (x.id === a.id ? a : x)) : [...db.alarms, a]
      write(db)
      const { ownerId: _o, ...out } = a
      return out
    },
    async deleteAlarm(id) {
      const u = needUser()
      const db = read()
      db.alarms = db.alarms.filter((a) => !(a.id === id && a.ownerId === u.id))
      write(db)
    },
    async ackAlarm(id) {
      return updateAlarm(id, (a) =>
        a.days.length
          ? { ...a, nextAt: new Date(nextAlarmAt(a, Date.now())).toISOString() }
          : { ...a, enabled: false, nextAt: null },
      )
    },
    async snoozeAlarm(id, minutes) {
      return updateAlarm(id, (a) => ({ ...a, enabled: true, nextAt: new Date(Date.now() + minutes * 60_000).toISOString() }))
    },

    joinRoom: (roomId, me) => createLocalChannel(roomId, me),

    async savePush() {
      fail('push_unavailable')
    },
    async removePush() {},
    async notify() {
      // 로컬 모드는 알림을 보내지 않는다
    },
  }
}
