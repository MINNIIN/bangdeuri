import { createLocalBackend } from './localBackend'
import { createSupabaseBackend } from './supabase'
import type { Decor } from '../art/decor'
import type { Drop, NewDrop, NewRoom, Room } from './types'

export interface Backend {
  /** 키 없이 이 브라우저에만 저장하는 모드인지 */
  local: boolean
  createRoom(input: NewRoom): Promise<{ id: string; secret: string }>
  getRoom(id: string): Promise<Room | null>
  listDrops(roomId: string): Promise<Drop[]>
  addDrop(roomId: string, drop: NewDrop): Promise<Drop>
  deleteDrop(roomId: string, secret: string, dropId: string): Promise<void>
  updateMotto(roomId: string, secret: string, motto: string): Promise<void>
  updateDecor(roomId: string, secret: string, decor: Decor): Promise<void>
  /** 방과 그 방에 놓인 아이템·방명록을 모두 지운다 (방 주인만) */
  deleteRoom(roomId: string, secret: string): Promise<void>
  visit(roomId: string): Promise<{ today: number; total: number }>
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined

export const backend: Backend = url && key ? createSupabaseBackend(url, key) : createLocalBackend()
