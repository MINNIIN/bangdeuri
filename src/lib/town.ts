/**
 * 동네: 방 주인 집을 가운데 두고, 서로 놀러 간 적 있는 친구들 집이 한 줄로 늘어선 골목.
 *
 *   (북)  ┌집┐ ┌집┐ ┌집┐ ┌집┐ ┌집┐      ← 집 (문은 남쪽 = 길 쪽)
 *         마당  마당  마당  마당  마당    ← 울타리 · 대문 · 우편함
 *   ═══════════════ 인도 ═══════════════
 *   ─────────────── 차도 ───────────────
 *   ═══════════════ 인도 ═══════════════
 *   (남)      공원 · 나무 · 벤치 · 가로등
 *
 * 단위는 m. x가 동쪽, z가 남쪽(화면 앞쪽). 집 안은 따로 떨어진 공간(area)이다.
 */

import { type Blocker, findPath as findHousePath, nearestFree as nearestHouseFree, type UV } from './home'

export type Vec2 = { x: number; z: number }

/** 지금 있는 곳: 골목 또는 어느 집 안 */
export type AreaId = 'town' | `house:${string}`

export const TOWN: AreaId = 'town'
export const houseArea = (roomId: string): AreaId => `house:${roomId}`
export const roomOfArea = (a: AreaId): string | null => (a.startsWith('house:') ? a.slice(6) : null)
export const isArea = (s: unknown): s is AreaId => typeof s === 'string' && (s === 'town' || /^house:[A-Za-z0-9_-]{1,40}$/.test(s))

/** 친구가 선물을 둔 곳: 집 안 · 마당 · 우편함 */
export type DropPlace = 'in' | 'yard' | 'mail'
export const DROP_PLACES: DropPlace[] = ['in', 'yard', 'mail']
export const isPlace = (s: unknown): s is DropPlace => s === 'in' || s === 'yard' || s === 'mail'

/** 한 동네에 들어가는 집 수 (가운데 방 주인 집 포함) */
export const MAX_HOUSES = 9

export const LOT_W = 13
export const HOUSE_W = 7.2
export const HOUSE_D = 6
/** 집 앞면(문 있는 쪽) z */
export const HOUSE_FRONT_Z = -10
export const HOUSE_BACK_Z = HOUSE_FRONT_Z - HOUSE_D
/** 마당 앞 울타리 z (그 앞이 인도) */
export const FENCE_Z = -5
export const SIDEWALK_N = -5
export const ROAD_N = -3.4
export const ROAD_S = 3.4
export const SIDEWALK_S = 5
/** 공원 남쪽 끝 */
export const PARK_S = 16
export const GATE_HALF = 1.3

export interface Lot {
  /** 그 집 방 번호 */
  roomId: string
  index: number
  /** 집 가운데 x */
  x: number
}

/** 0, -1, 1, -2, 2 … 순서로 가운데부터 양옆으로 채운다 */
export function slotX(index: number) {
  if (index === 0) return 0
  const k = Math.ceil(index / 2)
  return (index % 2 === 1 ? -k : k) * LOT_W
}

export function layoutLots(roomIds: string[]): Lot[] {
  const seen = new Set<string>()
  const out: Lot[] = []
  for (const id of roomIds) {
    if (seen.has(id) || out.length >= MAX_HOUSES) continue
    seen.add(id)
    out.push({ roomId: id, index: out.length, x: slotX(out.length) })
  }
  return out
}

/** 골목 양 끝 x (집이 있는 곳 + 여유) */
export function townBounds(lots: Lot[]) {
  const xs = lots.map((l) => l.x)
  const min = Math.min(0, ...xs) - LOT_W / 2 - 6
  const max = Math.max(0, ...xs) + LOT_W / 2 + 6
  return { minX: min, maxX: max, minZ: HOUSE_BACK_Z - 1.5, maxZ: PARK_S }
}

/** 대문 앞(인도) — 집에서 나오면 여기 선다 */
export const doorStep = (lot: Lot): Vec2 => ({ x: lot.x, z: HOUSE_FRONT_Z + 1.1 })
export const gateSpot = (lot: Lot): Vec2 => ({ x: lot.x, z: FENCE_Z + 1 })
export const mailboxSpot = (lot: Lot): Vec2 => ({ x: lot.x + GATE_HALF + 0.9, z: FENCE_Z - 0.5 })

