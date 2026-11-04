import { normalizeLook } from '../art/avatar'
import { defaultDecor, normalizeDecor } from '../art/decor'
import type { Backend } from './backend'
import { createLocalChannel } from './realtime'
import { EVENTS_PER_MINUTE, MAX_EVENTS, monthRange } from './calendar'
import { CHAT_KEEP, kstDate, MAX_DROPS } from './rules'
import type { AuthUser, CalEvent, ChatMessage, Drop, Profile, Room } from './types'

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
      if (raw) return { accounts: {}, profiles: {}, rooms: {}, drops: [], messages: [], events: [], ...JSON.parse(raw) }
    } catch {
      // 깨진 데이터면 새로 시작
    }
    return { accounts: {}, profiles: {}, rooms: {}, drops: [], messages: [], events: [] }
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

    async listDrops(roomId) {
      return read().drops.filter((d) => d.roomId === roomId)
    },
    async addDrop(roomId, d) {
      const db = read()
      if (!db.rooms[roomId]) fail('room_not_found')
      if (db.drops.filter((x) => x.roomId === roomId).length >= MAX_DROPS) fail('room_full')
      const drop: Drop = { ...d, id: randomId(12), roomId, createdAt: new Date().toISOString() }
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
      if (db.events.filter((x) => x.roomId === roomId && x.date >= today).length >= MAX_EVENTS) fail('calendar_full')
      const uid = e.anon ? null : (currentUser()?.id ?? null)
      const authorKey = uid ? null : key
      const minuteAgo = new Date(Date.now() - 60_000).toISOString()
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
