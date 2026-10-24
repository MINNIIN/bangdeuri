import type { Room } from './types'

export const NAME_MAX = 8
export const MOTTO_MAX = 30
export const NICK_MAX = 8
export const MESSAGE_MAX = 40
export const MAX_DROPS = 40

/** 서버가 던지는 에러 코드 → 화면 문구 */
export const ERROR_TEXT: Record<string, string> = {
  room_full: '방이 꽉 찼어요. 방 주인이 정리하면 다시 놓을 수 있어요',
  room_not_found: '방을 찾을 수 없어요',
  forbidden: '방 주인만 할 수 있어요',
}

export function errorText(e: unknown): string {
  const code = e instanceof Error ? e.message : ''
  return ERROR_TEXT[code] ?? '잠깐 문제가 생겼어요. 다시 해 볼래요?'
}

/** 한국 날짜 YYYY-MM-DD */
export function kstDate(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

export const todayCount = (room: Room, now = new Date()) => (room.todayDate === kstDate(now) ? room.todayVisits : 0)

/** 글자 수는 화면에 보이는 글자 기준 (이모지 하나 = 1자) */
export const charLength = (s: string) => [...s].length
export const clip = (s: string, max: number) => [...s].slice(0, max).join('')
