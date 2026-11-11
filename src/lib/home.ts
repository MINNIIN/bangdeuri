/**
 * 집 구조: 바닥 좌표 0~1 한 장을 낮은 칸막이벽으로 나눈 투룸 + 화장실.
 *
 *            (뒤)
 *      작은방 벽 ╱╲ 안방 벽
 *            ╱ 거실 ╲
 *    작은방 ╱╲      ╱╲ 안방
 *          ╲  현관·주방  ╱
 *            ╲ 화장실 ╱
 *            (앞)
 *
 * u축이 오른쪽 아래(안방 쪽), v축이 왼쪽 아래(작은방 쪽).
 */

export type UV = { u: number; v: number }

export type ZoneId = 'living' | 'bedroom' | 'study' | 'kitchen' | 'bath'

export interface Zone {
  id: ZoneId
  name: string
  /** 칩을 누르면 미니미가 걸어가는 자리 */
  spot: UV
}

export const ZONES: Zone[] = [
  { id: 'living', name: '거실', spot: { u: 0.3, v: 0.36 } },
  { id: 'bedroom', name: '안방', spot: { u: 0.62, v: 0.26 } },
  { id: 'study', name: '작은방', spot: { u: 0.26, v: 0.62 } },
  { id: 'kitchen', name: '주방', spot: { u: 0.7, v: 0.56 } },
  { id: 'bath', name: '화장실', spot: { u: 0.82, v: 0.8 } },
]

/** 칸막이벽. 바닥 위 선분이고, door 구간은 비워서 지나다닌다 */
export interface Partition {
  from: UV
  to: UV
  /** 선분 위 0~1 비율 구간 */
  door?: [number, number]
  tone: 'wall' | 'tile'
}

// 안방: u 0.5~1, v 0~0.38 / 작은방: u 0~0.38, v 0.5~1 / 화장실: u, v 0.68~1
export const PARTITIONS: Partition[] = [
  { from: { u: 0.5, v: 0 }, to: { u: 0.5, v: 0.38 }, door: [0.42, 0.8], tone: 'wall' },
  { from: { u: 0.5, v: 0.38 }, to: { u: 1, v: 0.38 }, tone: 'wall' },
  { from: { u: 0, v: 0.5 }, to: { u: 0.38, v: 0.5 }, door: [0.42, 0.8], tone: 'wall' },
  { from: { u: 0.38, v: 0.5 }, to: { u: 0.38, v: 1 }, tone: 'wall' },
  { from: { u: 0.68, v: 0.68 }, to: { u: 0.68, v: 1 }, tone: 'tile' },
  { from: { u: 0.68, v: 0.68 }, to: { u: 1, v: 0.68 }, door: [0.25, 0.65], tone: 'tile' },
]

/** 방마다 다른 바닥 (바닥 좌표 사각형). 거실·현관은 방 주인이 꾸민 바닥 그대로 */
export const ROOM_FLOORS = {
  bedroom: { u0: 0.5, v0: 0, u1: 1, v1: 0.38 },
  study: { u0: 0, v0: 0.5, u1: 0.38, v1: 1 },
  kitchen: { u0: 0.5, v0: 0.38, u1: 1, v1: 0.68 },
  bath: { u0: 0.68, v0: 0.68, u1: 1, v1: 1 },
} as const

export function zoneAt(p: UV): ZoneId {
  const inRect = (r: { u0: number; v0: number; u1: number; v1: number }) =>
    p.u >= r.u0 && p.u <= r.u1 && p.v >= r.v0 && p.v <= r.v1
  if (inRect(ROOM_FLOORS.bath)) return 'bath'
  if (inRect(ROOM_FLOORS.bedroom)) return 'bedroom'
  if (inRect(ROOM_FLOORS.study)) return 'study'
  if (inRect(ROOM_FLOORS.kitchen)) return 'kitchen'
  return 'living'
}

/** 집에 처음부터 있는 가구 (서버에 저장하지 않는다) */
export interface Fixture {
  id: string
  item: string
  u: number
  v: number
  /** 그림 배율 (TV·침대는 집 가구라 조금 크게) */
  scale?: number
}

