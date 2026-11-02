import type { AvatarLook } from '../art/avatar'
import type { Decor } from '../art/decor'

export type ThemeId = 'pink' | 'studio' | 'night'

/** 로그인한 회원 */
export interface AuthUser {
  id: string
  email?: string
}

/** 회원의 닉네임과 직접 만든 미니미 */
export interface Profile {
  id: string
  nickname: string
  look: AvatarLook
}

export interface Room {
  /** 안 바뀌는 방 번호 (아이템·채팅이 여기에 붙는다) */
  id: string
  /** 링크에 쓰는 주소. 방 주인이 링크를 새로 만들면 바뀐다 */
  slug: string
  ownerId: string
  name: string
  theme: ThemeId
  motto: string
  totalVisits: number
  todayVisits: number
  /** 한국 날짜 YYYY-MM-DD. 오늘이 아니면 todayVisits는 0으로 본다 */
  todayDate: string
  createdAt: string
  /** 방 주인이 꾸민 벽·바닥 (저장소에서 읽을 때 항상 안전한 값으로 맞춰 둔다) */
  decor: Decor
  /** 방 주인의 닉네임·미니미 */
  owner: { nickname: string; look: AvatarLook }
}

export interface Drop {
  id: string
  roomId: string
  item: string
  u: number
  v: number
  nickname: string
  message: string
  createdAt: string
}

export interface ChatMessage {
  id: string
  roomId: string
  name: string
  body: string
  /** 방 주인이 쓴 말인지 (서버가 정한다) */
  owner: boolean
  createdAt: string
}

export interface NewRoom {
  name: string
  theme: ThemeId
  motto: string
}

export interface NewDrop {
  item: string
  u: number
  v: number
  nickname: string
  message: string
}

export interface PushPrefs {
  /** 친구가 들어오면 */
  enter: boolean
  /** 친구가 물건을 두고 가면 */
  drop: boolean
}