/** 마당 사각형 (울타리 안쪽) */
export function yardRect(lot: Lot) {
  return { x0: lot.x - LOT_W / 2 + 0.7, x1: lot.x + LOT_W / 2 - 0.7, z0: HOUSE_FRONT_Z + 0.5, z1: FENCE_Z - 0.4 }
}

/** 마당 좌표(0~1) ↔ 골목 좌표. u: 서→동, v: 집→울타리 */
export function yardToTown(lot: Lot, p: UV): Vec2 {
  const r = yardRect(lot)
  return { x: r.x0 + (r.x1 - r.x0) * p.u, z: r.z0 + (r.z1 - r.z0) * p.v }
}
export function townToYard(lot: Lot, p: Vec2): UV | null {
  const r = yardRect(lot)
  if (p.x < r.x0 || p.x > r.x1 || p.z < r.z0 || p.z > r.z1) return null
  return { u: (p.x - r.x0) / (r.x1 - r.x0), v: (p.z - r.z0) / (r.z1 - r.z0) }
}

/** 이 자리가 어느 집 마당인지 */
export function lotAtYard(lots: Lot[], p: Vec2): { lot: Lot; uv: UV } | null {
  for (const lot of lots) {
    const uv = townToYard(lot, p)
    if (uv) return { lot, uv }
  }
  return null
}

// ─── 공원 장식 (자리가 매번 같게 x로 정한다) ───

export interface Prop {
  kind: 'tree' | 'bench' | 'lamp' | 'flower' | 'swing' | 'slide' | 'bush'
  x: number
  z: number
  /** 지나가지 못하는 반지름 (0이면 지나갈 수 있다) */
  r: number
  rot?: number
}

/** 0~1 해시 (같은 입력 = 같은 값) */
export function hash01(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

export function townProps(lots: Lot[]): Prop[] {
  const b = townBounds(lots)
  const out: Prop[] = []
  // 가로등: 길 양옆
  for (let x = Math.ceil(b.minX / 9) * 9; x <= b.maxX; x += 9) {
    out.push({ kind: 'lamp', x: x + 4.5, z: SIDEWALK_S - 0.5, r: 0.25 })
  }
  // 집 사이 나무, 마당 꽃
  for (const lot of lots) {
    out.push({ kind: 'tree', x: lot.x + LOT_W / 2, z: HOUSE_BACK_Z + 1.5, r: 0.7 })
    const r = yardRect(lot)
    out.push({ kind: 'bush', x: r.x0 + 0.6, z: r.z1 - 0.5, r: 0.5 })
    out.push({ kind: 'flower', x: r.x1 - 1.2, z: r.z0 + 0.8, r: 0 })
    out.push({ kind: 'flower', x: r.x0 + 1.4, z: r.z0 + 0.7, r: 0 })
  }
  // 공원: 놀이터는 가운데, 나무·벤치는 해시로
  out.push({ kind: 'swing', x: -4, z: 10.5, r: 1.4 })
  out.push({ kind: 'slide', x: 4.5, z: 10.5, r: 1.3, rot: Math.PI / 2 })
  out.push({ kind: 'bench', x: 0, z: 7.4, r: 0.8 })
  let i = 0
  for (let x = b.minX + 3; x <= b.maxX - 3; x += 5.5) {
    i++
    if (Math.abs(x) < 8) continue
    const h = hash01(i)
    const z = 8 + h * 6.5
    if (h < 0.2) out.push({ kind: 'bench', x, z: 7.4, r: 0.8 })
    else out.push({ kind: 'tree', x: x + (hash01(i + 9) - 0.5) * 2, z, r: 0.7 })
    if (hash01(i + 3) > 0.55) out.push({ kind: 'flower', x: x + 1.6, z: z - 1.4, r: 0 })
  }
  return out
}

// ─── 지나갈 수 없는 곳 ───

type Seg = { a: Vec2; b: Vec2 }

/** 울타리 선분들 (대문 자리는 비운다) */
export function fenceSegments(lot: Lot): Seg[] {
  const l = lot.x - LOT_W / 2 + 0.3
  const r = lot.x + LOT_W / 2 - 0.3
  return [
    { a: { x: l, z: FENCE_Z }, b: { x: lot.x - GATE_HALF, z: FENCE_Z } },
    { a: { x: lot.x + GATE_HALF, z: FENCE_Z }, b: { x: r, z: FENCE_Z } },
    { a: { x: l, z: FENCE_Z }, b: { x: l, z: HOUSE_FRONT_Z } },
    { a: { x: r, z: FENCE_Z }, b: { x: r, z: HOUSE_FRONT_Z } },
  ]
}

function segDist(p: Vec2, s: Seg) {
  const dx = s.b.x - s.a.x
  const dz = s.b.z - s.a.z
  const len2 = dx * dx + dz * dz
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.z - s.a.z) * dz) / len2)) : 0
  return Math.hypot(p.x - (s.a.x + dx * t), p.z - (s.a.z + dz * t))
}

