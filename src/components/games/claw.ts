/**
 * 집게왕 인형뽑기 — 화면과 상관없는 순수 로직 (잡기 확률 · 인형 더미 · 점수 · 한마디).
 * 좌표: 유리장 안쪽 너비 = 1, 위 레일 y = 0, 바닥 y = FLOOR. 상품 구멍은 왼쪽 (x < CHUTE_EDGE).
 */

export type PlushKind = 'bear' | 'bunny' | 'chick' | 'cat' | 'penguin' | 'star' | 'gold'

export const PLUSH_INFO: Record<PlushKind, { name: string; points: number; weight: number }> = {
  bear: { name: '곰돌이', points: 100, weight: 0.06 },
  bunny: { name: '토끼', points: 100, weight: 0.04 },
  chick: { name: '병아리', points: 80, weight: 0.02 },
  cat: { name: '고양이', points: 120, weight: 0.06 },
  penguin: { name: '펭귄', points: 120, weight: 0.08 },
  star: { name: '별 쿠션', points: 150, weight: 0.1 },
  gold: { name: '황금곰', points: 500, weight: 0.16 },
}

const NORMAL: PlushKind[] = ['bear', 'bunny', 'chick', 'cat', 'penguin', 'star']

/** 바닥 높이 (유리장 안쪽 너비 = 1 기준) */
export const FLOOR = 1.25
/** 상품 구멍 칸막이 오른쪽 끝 — 이보다 왼쪽에 떨어지면 상품! */
export const CHUTE_EDGE = 0.24
/** 집게가 쉬는 자리 (상품 구멍 위) */
export const HOME_X = CHUTE_EDGE / 2
/** 한 판 = 동전 3개 */
export const COINS = 3

export interface Plush {
  id: number
  kind: PlushKind
  x: number
  y: number
  r: number
  /** 0 = 뒷줄(작고 어둡게) · 1 = 앞줄 */
  depth: number
  /** 기울기 (라디안) */
  tilt: number
}

/** 씨앗 있는 난수 (0~1) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 집게 중심이 인형 중심에서 offset만큼 벗어났을 때 잡을 확률 (reach = 닿는 반폭) */
export function gripChance(offset: number, reach: number): number {
  const k = Math.abs(offset) / reach
  if (k >= 1) return 0
  return 0.95 * Math.pow(1 - k * k, 1.5)
}

/**
 * 잡기 굴림: 1번째 난수 = 잡나, 2번째 = 끝까지 버티나, 3번째 = 놓친다면 어디서(옮기는 진행 0~1).
 * weight가 클수록(무거울수록) 잘 미끄러진다.
 */
export function rollGrab(offset: number, reach: number, weight: number, rand: () => number): { grabbed: boolean; slipAt: number | null } {
  const chance = gripChance(offset, reach)
  if (!(rand() < chance)) return { grabbed: false, slipAt: null }
  const hold = chance * 0.82 - weight
  if (rand() < hold) return { grabbed: true, slipAt: null }
  return { grabbed: true, slipAt: 0.15 + rand() * 0.7 }
}

type Body = { x: number; y: number; r: number }

/** x에 떨어진 반지름 r 인형이 멈추는 높이 (다른 인형 위에 얹히거나 바닥) */
export function restY(x: number, r: number, others: Body[], floor = FLOOR): number {
  let y = floor - r
  for (const o of others) {
    const dx = Math.abs(x - o.x)
    const d = r + o.r
    if (dx < d) y = Math.min(y, o.y - Math.sqrt(d * d - dx * dx))
  }
  return y
}

/** 집게 아래 닿는 인형 중 가장 위에 있는 것 */
export function pickTarget<T extends Body>(pile: T[], clawX: number, reach: number): T | null {
  let best: T | null = null
  for (const p of pile) {
    if (Math.abs(p.x - clawX) >= reach + p.r * 0.6) continue
    if (!best || p.y - p.r < best.y - best.r) best = p
  }
  return best
}

/** 인형 더미 만들기: 뒷줄 5 · 앞줄 5 · 위에 3~4 */
export function makePile(rand: () => number): Plush[] {
  const out: Plush[] = []
  let gold = false
  let id = 1
  const kind = (): PlushKind => {
    if (!gold && rand() < 0.07) {
      gold = true
      return 'gold'
    }
    return NORMAL[Math.floor(rand() * NORMAL.length) % NORMAL.length]
  }
  const lo = CHUTE_EDGE + 0.01
  const put = (x: number, r: number, depth: number, y?: number) => {
    const cx = Math.max(lo + r + 0.001, Math.min(1 - r, x))
    // 위에 얹는 건 바닥 두 줄에만 기댄다 (탑처럼 쌓이지 않게)
    out.push({ id: id++, kind: kind(), x: cx, y: y ?? restY(cx, r, out.slice(0, 10)), r, depth, tilt: (rand() - 0.5) * 0.5 })
  }
  // 뒷줄: 멀리 있어서 작고 조금 위에 보인다
  for (let i = 0; i < 5; i++) {
    const r = 0.07 + rand() * 0.014
    put(0.34 + i * 0.14 + (rand() - 0.5) * 0.03, r, 0, FLOOR - r - 0.14)
  }
  // 앞줄: 크고 바닥에
  for (let i = 0; i < 5; i++) {
    const r = 0.086 + rand() * 0.016
    put(0.36 + i * 0.137 + (rand() - 0.5) * 0.025, r, 1, FLOOR - r)
  }
  // 위에 얹힌 것들
  const tops = 3 + Math.floor(rand() * 2)
  for (let i = 0; i < tops; i++) put(0.36 + ((i + rand() * 0.8) / tops) * 0.56, 0.072 + rand() * 0.014, 0.6)
  return out
}

export function prizeScore(kinds: PlushKind[]): number {
  return kinds.reduce((s, k) => s + PLUSH_INFO[k].points, 0)
}

/** 판이 끝나면 미니미가 할 한마디 (20자 미만) */
export function resultLine(kinds: PlushKind[]): string {
  if (kinds.length === 0) return '오늘은 집게가 약하네…'
  if (kinds.includes('gold')) return kinds.length > 1 ? `황금곰까지 ${kinds.length}개 뽑았다!!` : '황금곰 뽑았다!!'
  if (kinds.length === 1) return `${PLUSH_INFO[kinds[0]].name} 뽑았다!!`
  if (kinds.length === 3) return '싹쓸이! 3개 다 뽑았다!!'
  return `인형 ${kinds.length}개나 뽑았다!!`
}
