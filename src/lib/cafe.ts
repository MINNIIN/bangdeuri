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
  /** 컵이 있는 곳: 커피 머신 추출구 아래 · 뒷선반(그 단계 자리) · 픽업대 */
  place: 'spout' | 'shelf' | 'counter'
}

export interface BrewStep {
  at: Station
  ms: number
  line: string
  cup: CupState
  /** 이 단계에서 컵이 차오르는 구간 (단계 진행 0~1 중) — 줄기가 흐르는 동안만 차오른다 */
  win?: [number, number]
}

/**
 * 그 음료를 만드는 순서 (바리스타가 서는 곳 · 걸리는 시간 · 혼잣말 · 끝난 뒤 컵 모습).
 * 진짜 카페 순서: 원두 갈기 → 다지기(탬핑) → 에스프레소 추출 → (우유 스팀 / 얼음 + 차가운 우유 / 시럽) → 픽업대
 */
export function brewSteps(d: Drink): BrewStep[] {
  const out: BrewStep[] = []
  let fill = 0
  const shotColor = '#3a1f12'
  if (d.espresso) {
    out.push({ at: 'grinder', ms: 3200, line: '드르륵~ 원두 갈고, 꾹꾹 다지기', cup: { place: 'shelf' } })
    fill = d.milk ? 0.28 : 0.32
    out.push({ at: 'machine', ms: 3600, line: '에스프레소 추출 중… 크레마 좋다', cup: { place: 'spout', fill, color: shotColor }, win: [0.25, 0.95] })
  }
  if (d.syrup) {
    fill = Math.max(fill, 0.22)
    out.push({
      at: 'syrup',
      ms: 2200,
      line: d.id === 'strawberry' ? '딸기 청 듬뿍~' : d.id === 'matcha' ? '말차 소스 쭈욱~' : '초코 소스 쭈욱~',
      cup: { place: 'shelf', fill, syrup: 0.22, color: d.syrup },
      win: [0.2, 0.68],
    })
  }
  if (d.iced) {
    out.push({ at: 'ice', ms: 3000, line: d.milk ? '얼음 퐁당퐁당, 차가운 우유 콸콸' : '얼음 퐁당퐁당, 시원한 물 콸콸', cup: { place: 'shelf', ice: true, fill: 0.9, color: d.color }, win: [0.58, 0.9] })
  } else if (d.milk) {
    out.push({ at: 'steam', ms: 3600, line: '치이익~ 우유 거품 내서 살살 붓기', cup: { place: 'shelf', fill: 0.92, color: d.color, top: d.top }, win: [0.74, 0.98] })
  } else {
    out.push({ at: 'machine', ms: 2000, line: '뜨거운 물 조르륵', cup: { place: 'spout', fill: 0.88, color: d.color, top: d.top }, win: [0.25, 0.95] })
  }
  if (d.top === 'cream' && d.iced) out.push({ at: 'steam', ms: 1200, line: '크림 몽글몽글 올리기', cup: { place: 'shelf', top: 'cream' } })
  out.push({ at: 'pickup', ms: 2000, line: `주문하신 ${d.name} 나왔습니다~`, cup: { place: 'counter' } })
  // 너무 짧으면 마무리 손질을 더한다
  const total = out.reduce((t, s) => t + s.ms, 0)
  if (total < 8000) out.splice(out.length - 1, 0, { at: 'syrup', ms: 8000 - total, line: '뚜껑 꾹, 빨대 콕', cup: { place: 'shelf' } })
  return out
}

/** 다 마시기까지 홀짝이는 횟수 */
export const SIPS = 6
