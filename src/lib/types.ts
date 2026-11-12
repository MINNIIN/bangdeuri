import type { AvatarLook } from '../art/avatar'
import type { Decor } from '../art/decor'
import type { DropPlace } from './town'

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
  /** 둔 곳: 집 안(in) · 마당(yard) · 우편함(mail). u, v는 그곳의 바닥 좌표 0~1 */
  place: DropPlace
  u: number
  v: number
  nickname: string
  message: string
  createdAt: string
  /** 남의 우편함 편지: 집 주인만 읽는다. 다른 사람에게는 무엇을 누가 넣었는지 비우고 이 표시만 준다 */
  hidden?: boolean
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
  place: DropPlace
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
  /** 친구가 달력에 일정을 적으면 */
  event: boolean
  /** 내 알람 시각이 되면 */
  alarm: boolean
}

/** 달력 일정 */
export interface CalEvent {
  id: string
  roomId: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM, 없으면 하루 종일 */
  time: string | null
  title: string
  /** 쓴 사람 이름 (익명이면 익명 이름) */
  name: string
  /** 방 주인이 쓴 일정 */
  byOwner: boolean
  /** 방 주인만 보는 일정 */
  private: boolean
  /** 내가 지울 수 있는 일정 (방 주인이거나 내가 쓴 것) */
  mine: boolean
  createdAt: string
}

export interface NewEvent {
  date: string
  time: string | null
  title: string
  name: string
  /** 정체를 숨기고 썼는지 (계정을 남기지 않는다) */
  anon: boolean
  private: boolean
}