export const FIXTURES: Fixture[] = [
  // 거실
  { id: 'fx-tv', item: 'tv', u: 0.07, v: 0.1, scale: 1.35 },
  { id: 'fx-sofa', item: 'sofa', u: 0.08, v: 0.38 },
  { id: 'fx-lowtable', item: 'lowtable', u: 0.2, v: 0.42 },
  { id: 'fx-lamp', item: 'lamp', u: 0.06, v: 0.24 },
  { id: 'fx-turntable', item: 'turntable', u: 0.3, v: 0.05 },
  { id: 'fx-calendar', item: 'calendar', u: 0.42, v: 0.05 },
  // 안방
  { id: 'fx-bed', item: 'bed', u: 0.78, v: 0.12, scale: 1.25 },
  { id: 'fx-wardrobe', item: 'wardrobe', u: 0.96, v: 0.06 },
  { id: 'fx-alarm', item: 'alarm', u: 0.6, v: 0.05 },
  // 작은방
  { id: 'fx-desk', item: 'desk', u: 0.06, v: 0.8 },
  { id: 'fx-chair', item: 'chair', u: 0.13, v: 0.84 },
  { id: 'fx-bookshelf', item: 'bookshelf', u: 0.06, v: 0.6 },
  { id: 'fx-beanbag', item: 'beanbag', u: 0.28, v: 0.92 },
  // 주방
  { id: 'fx-fridge', item: 'fridge', u: 0.56, v: 0.42 },
  { id: 'fx-counter', item: 'counter', u: 0.75, v: 0.42 },
  { id: 'fx-washer', item: 'washer', u: 0.95, v: 0.43 },
  // 화장실
  { id: 'fx-toilet', item: 'toilet', u: 0.95, v: 0.74 },
  { id: 'fx-basin', item: 'basin', u: 0.95, v: 0.9 },
  { id: 'fx-bathtub', item: 'bathtub', u: 0.74, v: 0.86 },
]

// ─── 길찾기 ───

const N = 50
const CELL = 1 / N
const WALL_PAD = 0.024
const EDGE_MIN = 0.04
const EDGE_MAX = 0.96

function segDistance(p: UV, a: UV, b: UV) {
  const du = b.u - a.u
  const dv = b.v - a.v
  const len2 = du * du + dv * dv
  const t = len2 ? Math.max(0, Math.min(1, ((p.u - a.u) * du + (p.v - a.v) * dv) / len2)) : 0
  return Math.hypot(p.u - (a.u + du * t), p.v - (a.v + dv * t))
}

/** 칸막이벽을 문 구간만 빼고 실제로 막힌 선분들로 나눈다 */
export function solidSegments(list: Partition[] = PARTITIONS): { from: UV; to: UV }[] {
  const out: { from: UV; to: UV }[] = []
  const at = (w: Partition, t: number) => ({ u: w.from.u + (w.to.u - w.from.u) * t, v: w.from.v + (w.to.v - w.from.v) * t })
  for (const w of list) {
    if (!w.door) {
      out.push({ from: w.from, to: w.to })
      continue
    }
    out.push({ from: w.from, to: at(w, w.door[0]) })
    out.push({ from: at(w, w.door[1]), to: w.to })
  }
  return out
}

const SOLID = solidSegments()

/** 가구를 놓을 때: 집 밖으로 나가거나 칸막이벽에 걸치는 자리인지 */
export function hitsWall(p: UV, pad = 0.006) {
  if (p.u < 0.012 || p.u > 0.988 || p.v < 0.012 || p.v > 0.988) return true
  return SOLID.some((s) => segDistance(p, s.from, s.to) < pad)
}

/** 벽 말고 더 막을 것 (3D에서는 가구·놓인 아이템 자리) */
export type Blocker = (p: UV) => boolean

export function isBlocked(p: UV, extra?: Blocker) {
  if (p.u < EDGE_MIN || p.u > EDGE_MAX || p.v < EDGE_MIN || p.v > EDGE_MAX) return true
  return SOLID.some((s) => segDistance(p, s.from, s.to) < WALL_PAD) || !!extra?.(p)
}

const center = (i: number) => (i + 0.5) * CELL
const cellOf = (n: number) => Math.min(N - 1, Math.max(0, Math.floor(n / CELL)))

let blockedGrid: boolean[] | null = null
const extraGrids = new WeakMap<Blocker, boolean[]>()
function grid(extra?: Blocker) {
  const make = () => {
    const out: boolean[] = []
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) out.push(isBlocked({ u: center(i), v: center(j) }, extra))
    return out
  }
  if (!extra) return (blockedGrid ??= make())
  let g = extraGrids.get(extra)
  if (!g) extraGrids.set(extra, (g = make()))
  return g
}

