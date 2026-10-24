export type CharacterId = 'bob' | 'cap' | 'bear'
export type ThemeId = 'pink' | 'studio' | 'night'

export interface Room {
  id: string
  name: string
  character: CharacterId
  theme: ThemeId
  motto: string
  totalVisits: number
  todayVisits: number
  /** 한국 날짜 YYYY-MM-DD. 오늘이 아니면 todayVisits는 0으로 본다 */
  todayDate: string
  createdAt: string
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

export interface NewRoom {
  name: string
  character: CharacterId
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
