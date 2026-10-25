import type { Backend } from './backend'
import { kstDate, MAX_DROPS } from './rules'
import type { Drop, Room } from './types'

/**
 * Supabase 키가 없을 때 쓰는 가짜 DB. 같은 브라우저 localStorage에 저장한다.
 * 링크를 다른 기기로 보내면 안 열리지만, 혼자서 전체 흐름을 테스트할 수 있다.
 */
const DB_KEY = 'bangdeuri:localdb'

type StoredRoom = Room & { secret: string }

interface LocalDb {
  rooms: Record<string, StoredRoom>
  drops: Drop[]
}

const randomId = (len: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(len)), (b) => (b % 36).toString(36)).join('')

const publicRoom = (room: StoredRoom): Room => {
  const copy: Partial<StoredRoom> = { ...room }
  delete copy.secret
  return copy as Room
}

export function createLocalBackend(storage: Storage = localStorage): Backend {
  const read = (): LocalDb => {
    try {
      const raw = storage.getItem(DB_KEY)
      if (raw) return JSON.parse(raw) as LocalDb
    } catch {
      // 깨진 데이터면 새로 시작
    }
    return { rooms: {}, drops: [] }
  }
  const write = (db: LocalDb) => storage.setItem(DB_KEY, JSON.stringify(db))

  return {
    local: true,
    async createRoom(input) {
      const db = read()
      const id = randomId(8)
      const secret = randomId(24)
      db.rooms[id] = {
        ...input,
        id,
        secret,
        totalVisits: 0,
        todayVisits: 0,
        todayDate: kstDate(),
        createdAt: new Date().toISOString(),
      }
      write(db)
      return { id, secret }
    },
    async getRoom(id) {
      const room = read().rooms[id]
      return room ? publicRoom(room) : null
    },
    async listDrops(roomId) {
      return read().drops.filter((d) => d.roomId === roomId)
    },
    async addDrop(roomId, d) {
      const db = read()
      if (!db.rooms[roomId]) throw new Error('room_not_found')
      if (db.drops.filter((x) => x.roomId === roomId).length >= MAX_DROPS) throw new Error('room_full')
      const drop: Drop = { ...d, id: randomId(12), roomId, createdAt: new Date().toISOString() }
      db.drops.push(drop)
      write(db)
      return drop
    },
    async deleteDrop(roomId, secret, dropId) {
      const db = read()
      if (db.rooms[roomId]?.secret !== secret) throw new Error('forbidden')
      db.drops = db.drops.filter((d) => !(d.id === dropId && d.roomId === roomId))
      write(db)
    },
    async updateMotto(roomId, secret, motto) {
      const db = read()
      const room = db.rooms[roomId]
      if (room?.secret !== secret) throw new Error('forbidden')
      room.motto = motto
      write(db)
    },
    async visit(roomId) {
      const db = read()
      const room = db.rooms[roomId]
      if (!room) throw new Error('room_not_found')
      const today = kstDate()
      room.todayVisits = room.todayDate === today ? room.todayVisits + 1 : 1
      room.todayDate = today
      room.totalVisits += 1
      write(db)
      return { today: room.todayVisits, total: room.totalVisits }
    },
  }
}
