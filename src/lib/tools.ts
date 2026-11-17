import type { GameId } from '../components/games/kit'
/** 가구를 진짜로 쓰는 도구: 미니미가 가구에 도착하면 이 도구 창이 열린다 */
export type ToolId =
  | 'recipe'
  | 'pantry'
  | 'timer-desk'
  | 'timer-microwave'
  | 'timer-washer'
  | 'turntable'
  | 'calendar'
  | 'alarm'
  | 'cafe'

const TOOLS: Record<string, ToolId> = {
  counter: 'recipe',
  fridge: 'pantry',
  desk: 'timer-desk',
  microwave: 'timer-microwave',
  washer: 'timer-washer',
  turntable: 'turntable',
  calendar: 'calendar',
  alarm: 'alarm',
  cf_order: 'cafe',
}

export const toolFor = (item: string): ToolId | undefined => TOOLS[item]

/** 오락실·PC방 기계에 도착하면 열리는 미니게임 */
const GAMES: Record<string, GameId> = {
  ar_claw: 'claw',
  ar_punch: 'punch',
  ar_race: 'race',
  ar_rhythm: 'rhythm',
  pc_seat: 'space',
}

export const gameFor = (item: string): GameId | undefined => GAMES[item]
