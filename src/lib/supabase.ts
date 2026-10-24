import type { Backend } from './backend'
import type { CharacterId, Drop, Room, ThemeId } from './types'

interface RoomRow {
  id: string
  name: string
  character: CharacterId
  theme: ThemeId
  motto: string
  total_visits: number
  today_visits: number
  today_date: string
  created_at: string
}

interface DropRow {
  id: string
  room_id: string
  item: string
  u: number
  v: number
  nickname: string
  message: string
  created_at: string
}

const ROOM_COLUMNS = 'id,name,character,theme,motto,total_visits,today_visits,today_date,created_at'

export const toRoom = (r: RoomRow): Room => ({
  id: r.id,
  name: r.name,
  character: r.character,
  theme: r.theme,
  motto: r.motto,
  totalVisits: r.total_visits,
  todayVisits: r.today_visits,
  todayDate: r.today_date,
  createdAt: r.created_at,
})

export const toDrop = (r: DropRow): Drop => ({
  id: r.id,
  roomId: r.room_id,
  item: r.item,
  u: r.u,
  v: r.v,
  nickname: r.nickname,
  message: r.message,
  createdAt: r.created_at,
})

/** SDK 없이 PostgREST를 fetch로 직접 부른다. 쓰기는 전부 RPC 함수 */
export function createSupabaseBackend(baseUrl: string, key: string): Backend {
  const base = baseUrl.replace(/\/$/, '')
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' }
  // 예전 anon 키(JWT)는 Authorization에도 넣고, 새 publishable 키(sb_...)는 apikey만 보낸다
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${base}/rest/v1/${path}`, { ...init, headers })
    const text = await res.text()
    const body = text ? JSON.parse(text) : null
    if (!res.ok) throw new Error((body && body.message) || `http_${res.status}`)
    return body as T
  }

  const rpc = <T>(fn: string, args: Record<string, unknown>) =>
    request<T>(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })

  return {
    local: false,
    createRoom: (input) =>
      rpc('create_room', {
        p_name: input.name,
        p_character: input.character,
        p_theme: input.theme,
        p_motto: input.motto,
      }),
    async getRoom(id) {
      const rows = await request<RoomRow[]>(`rooms?id=eq.${encodeURIComponent(id)}&select=${ROOM_COLUMNS}`)
      return rows[0] ? toRoom(rows[0]) : null
    },
    async listDrops(roomId) {
      const rows = await request<DropRow[]>(
        `drops?room_id=eq.${encodeURIComponent(roomId)}&select=*&order=created_at.asc`,
      )
      return rows.map(toDrop)
    },
    async addDrop(roomId, d) {
      const row = await rpc<DropRow>('add_drop', {
        p_room: roomId,
        p_item: d.item,
        p_u: d.u,
        p_v: d.v,
        p_nickname: d.nickname,
        p_message: d.message,
      })
      return toDrop(row)
    },
    async deleteDrop(roomId, secret, dropId) {
      await rpc('delete_drop', { p_room: roomId, p_secret: secret, p_drop: dropId })
    },
    async updateMotto(roomId, secret, motto) {
      await rpc('update_room', { p_room: roomId, p_secret: secret, p_motto: motto })
    },
    visit: (roomId) => rpc('visit_room', { p_room: roomId }),
  }
}
