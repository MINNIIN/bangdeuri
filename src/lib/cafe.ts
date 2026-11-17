/**
 * 카페 방들이 메뉴와 바리스타가 음료를 만드는 순서.
 * 주문하면 바리스타가 그라인더 → 커피 머신 → 스팀 → … → 픽업대 순서로 걸어가며 진짜로 만들어 준다 (World가 이 순서대로 움직인다).
 */

export type Station = 'grinder' | 'machine' | 'steam' | 'syrup' | 'ice' | 'pickup'

export interface Drink {
  id: string
  name: string
  /** 메뉴판 한 줄 */
  desc: string
  price: number
  iced: boolean
  /** 다 만든 음료 색 */
  color: string
  /** 컵 바닥에 깔리는 시럽 (딸기 · 초코) */
  syrup?: string
  /** 위에 올리는 것: 라떼 아트 · 휘핑 크림 · 우유 거품 */
  top?: 'art' | 'cream' | 'foam'
  espresso: boolean
  milk: boolean
}

export const DRINKS: Drink[] = [
  { id: 'ice_americano', name: '아이스 아메리카노', desc: '얼음 가득, 시원하게', price: 3500, iced: true, color: '#5a3320', espresso: true, milk: false },
  { id: 'hot_americano', name: '따뜻한 아메리카노', desc: '고소한 오늘의 원두', price: 3500, iced: false, color: '#4a2a1a', espresso: true, milk: false, top: 'foam' },
  { id: 'latte', name: '카페 라떼', desc: '하트 라떼 아트', price: 4500, iced: false, color: '#c89a6c', espresso: true, milk: true, top: 'art' },
  { id: 'ice_latte', name: '아이스 라떼', desc: '우유와 샷이 층층이', price: 4500, iced: true, color: '#d8b48c', espresso: true, milk: true },
  { id: 'cloud', name: '구름 크림 라떼', desc: '폭신한 크림이 듬뿍', price: 5500, iced: false, color: '#c08b5c', espresso: true, milk: true, top: 'cream' },
  { id: 'strawberry', name: '딸기 라떼', desc: '생딸기 청 + 우유', price: 5000, iced: true, color: '#ffc4d6', syrup: '#ff4f6d', espresso: false, milk: true },
  { id: 'choco', name: '핫초코', desc: '진한 초코 + 휘핑', price: 4500, iced: false, color: '#7a4a2e', syrup: '#4a2414', espresso: false, milk: true, top: 'cream' },
  { id: 'matcha', name: '녹차 라떼', desc: '쌉싸름 달콤', price: 5000, iced: true, color: '#9ccc78', syrup: '#4f8a3a', espresso: false, milk: true },
]

export const drinkOf = (id: string) => DRINKS.find((d) => d.id === id)

/** 컵이 지금 어떤 모습이 되는지 (이 단계가 끝날 때) */
export interface CupState {
  /** 0~1 채운 양 */
  fill?: number
  /** 지금 음료 색 */
  color?: string
  /** 바닥 시럽 두께 (0~1) */
  syrup?: number
  ice?: boolean
  top?: Drink['top']
  /** 컵이 있는 곳: 커피 머신 추출구 아래 · 바리스타 손 · 뒷선반 · 픽업대 */
  place: 'spout' | 'hand' | 'shelf' | 'counter'
}

export interface BrewStep {
  at: Station
  ms: number
  line: string
  cup: CupState
}

/** 그 음료를 만드는 순서 (바리스타가 걸어가 서는 곳 · 걸리는 시간 · 혼잣말 · 끝난 뒤 컵 모습) */
export function brewSteps(d: Drink): BrewStep[] {
  const out: BrewStep[] = []
  let fill = 0
  const shotColor = '#3a1f12'
  if (d.espresso) {
    out.push({ at: 'grinder', ms: 1800, line: '드르륵~ 원두 가는 중', cup: { place: 'shelf' } })
    fill = d.milk ? 0.3 : 0.35
    out.push({ at: 'machine', ms: 2800, line: '에스프레소 추출 중… 크레마 좋다', cup: { place: 'spout', fill, color: shotColor } })
  }
  if (d.syrup) {
    fill = Math.max(fill, 0.22)
    out.push({ at: 'syrup', ms: 2000, line: d.id === 'strawberry' ? '딸기 청 듬뿍~' : d.id === 'matcha' ? '말차 가루 사르르' : '초코 소스 쭈욱~', cup: { place: 'shelf', fill, syrup: 0.22, color: d.syrup } })
  }
  if (d.iced) {
    // 얼음 + (우유 또는 물) 붓기
    out.push({ at: 'ice', ms: 2400, line: d.milk ? '얼음 넣고 차가운 우유 콸콸' : '얼음 가득~ 물 붓고', cup: { place: 'shelf', ice: true, fill: 0.9, color: d.color } })
  } else if (d.milk) {
    out.push({ at: 'steam', ms: 2800, line: '치이익~ 우유 거품 내는 중', cup: { place: 'hand', fill: 0.92, color: d.color, top: d.top } })
  } else {
    out.push({ at: 'machine', ms: 1600, line: '뜨거운 물 조르륵', cup: { place: 'spout', fill: 0.88, color: d.color, top: d.top } })
  }
  if (d.top === 'cream' && d.iced) out.push({ at: 'steam', ms: 1200, line: '크림 몽글몽글 올리기', cup: { place: 'hand', top: 'cream' } })
  out.push({ at: 'pickup', ms: 1800, line: `주문하신 ${d.name} 나왔습니다~`, cup: { place: 'counter' } })
  // 너무 짧으면 마무리 손질을 더한다
  const total = out.reduce((t, s) => t + s.ms, 0)
  if (total < 8000) out.splice(out.length - 1, 0, { at: 'syrup', ms: 8000 - total, line: '뚜껑 꾹, 빨대 콕', cup: { place: 'hand' } })
  return out
}

/** 다 마시기까지 홀짝이는 횟수 */
export const SIPS = 6