export interface TownMap {
  lots: Lot[]
  props: Prop[]
  bounds: ReturnType<typeof townBounds>
  blocked: (p: Vec2) => boolean
}

const PAD = 0.35

export function buildTown(roomIds: string[]): TownMap {
  const lots = layoutLots(roomIds)
  const props = townProps(lots)
  const bounds = townBounds(lots)
  const fences = lots.flatMap(fenceSegments)
  const solids = props.filter((p) => p.r > 0)
  const blocked = (p: Vec2) => {
    if (p.x < bounds.minX + 0.5 || p.x > bounds.maxX - 0.5 || p.z < bounds.minZ + 0.5 || p.z > bounds.maxZ - 0.5) return true
    // 집 (+ 집 뒤는 못 간다)
    for (const lot of lots) {
      if (Math.abs(p.x - lot.x) < HOUSE_W / 2 + PAD && p.z < HOUSE_FRONT_Z + PAD) return true
      // 집 사이 뒷마당도 막는다 (마당 울타리 안쪽 끝까지만)
      if (p.z < HOUSE_FRONT_Z && Math.abs(p.x - lot.x) < LOT_W / 2) return true
    }
    if (fences.some((s) => segDist(p, s) < PAD)) return true
    for (const lot of lots) {
      const m = mailboxSpot(lot)
      if (Math.hypot(p.x - m.x, p.z - m.z) < 0.4) return true
    }
    return solids.some((s) => Math.hypot(p.x - s.x, p.z - s.z) < s.r)
  }
  return { lots, props, bounds, blocked }
}

export function nearestOpen(map: TownMap, p: Vec2): Vec2 {
  const b = map.bounds
  const c = { x: Math.min(b.maxX - 0.6, Math.max(b.minX + 0.6, p.x)), z: Math.min(b.maxZ - 0.6, Math.max(b.minZ + 0.6, p.z)) }
  if (!map.blocked(c)) return c
  for (let r = 1; r < 30; r++) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      const q = { x: c.x + Math.cos(a) * r * 0.25, z: c.z + Math.sin(a) * r * 0.25 }
      if (!map.blocked(q)) return q
    }
  }
  return c
}

