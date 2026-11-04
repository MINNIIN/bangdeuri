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

const TOOLS: Record<string, ToolId> = {
  counter: 'recipe',
  fridge: 'pantry',
  desk: 'timer-desk',
  microwave: 'timer-microwave',
  washer: 'timer-washer',
  turntable: 'turntable',
  calendar: 'calendar',
  alarm: 'alarm',
}

export const toolFor = (item: string): ToolId | undefined => TOOLS[item]
