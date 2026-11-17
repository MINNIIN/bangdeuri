/**
 * 동네에서 저절로 움직이는 것: 지나가는 버스 · 골목을 어슬렁거리는 고양이.
 * 네트워크로 주고받지 않고 "지금 시각"으로 자리를 계산한다 → 같은 시각이면 모든 화면에서 같은 자리.
 */
import { findTownPath, nearestOpen, type TownMap, type Vec2 } from './town'

// ─── 버스 ───

/** 버스가 한 번 지나가는 간격 (ms) · 지나가는 데 걸리는 시간 (ms) */
export const BUS_PERIOD = 120_000
export const BUS_RUN = 16_000
/** 버스정류장 자리 (큰길 남쪽 인도) */
export const BUS_STOP: Vec2 = { x: -9, z: 5.75 }

/** 지금 버스가 어디쯤인지 (0 = 서쪽 끝에서 출발 ~ 1 = 동쪽 끝 도착). 안 다니는 때면 null */
export function busPhase(nowMs: number): number | null {
  const t = ((nowMs % BUS_PERIOD) + BUS_PERIOD) % BUS_PERIOD
  return t < BUS_RUN ? t / BUS_RUN : null
}

/** 버스 움직임: 0~0.4 정류장까지 오면서 천천히 서고, 0.4~0.6 서 있다가, 0.6~1 다시 떠난다 → 출발점에서 정류장까지 비율 (0~1 정류장, 1~2 정류장 너머) */
export function busProgress(p: number): number {
  if (p < 0.4) {
    const k = p / 0.4
    return 1 - (1 - k) * (1 - k)
  }
  if (p < 0.6) return 1
  const k = (p - 0.6) / 0.4
  return 1 + k * k
}

// ─── 고양이 ───

/** 고양이 두 마리 (같은 길을 반 바퀴씩 떨어져 돈다) */
export const CAT_SEEDS = [0, 1] as const
/** 걷는 빠르기 (m/s) · 들를 곳마다 쉬는 시간 (s) */
const CAT_SPEED = 0.8
const CAT_REST = 20

/** 고양이가 들르는 곳: 뒷골목 · 샛길 · 인도 · 공원 (막힌 데면 가까운 열린 곳으로) */
const CAT_STOPS: Vec2[] = [
  { x: 3, z: -19 },
  { x: 21.5, z: -27 },
  { x: 33, z: -35 },
  { x: 8, z: -35.5 },
  { x: -21.5, z: -30 },
  { x: -40, z: -19 },
  { x: -21.5, z: -9 },
  { x: -7, z: 9.5 },
  { x: 9, z: -4.3 },
]

export interface CatPoint extends Vec2 {
  /** 들러서 쉬는 곳 */
  stop: boolean
}

/** 고양이가 도는 길 (들를 곳들을 골목 길찾기로 이은 고리) */
export function catRoute(map: TownMap): CatPoint[] {
  const stops = CAT_STOPS.map((p) => nearestOpen(map, p))
  const out: CatPoint[] = []
  for (let i = 0; i < stops.length; i++) {
    const a = stops[i]
    const b = stops[(i + 1) % stops.length]
    out.push({ ...a, stop: true })
    const path = findTownPath(map, a, b)
    for (const p of path.slice(0, -1)) out.push({ ...p, stop: false })
  }
  return out
}

interface Timeline {
  /** 점마다: 그 점에 닿는 시각 · 그 점에서 떠나는 시각 (s) */
  arrive: number[]
  leave: number[]
  total: number
}
const timelines = new WeakMap<CatPoint[], Timeline>()

function timeline(route: CatPoint[]): Timeline {
  let tl = timelines.get(route)
  if (!tl) {
    const arrive: number[] = []
    const leave: number[] = []
    let t = 0
    route.forEach((p, i) => {
      if (i > 0) t += Math.hypot(p.x - route[i - 1].x, p.z - route[i - 1].z) / CAT_SPEED
      arrive.push(t)
      if (p.stop) t += CAT_REST
      leave.push(t)
    })
    const last = route[route.length - 1]
    t += Math.hypot(route[0].x - last.x, route[0].z - last.z) / CAT_SPEED
    tl = { arrive, leave, total: t }
    timelines.set(route, tl)
  }
  return tl
}

/** 지금 고양이 자리 · 보는 쪽 · 쉬는 중인지 */
export function catAt(route: CatPoint[], nowMs: number, seed: number): { pos: Vec2; yaw: number; nap: boolean } {
  const tl = timeline(route)
  const n = route.length
  let t = (nowMs / 1000 + seed * tl.total * 0.5) % tl.total
  if (t < 0) t += tl.total
  for (let i = 0; i < n; i++) {
    const p = route[i]
    const q = route[(i + 1) % n]
    const yaw = Math.atan2(q.x - p.x, q.z - p.z)
    if (t < tl.arrive[i]) continue
    if (t < tl.leave[i]) return { pos: { x: p.x, z: p.z }, yaw, nap: true }
    const end = i + 1 < n ? tl.arrive[i + 1] : tl.total
    if (t < end) {
      const k = (t - tl.leave[i]) / Math.max(1e-6, end - tl.leave[i])
      return { pos: { x: p.x + (q.x - p.x) * k, z: p.z + (q.z - p.z) * k }, yaw, nap: false }
    }
  }
  return { pos: { x: route[0].x, z: route[0].z }, yaw: 0, nap: true }
}