function clearRun(map: TownMap, a: Vec2, b: Vec2) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.15)
  for (let k = 1; k < steps; k++) {
    const t = k / steps
    if (map.blocked({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false
  }
  return true
}

const CELL = 0.5
const gridCache = new WeakMap<TownMap, { nx: number; nz: number; g: Uint8Array }>()

function townGrid(map: TownMap) {
  let c = gridCache.get(map)
  if (!c) {
    const nx = Math.ceil((map.bounds.maxX - map.bounds.minX) / CELL)
    const nz = Math.ceil((map.bounds.maxZ - map.bounds.minZ) / CELL)
    const g = new Uint8Array(nx * nz)
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) g[j * nx + i] = map.blocked({ x: map.bounds.minX + (i + 0.5) * CELL, z: map.bounds.minZ + (j + 0.5) * CELL }) ? 1 : 0
    c = { nx, nz, g }
    gridCache.set(map, c)
  }
  return c
}

/** 골목 길찾기 (A*, 8방향 + 줄 당기기). 출발점은 빼고 지나갈 점들. 길이 없으면 빈 배열 */
export function findTownPath(map: TownMap, fromRaw: Vec2, toRaw: Vec2): Vec2[] {
  const from = nearestOpen(map, fromRaw)
  const to = nearestOpen(map, toRaw)
  if (clearRun(map, from, to)) return [to]
  const { nx, nz, g } = townGrid(map)
  const ci = (x: number) => Math.min(nx - 1, Math.max(0, Math.floor((x - map.bounds.minX) / CELL)))
  const cj = (z: number) => Math.min(nz - 1, Math.max(0, Math.floor((z - map.bounds.minZ) / CELL)))
  const start = cj(from.z) * nx + ci(from.x)
  const goal = cj(to.z) * nx + ci(to.x)
  const ti = goal % nx
  const tj = Math.floor(goal / nx)
  const cost = new Float32Array(nx * nz).fill(Infinity)
  const prev = new Int32Array(nx * nz).fill(-1)
  const closed = new Uint8Array(nx * nz)
  cost[start] = 0
  // 작은 이진 힙
  const heap: { k: number; f: number }[] = [{ k: start, f: 0 }]
  const push = (n: { k: number; f: number }) => {
    heap.push(n)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p].f <= heap[i].f) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l].f < heap[m].f) m = l
        if (r < heap.length && heap[r].f < heap[m].f) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  while (heap.length) {
    const { k } = pop()
    if (k === goal) break
    if (closed[k]) continue
    closed[k] = 1
    const i = k % nx
    const j = Math.floor(k / nx)
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const ni = i + di
        const nj = j + dj
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue
        const nk = nj * nx + ni
        if (g[nk] && nk !== goal) continue
        if (di && dj && (g[j * nx + ni] || g[nj * nx + i])) continue
        const c = cost[k] + (di && dj ? Math.SQRT2 : 1)
        if (c < cost[nk]) {
          cost[nk] = c
          prev[nk] = k
          push({ k: nk, f: c + Math.hypot(ni - ti, nj - tj) })
        }
      }
  }
  if (prev[goal] < 0 && goal !== start) return []
  const cells: Vec2[] = []
  for (let k = goal; k !== start; k = prev[k])
    cells.unshift({ x: map.bounds.minX + ((k % nx) + 0.5) * CELL, z: map.bounds.minZ + (Math.floor(k / nx) + 0.5) * CELL })
  if (!cells.length) return [to]
  cells[cells.length - 1] = to
  const out: Vec2[] = []
  let cur = from
  let n = 0
  while (n < cells.length) {
    let far = n
    for (let m = cells.length - 1; m > n; m--)
      if (clearRun(map, cur, cells[m])) {
        far = m
        break
      }
    out.push(cells[far])
    cur = cells[far]
    n = far + 1
  }
  return out
}

// ─── 집 안: 바닥 좌표 0~1 ↔ m ───

/** 집 안 한 변 길이 (m) */
export const HOUSE_SIZE = 11
export const uvToHouse = (p: UV): Vec2 => ({ x: (p.u - 0.5) * HOUSE_SIZE, z: (p.v - 0.5) * HOUSE_SIZE })
export const houseToUv = (p: Vec2): UV => ({ u: p.x / HOUSE_SIZE + 0.5, v: p.z / HOUSE_SIZE + 0.5 })

/** 집 안 현관 (밖에서 들어오면 여기 선다) */
export const HOUSE_ENTRANCE: UV = { u: 0.54, v: 0.9 }
/** 집 안 현관문 (누르면 밖으로) */
export const HOUSE_EXIT: UV = { u: 0.54, v: 0.985 }

/** 집 안에서 피해 갈 물건: 가운데·반너비·반깊이·돌린 각 (m) */
export interface Obstacle {
  x: number
  z: number
  hw: number
  hd: number
  yaw: number
}

/** 물건 자리를 집 안 길찾기가 쓰는 막힘 검사로. pad만큼 넉넉히 비켜 간다 */
export function obstacleBlocker(list: Obstacle[], pad = 0.12): Blocker {
  return (uv) => {
    const p = uvToHouse(uv)
    for (const o of list) {
      const dx = p.x - o.x
      const dz = p.z - o.z
      const c = Math.cos(o.yaw)
      const s = Math.sin(o.yaw)
      // 물건 기준 좌표로 돌려서 사각형 안인지 본다
      const lx = dx * c - dz * s
      const lz = dx * s + dz * c
      if (Math.abs(lx) < o.hw + pad && Math.abs(lz) < o.hd + pad) return true
    }
    return false
  }
}

export function findHouseWorldPath(from: Vec2, to: Vec2, extra?: Blocker): Vec2[] {
  return findHousePath(houseToUv(from), houseToUv(to), extra).map(uvToHouse)
}
export const nearestHouseOpen = (p: Vec2, extra?: Blocker): Vec2 => uvToHouse(nearestHouseFree(houseToUv(p), extra))

/** 실시간으로 받은 자리 값이 멀쩡한지 */
export function safeVec(p: unknown): Vec2 | null {
  if (!p || typeof p !== 'object') return null
  const { x, z } = p as Record<string, unknown>
  if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return null
  if (Math.abs(x) > 500 || Math.abs(z) > 500) return null
  return { x, z }
}