/** 막히지 않은 가장 가까운 자리 */
export function nearestFree(p: UV, extra?: Blocker): UV {
  const c = { u: Math.min(EDGE_MAX, Math.max(EDGE_MIN, p.u)), v: Math.min(EDGE_MAX, Math.max(EDGE_MIN, p.v)) }
  if (!isBlocked(c, extra)) return c
  for (let r = 1; r < 16; r++) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      const q = { u: c.u + Math.cos(a) * r * 0.012, v: c.v + Math.sin(a) * r * 0.012 }
      if (!isBlocked(q, extra)) return q
    }
  }
  // 가구에 둘러싸였으면 벽만 피한다
  return extra ? nearestFree(p) : c
}

/** 두 점 사이에 벽이 없는지 (선분을 잘게 나눠 본다) */
export function clearLine(a: UV, b: UV, extra?: Blocker) {
  const steps = Math.ceil(Math.hypot(b.u - a.u, b.v - a.v) / 0.008)
  for (let k = 1; k < steps; k++) {
    const t = k / steps
    if (isBlocked({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t }, extra)) return false
  }
  return true
}

/**
 * 벽을 돌아가는 길 (A*, 8방향). 출발점은 빼고 지나갈 점들을 돌려준다.
 * 곧장 갈 수 있으면 [도착점] 하나. 길이 없으면 빈 배열
 */
export function findPath(fromRaw: UV, toRaw: UV, extra?: Blocker): UV[] {
  // 가구 위(앉아 있던 자리 등)에서 출발하면 가구는 무시하고 빠져나온다
  const from = nearestFree(fromRaw, extra && isBlocked(fromRaw, extra) && !isBlocked(fromRaw) ? undefined : extra)
  const to = nearestFree(toRaw, extra)
  if (clearLine(from, to, extra)) return [to]
  const g = grid(extra)
  const idx = (i: number, j: number) => j * N + i
  const si = cellOf(from.u)
  const sj = cellOf(from.v)
  const ti = cellOf(to.u)
  const tj = cellOf(to.v)
  const start = idx(si, sj)
  const goal = idx(ti, tj)
  const cost = new Map<number, number>([[start, 0]])
  const prev = new Map<number, number>()
  const open: { k: number; f: number }[] = [{ k: start, f: 0 }]
  const h = (k: number) => Math.hypot((k % N) - ti, Math.floor(k / N) - tj)
  const closed = new Set<number>()
  while (open.length) {
    let best = 0
    for (let n = 1; n < open.length; n++) if (open[n].f < open[best].f) best = n
    const { k } = open.splice(best, 1)[0]
    if (k === goal) break
    if (closed.has(k)) continue
    closed.add(k)
    const i = k % N
    const j = Math.floor(k / N)
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const ni = i + di
        const nj = j + dj
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue
        const nk = idx(ni, nj)
        if (g[nk] && nk !== goal) continue
        // 대각선은 양옆이 다 뚫려 있을 때만 (벽 모서리를 뚫고 지나가지 않게)
        if (di && dj && (g[idx(i + di, j)] || g[idx(i, j + dj)])) continue
        const c = (cost.get(k) ?? 0) + (di && dj ? Math.SQRT2 : 1)
        if (c < (cost.get(nk) ?? Infinity)) {
          cost.set(nk, c)
          prev.set(nk, k)
          open.push({ k: nk, f: c + h(nk) })
        }
      }
    }
  }
  if (!prev.has(goal) && goal !== start) return []
  const cells: UV[] = []
  for (let k = goal; k !== start; k = prev.get(k)!) cells.unshift({ u: center(k % N), v: center(Math.floor(k / N)) })
  cells[cells.length - 1] = to
  // 줄 당기기: 보이는 가장 먼 점으로 바로 간다
  const out: UV[] = []
  let cur = from
  let n = 0
  while (n < cells.length) {
    let far = n
    for (let m = cells.length - 1; m > n; m--) {
      if (clearLine(cur, cells[m], extra)) {
        far = m
        break
      }
    }
    out.push(cells[far])
    cur = cells[far]
    n = far + 1
  }
  return out
}
