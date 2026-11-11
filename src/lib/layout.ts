/**
 * 가구·아이템 배치: 방 주인이 옮기고 돌린 자리.
 * 방 꾸미기(decor) 안에 { 가구 id 또는 아이템 id: [u, v, 각도] } 로 저장한다.
 * - 집 안 물건: u, v = 집 안 좌표 (0~1)
 * - 마당 물건: u, v = 그 집 마당 좌표 (0~1)
 * 저장된 게 없으면 처음 자리(기본 가구 자리 / 친구가 놓은 자리) 그대로.
 */
export type Spot = [u: number, v: number, yaw: number]
export type Layout = Record<string, Spot>

/** 꾸미기 저장 크기(16KB)를 넘지 않게 */
export const MAX_LAYOUT = 120
const KEY = /^[A-Za-z0-9_-]{1,64}$/

const round = (n: number, k: number) => Math.round(n * k) / k
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
/** 각도를 -π ~ π 로 */
export function wrapAngle(a: number) {
  const t = Math.PI * 2
  return a - Math.round(a / t) * t
}

export const makeSpot = (u: number, v: number, yaw: number): Spot => [round(clamp01(u), 1000), round(clamp01(v), 1000), round(wrapAngle(yaw), 100)]

/** 저장소·실시간에서 받은 값을 믿지 않고 맞춘다. 쓸 게 없으면 undefined */
export function normalizeLayout(raw: unknown): Layout | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Layout = {}
  let n = 0
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_LAYOUT) break
    if (!KEY.test(k) || !Array.isArray(v) || v.length !== 3) continue
    if (!v.every((x) => typeof x === 'number' && Number.isFinite(x))) continue
    out[k] = makeSpot(v[0], v[1], v[2])
    n++
  }
  return n ? out : undefined
}

/**
 * 바꾼 자리들을 합친다. null은 처음 자리로 되돌리기.
 * keep에 없는 열쇠(치워진 아이템)는 버린다.
 */
export function mergeLayout(base: Layout | undefined, changes: Iterable<[string, Spot | null]>, keep: (key: string) => boolean): Layout | undefined {
  const next: Layout = { ...base }
  for (const [k, v] of changes) {
    if (v) next[k] = makeSpot(...v)
    else delete next[k]
  }
  for (const k of Object.keys(next)) if (!keep(k)) delete next[k]
  return normalizeLayout(next)
}
