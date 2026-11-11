import type { AvatarLook } from '../art/avatar'
import type { Decor } from '../art/decor'
import type { Alarm } from './alarm'
import { createLocalBackend } from './localBackend'
import type { Peer, RoomChannel } from './realtime'
import { createSupabaseBackend } from './supabase'
import type { AuthUser, CalEvent, ChatMessage, Drop, NewDrop, NewEvent, NewRoom, Profile, PushPrefs, Room } from './types'

export type SocialProvider = 'kakao' | 'google'

export interface Backend {
  /** 키 없이 이 브라우저에만 저장하는 모드인지 (혼자 테스트용) */
  local: boolean

  // ─── 회원 ───
  getUser(): Promise<AuthUser | null>
  onAuthChange(cb: (user: AuthUser | null) => void): () => void
  /** 카카오·구글 로그인 페이지로 이동한다. 돌아오면 onAuthChange로 알 수 있다 */
  signInWith(provider: SocialProvider): Promise<void>
  signUpEmail(email: string, password: string): Promise<void>
  signInEmail(email: string, password: string): Promise<void>
  resetPassword(email: string): Promise<void>
  signOut(): Promise<void>

  // ─── 내 프로필 (닉네임·미니미) ───
  getProfile(): Promise<Profile | null>
  saveProfile(p: { nickname: string; look: AvatarLook }): Promise<Profile>

  // ─── 방 (만들기·고치기는 방 주인 회원만) ───
  createRoom(input: NewRoom): Promise<Room>
  myRooms(): Promise<Room[]>
  getRoom(slug: string): Promise<Room | null>
  updateMotto(roomId: string, motto: string): Promise<void>
  updateDecor(roomId: string, decor: Decor): Promise<void>
  /** 방과 그 방의 아이템·방명록·채팅을 모두 지운다 */
  deleteRoom(roomId: string): Promise<void>
  /** 링크를 새로 만든다. 예전 링크로는 더 못 들어온다. 새 주소를 돌려준다 */
  resetLink(roomId: string): Promise<string>
  visit(roomId: string): Promise<{ today: number; total: number }>
  /**
   * 동네 이웃: 이 방에 놀러 온 적 있는 회원들의 방 + 이 방 주인이 놀러 간 방 (최근 순, 이 방 빼고).
   * 회원이 내 이름으로 방에 들어가면(becomeNeighbor) 서로 이웃이 된다
   */
  neighbors(roomId: string): Promise<Room[]>
  /** 로그인한 회원이 내 이름으로 이 방에 들어왔다 (익명이면 부르지 않는다) */
  becomeNeighbor(roomId: string): Promise<void>

  // ─── 아이템·방명록 (놓기는 누구나, 치우기는 방 주인) ───
  listDrops(roomId: string): Promise<Drop[]>
  addDrop(roomId: string, drop: NewDrop): Promise<Drop>
  deleteDrop(roomId: string, dropId: string): Promise<void>

  // ─── 채팅 기록 (쓰기는 누구나, 지우기는 방 주인) ───
  listMessages(roomId: string): Promise<ChatMessage[]>
  postMessage(roomId: string, m: { name: string; body: string }): Promise<ChatMessage>
  deleteMessage(roomId: string, id: string): Promise<void>
  /** 이 시각 뒤에 손님들이 쓴 말 수 */
  countMessagesSince(roomId: string, sinceIso: string): Promise<number>

  // ─── 달력 (쓰기는 누구나, 나만 보기는 주인만, 지우기는 주인과 쓴 사람) ───
  /** key: 이 기기 비밀 키 (익명으로 쓴 일정을 내가 쓴 건지 확인) */
  listEvents(roomId: string, month: string, key: string): Promise<CalEvent[]>
  addEvent(roomId: string, e: NewEvent, key: string): Promise<CalEvent>
  deleteEvent(roomId: string, id: string, key: string): Promise<void>

  // ─── 알람 (로그인한 내 것만) ───
  listAlarms(): Promise<Alarm[]>
  /** id가 있으면 고치고 없으면 만든다. 다음 울릴 시각은 저장소가 계산한다 */
  saveAlarm(a: Omit<Alarm, 'id' | 'nextAt'> & { id?: string }): Promise<Alarm>
  deleteAlarm(id: string): Promise<void>
  /** 울린 뒤: 반복이면 다음 시각으로, 한 번짜리면 끈다 */
  ackAlarm(id: string): Promise<Alarm>
  snoozeAlarm(id: string, minutes: number): Promise<Alarm>

  // ─── 실시간 ───
  joinRoom(roomId: string, me: Peer): RoomChannel

  // ─── 푸시 알림 ───
  savePush(sub: PushSubscriptionJSON, prefs: PushPrefs): Promise<void>
  removePush(endpoint: string): Promise<void>
  /** 방 주인에게 알림을 보낸다 (주인이 켜 둔 알림만 간다) */
  notify(roomId: string, n: { kind: 'enter' | 'drop' | 'event'; name: string; item?: string }): Promise<void>
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined

export const backend: Backend = url && key ? createSupabaseBackend(url, key) : createLocalBackend()
