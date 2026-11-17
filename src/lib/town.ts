/**
 * 동네: 큰길 + 뒷골목 두 줄 + 샛길로 나뉜 격자 동네 (9칸 × 3줄). 크기는 친구 수와 상관없이 늘 같다.
 *
 *   (북)  줄2  [빨래방][집][집] ┃ [집][노래방][집] ┃ [집][집][집]
 *         ─────────────── 뒷골목2 ─────────────────
 *         줄1  [집][오락실][집] ┃ [집][집][집]     ┃ [집][카페][집]
 *         ─────────────── 뒷골목1 ─────────────────
 *         줄0  [집][집][편의점] ┃ [집][내집][집]   ┃ [PC방][집][집]   ← 문은 남쪽 = 길 쪽
 *   ════════════════════ 큰길 (인도 · 차도 · 인도) ════════════════════
 *   (남)      포장마차 · 공원 · 놀이터
 *
 * 가게 칸은 늘 같은 자리. 집은 남은 칸을 내 집(줄0 가운데)에서 가까운 순으로 채운다 (빈 칸은 "입주 대기" 집터).
 * 격자 서쪽 = 뒷산(걸어 올라간다), 동쪽 = 바닷가(모래사장 · 방파제 · 등대).
 *
 * 단위는 m. x가 동쪽, z가 남쪽(화면 앞쪽). 집 안과 가게 안은 따로 떨어진 공간(area)이다.
 */

import { type Blocker, findPath as findHousePath, nearestFree as nearestHouseFree, type UV } from './home'

export type Vec2 = { x: number; z: number }

/** 들어갈 수 있는 가게 (가게 안 = 따로 떨어진 공간) */
export type ShopId = 'cvs' | 'pc' | 'sing' | 'arcade' | 'laundry' | 'cafe'
export const SHOP_IDS: ShopId[] = ['cvs', 'pc', 'sing', 'arcade', 'laundry', 'cafe']
export const isShopId = (s: unknown): s is ShopId => typeof s === 'string' && (SHOP_IDS as string[]).includes(s)

/** 지금 있는 곳: 골목 · 가게 안 · 어느 집 안 */
export type AreaId = 'town' | ShopId | `house:${string}`

export const TOWN: AreaId = 'town'
/** 골목 편의점 안 */
export const CVS: AreaId = 'cvs'
export const houseArea = (roomId: string): AreaId => `house:${roomId}`
export const roomOfArea = (a: AreaId): string | null => (a.startsWith('house:') ? a.slice(6) : null)
export const isArea = (s: unknown): s is AreaId =>
  typeof s === 'string' && (s === 'town' || isShopId(s) || /^house:[A-Za-z0-9_-]{1,40}$/.test(s))

/** 친구가 선물을 둔 곳: 집 안 · 마당 · 우편함 */
export type DropPlace = 'in' | 'yard' | 'mail'
export const DROP_PLACES: DropPlace[] = ['in', 'yard', 'mail']
export const isPlace = (s: unknown): s is DropPlace => s === 'in' || s === 'yard' || s === 'mail'

/** 한 동네에 들어가는 집 수 (가운데 방 주인 집 포함: 친구 집 16채 + 내 집) */
export const MAX_HOUSES = 17

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
/** 횡단보도 폭의 절반 (골목 가운데 x=0에서 길을 가로지른다) */
export const CROSSWALK_HALF = 1.6

// ─── 격자: 칸(집터) · 줄 · 샛길 ───

/** 줄 수 · 줄마다 칸 수 (칸 번호 -4 ~ 4) */
export const ROWS = 3
export const COLS = 9
/** 줄 사이 간격 (집 깊이 + 마당 + 뒷골목) */
export const ROW_PITCH = 16
/** 뒷골목 폭 (줄1·2 울타리 앞) · 샛길 폭 */
export const ALLEY_W = 4
export const STREET_W = 4
/** 샛길 가운데 x (칸 -2|-1 사이, 1|2 사이) */
export const STREET_X = [-21.5, 21.5] as const
/** 격자 양 끝 (끝 칸 바깥에 샛길 폭만큼 길이 더 있다) */
export const GRID_W = 4 * LOT_W + 4 + LOT_W / 2 + STREET_W

/** 칸 번호 → 가운데 x (샛길 자리만큼 바깥 칸은 벌어진다) */
export const colX = (c: number) => c * LOT_W + (c >= 2 ? STREET_W : c <= -2 ? -STREET_W : 0)
/** 줄 번호 → z 이동 (줄0 = 큰길 앞, 뒤로 갈수록 북쪽) */
export const rowOff = (r: number) => (r === 0 ? 0 : -r * ROW_PITCH)

export interface Slot {
  row: number
  col: number
  x: number
  /** 줄0 기준에서 z 이동 (집·마당·울타리 z에 더한다) */
  zOff: number
}

/** 가게 칸 (늘 같은 자리) */
export const SHOP_SLOTS: Record<ShopId, { row: number; col: number }> = {
  cvs: { row: 0, col: -2 },
  pc: { row: 0, col: 2 },
  arcade: { row: 1, col: -3 },
  cafe: { row: 1, col: 3 },
  sing: { row: 2, col: 0 },
  laundry: { row: 2, col: -4 },
}

const slotOf = (row: number, col: number): Slot => ({ row, col, x: colX(col), zOff: rowOff(row) })

/** 모든 칸 */
export const ALL_SLOTS: Slot[] = Array.from({ length: ROWS * COLS }, (_, i) => slotOf(Math.floor(i / COLS), (i % COLS) - 4))
const shopAtSlot = (s: { row: number; col: number }) => SHOP_IDS.find((id) => SHOP_SLOTS[id].row === s.row && SHOP_SLOTS[id].col === s.col)

let houseSlotCache: Slot[] | null = null
/** 집이 들어갈 칸: 내 집 칸(줄0 가운데)에서 가까운 순 (같으면 서쪽 먼저, 그다음 앞줄 먼저) */
export function houseSlots(): Slot[] {
  if (!houseSlotCache)
    houseSlotCache = ALL_SLOTS.filter((s) => !shopAtSlot(s)).sort(
      (a, b) => Math.hypot(a.x, a.zOff) - Math.hypot(b.x, b.zOff) || a.x - b.x || b.zOff - a.zOff,
    )
  return houseSlotCache.map((s) => ({ ...s }))
}

export interface Lot extends Slot {
  /** 그 집 방 번호 */
  roomId: string
  index: number
}

/** 방 목록 순서대로 집 칸을 채운다 (친구가 늘면 뒤 칸만 새로 찬다) */
export function layoutLots(roomIds: string[]): Lot[] {
  const seen = new Set<string>()
  const out: Lot[] = []
  const slots = houseSlots()
  for (const id of roomIds) {
    if (seen.has(id) || out.length >= MAX_HOUSES) continue
    seen.add(id)
    out.push({ ...slots[out.length], roomId: id, index: out.length })
  }
  return out
}

/** 집도 가게도 없는 빈 집터 */
export function emptySlots(lots: Lot[]): Slot[] {
  const used = new Set(lots.map((l) => `${l.row}:${l.col}`))
  return houseSlots().filter((s) => !used.has(`${s.row}:${s.col}`))
}

// ─── 가게 건물 ───

/** 가게 건물 (가로 · 깊이 · 줄0 앞면 z) */
export const STORE_W = 10
export const STORE_D = 7
export const STORE_FRONT = -7.4
/** 가게 문: 건물 가운데에서 동쪽으로 */
export const STORE_DOOR_DX = 2

/** 가게 건물 자리: 가운데 x · 앞면 z1 · 뒷면 z0 */
export function shopRect(id: ShopId) {
  const s = slotOf(SHOP_SLOTS[id].row, SHOP_SLOTS[id].col)
  const z1 = STORE_FRONT + s.zOff
  return { x: s.x, z1, z0: z1 - STORE_D, zOff: s.zOff }
}
/** 가게 문 앞 (골목 쪽) */
export const shopDoor = (id: ShopId): Vec2 => {
  const r = shopRect(id)
  return { x: r.x + STORE_DOOR_DX, z: r.z1 + 0.9 }
}

// ─── 동네 장소 (격자 양 끝) ───
/** 뒷산 높이 · 꼭대기 평지(타원 반지름 비율) */
export const HILL_H = 4.2
const HILL_TOP = 0.3
/** 바닷물 높이 */
export const SEA_Y = -0.12
/** 방파제 바닥 높이 · 남북 폭 */
export const PIER_Y = 0.36

export interface Zones {
  /** 격자 서쪽·동쪽 끝 */
  hw: number
  he: number
  /** 뒷산 꼭대기 가운데 · 타원 반지름 */
  hill: { x: number; z: number; rx: number; rz: number }
  /** 포장마차 가운데 */
  pocha: Vec2
  /** 차도·인도가 끝나는 동쪽 x (그 너머는 모래사장) */
  roadEnd: number
  /** 모래사장이 시작하는 x · 물가가 깊어지기 시작하는 x · 걸어 들어갈 수 있는 끝 */
  sand: number
  shore: number
  wet: number
  /** 방파제 (서쪽 끝 x · 동쪽 끝 x · 가운데 z) */
  pier: { x0: number; x1: number; z: number; half: number }
}

/** 동네 장소 자리 (격자 크기가 고정이라 늘 같다) */
export function townZones(_lots?: Lot[]): Zones {
  const hw = -GRID_W
  const he = GRID_W
  return {
    hw,
    he,
    hill: { x: hw - 16, z: -15, rx: 12.5, rz: 9.6 },
    pocha: { x: hw - 8, z: 8.6 },
    roadEnd: he + 7,
    sand: he + 5,
    shore: he + 18,
    wet: he + 23.4,
    pier: { x0: he + 19.2, x1: he + 34.2, z: 9.9, half: 0.85 },
  }
}

const smooth = (t: number) => {
  const k = Math.max(0, Math.min(1, t))
  return k * k * (3 - 2 * k)
}

/** 뒷산 타원 안쪽 정도 (0 = 꼭대기 가운데, 1 = 산기슭) */
export const hillE = (z: Zones, x: number, zz: number) => Math.hypot((x - z.hill.x) / z.hill.rx, (zz - z.hill.z) / z.hill.rz)

/** 방파제 위인지 */
export const onPier = (z: Zones, p: Vec2) => p.x >= z.pier.x0 - 1 && p.x <= z.pier.x1 && Math.abs(p.z - z.pier.z) <= z.pier.half

/** 땅 높이 (m): 뒷산은 솟고, 바닷가는 물속으로 살짝 내려가고, 방파제는 물 위로 */
export function groundY(z: Zones, x: number, zz: number): number {
  if (x < z.hw) {
    const e = hillE(z, x, zz)
    if (e >= 1) return 0
    return e <= HILL_TOP ? HILL_H : HILL_H * (1 - smooth((e - HILL_TOP) / (1 - HILL_TOP)))
  }
  if (x > z.shore) {
    if (onPier(z, { x, z: zz })) return PIER_Y * smooth((x - (z.pier.x0 - 1)) / 1)
    return -0.4 * smooth((x - z.shore) / (z.wet - z.shore + 0.6))
  }
  return 0
}

/** 골목 양 끝 x (서쪽 뒷산 ~ 동쪽 방파제 끝) */
export function townBounds(lots: Lot[]) {
  const z = townZones(lots)
  return { minX: z.hill.x - z.hill.rx, maxX: z.pier.x1 + 1.8, minZ: rowOff(ROWS - 1) + HOUSE_BACK_Z - 3, maxZ: PARK_S }
}

/**
 * 손님이 처음 서는 자리: 방 주인 대문 앞 인도에서 사람마다 조금씩 다르게 (여럿이 한꺼번에 와도 겹치지 않게).
 * 접속 id로 정해서, 다른 사람 화면에서도 같은 자리에 나타난다.
 */
export function guestSpot(cid: string): Vec2 {
  let h = 0
  for (let i = 0; i < cid.length; i++) h = (h * 31 + cid.charCodeAt(i)) | 0
  return { x: (hash01(h) - 0.5) * 2.4, z: -3.6 - hash01(h + 7) * 0.8 }
}

/** 대문 앞(인도) — 집에서 나오면 여기 선다 */
export const doorStep = (lot: Slot): Vec2 => ({ x: lot.x, z: HOUSE_FRONT_Z + lot.zOff + 1.1 })
export const gateSpot = (lot: Slot): Vec2 => ({ x: lot.x, z: FENCE_Z + lot.zOff + 1 })
export const mailboxSpot = (lot: Slot): Vec2 => ({ x: lot.x + GATE_HALF + 0.9, z: FENCE_Z + lot.zOff - 0.5 })

/** 마당 사각형 (울타리 안쪽) */
export function yardRect(lot: Slot) {
  return { x0: lot.x - LOT_W / 2 + 0.7, x1: lot.x + LOT_W / 2 - 0.7, z0: HOUSE_FRONT_Z + lot.zOff + 0.5, z1: FENCE_Z + lot.zOff - 0.4 }
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
  kind:
    | 'tree' | 'bench' | 'lamp' | 'flower' | 'swing' | 'slide' | 'bush' | 'signal' | 'seesaw' | 'sandbox' | 'mat' | 'stones' | 'trash'
    // 편의점 앞 · 포장마차 · 빈 집터
    | 'ptable' | 'vending' | 'bins' | 'pocha' | 'lotsign'
    // 큰길: 붕어빵 노점 · 버스정류장
    | 'bungeo' | 'busstop'
    // 뒷산
    | 'pavilion' | 'scope' | 'summit' | 'twister' | 'spring' | 'pine' | 'trail' | 'trailsign'
    // 바닷가
    | 'sunbeds' | 'ball' | 'castle' | 'shell' | 'wade' | 'fwbox' | 'tower' | 'fishing' | 'lighthouse' | 'boat' | 'beachsign' | 'bollard' | 'buoy'
  x: number
  z: number
  /** 지나가지 못하는 반지름 (0이면 지나갈 수 있다) */
  r: number
  rot?: number
  /** 바닥 매트 반지름 · 색 같은 모양 정보 */
  size?: number
  color?: string
  /** 사각형으로 막을 때 반너비·반깊이 (돌린 각도 기준, r 대신) */
  box?: [number, number]
}

/** 0~1 해시 (같은 입력 = 같은 값) */
export function hash01(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

export function townProps(lots: Lot[]): Prop[] {
  const out: Prop[] = []
  // 가로등: 길 양옆
  const zr = townZones(lots)
  for (let x = Math.ceil((zr.hw - 26) / 9) * 9; x <= zr.roadEnd - 5; x += 9) {
    out.push({ kind: 'lamp', x: x + 4.5, z: SIDEWALK_S - 0.5, r: 0.25 })
  }
  // 횡단보도(x=0) 양끝 보행 신호등: 길 건너편 사람이 보도록 서로 마주 본다
  out.push({ kind: 'signal', x: CROSSWALK_HALF + 0.35, z: ROAD_N - 0.35, r: 0.2, rot: 0 })
  out.push({ kind: 'signal', x: -CROSSWALK_HALF - 0.35, z: ROAD_S + 0.35, r: 0.2, rot: Math.PI })
  // 집 사이 나무, 마당 꽃
  for (const lot of lots) {
    out.push({ kind: 'tree', x: lot.x + LOT_W / 2, z: HOUSE_BACK_Z + lot.zOff + 1.5, r: 0.7 })
    const r = yardRect(lot)
    out.push({ kind: 'bush', x: r.x0 + 0.6, z: r.z1 - 0.5, r: 0.5 })
    out.push({ kind: 'flower', x: r.x1 - 1.2, z: r.z0 + 0.8, r: 0 })
    out.push({ kind: 'flower', x: r.x0 + 1.4, z: r.z0 + 0.7, r: 0 })
  }
  // 공원 가운데 놀이터 (집이 한 채여도 휑하지 않게 늘 같은 자리에)
  // 놀이기구 아래 푹신한 바닥 매트
  out.push({ kind: 'mat', x: -4, z: 10.6, r: 0, size: 2.3, color: '#f4a46a' })
  out.push({ kind: 'mat', x: 4.4, z: 10.5, r: 0, size: 2.3, color: '#7cc98f' })
  out.push({ kind: 'swing', x: -4, z: 10.5, r: 1.4 })
  out.push({ kind: 'slide', x: 4.5, z: 10.5, r: 1.3, rot: Math.PI / 2 })
  out.push({ kind: 'seesaw', x: 0, z: 12.2, r: 1.05, rot: Math.PI / 2 })
  out.push({ kind: 'sandbox', x: -3.6, z: 14.3, r: 1.15 })
  // 횡단보도에서 벤치 옆으로 들어가는 징검다리
  out.push({ kind: 'stones', x: 0, z: 5.9, r: 0 })
  out.push({ kind: 'bench', x: -1.6, z: 7.4, r: 0.8 })
  out.push({ kind: 'bench', x: 1.9, z: 7.4, r: 0.8 })
  out.push({ kind: 'trash', x: 3.3, z: 7.2, r: 0.25 })
  // 공원 가로등 · 나무 · 덤불 · 꽃
  out.push({ kind: 'lamp', x: -6, z: 8.6, r: 0.25 })
  out.push({ kind: 'lamp', x: 6.2, z: 13.6, r: 0.25 })
  out.push({ kind: 'tree', x: -6.1, z: 12.4, r: 0.7 })
  out.push({ kind: 'tree', x: 6.1, z: 7.6, r: 0.7 })
  out.push({ kind: 'tree', x: 3.2, z: 15.1, r: 0.7 })
  for (const [x, z] of [[-1.2, 15.4], [0.8, 15.5], [-6, 15.2], [5.9, 15.4]] as const) out.push({ kind: 'bush', x, z, r: 0.5 })
  for (const [x, z] of [[-3.1, 7.0], [0.3, 6.8], [4.6, 7.2], [-5.6, 10.9], [2.1, 13.6], [-1.6, 13.8]] as const) out.push({ kind: 'flower', x, z, r: 0 })
  let i = 0
  const zn = townZones(lots)
  for (let x = zn.hw - 3; x <= zn.he + 3; x += 5.5) {
    i++
    if (Math.abs(x) < 8.5) continue
    const h = hash01(i)
    const z = 8 + h * 6.5
    if (h < 0.2) out.push({ kind: 'bench', x, z: 7.4, r: 0.8 })
    else out.push({ kind: 'tree', x: x + (hash01(i + 9) - 0.5) * 2, z, r: 0.7 })
    if (hash01(i + 3) > 0.55) out.push({ kind: 'flower', x: x + 1.6, z: z - 1.4, r: 0 })
  }
  // 빈 집터: "입주 대기" 팻말 + 꽃·덤불
  for (const s of emptySlots(lots)) {
    const fz = FENCE_Z + s.zOff
    out.push({ kind: 'lotsign', x: s.x + 2.6, z: fz - 1.2, r: 0.25 })
    out.push({ kind: 'bush', x: s.x - 4.2, z: fz - 2.6, r: 0.5 })
    out.push({ kind: 'flower', x: s.x - 1.8, z: fz - 1.6, r: 0 })
    out.push({ kind: 'flower', x: s.x + 4.4, z: fz - 3.2, r: 0 })
  }
  // 뒷골목 가로등: 골목 북쪽 가장자리 (칸 사이 경계)
  for (let r = 1; r < ROWS; r++)
    for (let c = -4; c <= 3; c += 2) out.push({ kind: 'lamp', x: colX(c) + LOT_W / 2, z: FENCE_Z + rowOff(r) - 0.3, r: 0.25 })
  out.push(...placeProps(zn))
  return out
}

/** 동네 장소들 (편의점 앞 · 포장마차 · 뒷산 · 바닷가). 집 수가 바뀌면 같이 옮겨 간다 */
function placeProps(z: Zones): Prop[] {
  const out: Prop[] = []
  const cvs = shopRect('cvs')
  const S = cvs.x
  // ─── 편의점 앞: 파라솔 테이블 둘 · 자판기 · 분리수거함 ───
  out.push({ kind: 'ptable', x: S - 3.3, z: cvs.z1 + 1.2, r: 0.5 })
  out.push({ kind: 'ptable', x: S - 0.6, z: cvs.z1 + 1.2, r: 0.5 })
  out.push({ kind: 'vending', x: S + 4.2, z: cvs.z1 + 0.42, r: 0, box: [0.48, 0.36] })
  out.push({ kind: 'bins', x: S - 4.35, z: cvs.z1 + 0.36, r: 0, box: [0.55, 0.3] })
  // 길 건너 포장마차 (밤에 불이 켜진다): 화면 쪽(남)으로 열려 있고, 손님은 남쪽 의자에 앉아 안쪽 조리대를 본다
  out.push({ kind: 'pocha', x: z.pocha.x, z: z.pocha.z, r: 0, rot: Math.PI, box: [1.75, 1.15] })
  // 포장마차·뒷산 앞 공원 나무
  for (const [dx, dz, k] of [[-6, 11.5, 'tree'], [-12, 9.2, 'tree'], [-17, 13.2, 'tree'], [-22.5, 9.6, 'tree'], [-28, 12.8, 'tree'], [-33.5, 9.4, 'tree'], [3.6, 12.8, 'bush'], [-3.4, 13.6, 'bush'], [-14.4, 11.4, 'flower'], [-25.4, 11.4, 'flower'], [-36, 14.2, 'bush'], [2.8, 6.4, 'flower']] as const)
    out.push({ kind: k, x: z.pocha.x + dx, z: dz, r: k === 'tree' ? 0.7 : k === 'bush' ? 0.5 : 0 })
  // ─── 큰길 남쪽: 붕어빵 노점 (손님은 길 쪽에 서서 산다) · 버스정류장 (벤치에 앉아 길을 본다) ───
  out.push({ kind: 'bungeo', x: 16.2, z: SIDEWALK_S + 1.0, r: 0, box: [0.85, 0.55] })
  out.push({ kind: 'busstop', x: -9, z: 5.75, r: 0, box: [1.6, 0.42] })
  // ─── 뒷산 ───
  const H = z.hill
  out.push({ kind: 'trail', x: H.x + 2.2, z: -5.9, r: 0 })
  out.push({ kind: 'trailsign', x: H.x + 3.9, z: -5.8, r: 0.2 })
  out.push({ kind: 'pavilion', x: H.x - 1.3, z: H.z - 0.5, r: 0, box: [1.45, 1.45] })
  out.push({ kind: 'scope', x: H.x + 2.4, z: H.z + 2.1, r: 0.32 })
  out.push({ kind: 'summit', x: H.x + 2.1, z: H.z - 1.8, r: 0.42 })
  out.push({ kind: 'twister', x: H.x + 6.4, z: -7.5, r: 0 })
  out.push({ kind: 'spring', x: H.x - 5.4, z: -7.6, r: 0.55 })
  for (const [dx, dz] of [[-9, 2], [-7.2, 5.2], [-10.6, -1.2], [-6.6, -3.6], [-4.2, 5.6], [5.2, 4.6], [7.6, 1.2], [9.6, -1.8], [6.6, -4.6], [-2.6, -6.8], [3.2, -7], [-8, -6.2], [8.6, -6.6], [11, 2.6], [-11.6, 3.2], [-3, 8.2], [9.2, 5.2]] as const)
    out.push({ kind: 'pine', x: H.x + dx, z: H.z + dz, r: 0.55 })
  // ─── 바닷가 ───
  const E = z.he
  for (const bz of [-2.6, -0.9, 0.9, 2.6]) out.push({ kind: 'bollard', x: z.roadEnd + 0.2, z: bz, r: 0.18 })
  out.push({ kind: 'beachsign', x: z.roadEnd - 0.6, z: -4.6, r: 0.25 })
  out.push({ kind: 'sunbeds', x: E + 11.6, z: 7.2, r: 0, box: [1.15, 1.2] })
  out.push({ kind: 'sunbeds', x: E + 15.4, z: 7.2, r: 0, box: [1.15, 1.2] })
  out.push({ kind: 'ball', x: E + 13.6, z: 1.4, r: 0.3 })
  out.push({ kind: 'castle', x: E + 10.4, z: 12.2, r: 0.55 })
  for (const [x, zz] of [[E + 19, -3.4], [E + 19.4, 3.6], [E + 18.8, 13.8]] as const) out.push({ kind: 'shell', x, z: zz, r: 0 })
  out.push({ kind: 'wade', x: E + 22.6, z: 0.4, r: 0 })
  out.push({ kind: 'wade', x: E + 22.4, z: 5.4, r: 0 })
  out.push({ kind: 'fwbox', x: E + 17.6, z: 13.4, r: 0.32 })
  out.push({ kind: 'tower', x: E + 16.6, z: -3.8, r: 0, box: [0.75, 0.75] })
  const P = z.pier
  out.push({ kind: 'fishing', x: E + 27, z: P.z + 0.6, r: 0 })
  out.push({ kind: 'fishing', x: E + 30.4, z: P.z + 0.6, r: 0 })
  out.push({ kind: 'lighthouse', x: P.x1 - 0.95, z: P.z, r: 0.85 })
  out.push({ kind: 'boat', x: E + 31, z: -5.5, r: 0 })
  for (let bz = -14; bz <= 16; bz += 5) if (Math.abs(bz - P.z) > 2) out.push({ kind: 'buoy', x: E + 28.5, z: bz, r: 0 })
  for (const [dx, dz] of [[8.5, -15.5], [11.6, -18.2], [14.8, -15.2], [17.6, -18.6], [20.4, -15.8], [6.2, -19]] as const)
    out.push({ kind: 'pine', x: E + dx, z: dz, r: 0.55 })
  for (const [dx, dz] of [[9, -10.5], [13.2, -11.6], [18.8, -10.8]] as const) out.push({ kind: 'bush', x: E + dx, z: dz, r: 0.5 })
  return out
}

// ─── 공원에서 탈 수 있는 것 ───

export interface ParkSeat {
  /** 'park/swing0:1' — 실시간으로 주고받는 이름 (모든 화면에서 같다) */
  key: string
  item: string
  /** 앉는 자리 (미끄럼틀은 올라가는 꼭대기 받침) */
  x: number
  z: number
  /** 앉아서 보는 쪽 (미끄럼틀은 사다리 쪽: 그 뒤에 서서 올라간다) */
  yaw: number
  /** 놀이기구 가운데와 돌린 각도 (미끄럼틀·그네 움직임에 쓴다) */
  ox: number
  oz: number
  rot: number
}

/** 놀이기구 기준 자리(lx, lz)를 동네 좌표로 */
export const parkLocal = (s: { ox: number; oz: number; rot: number }, lx: number, lz: number): Vec2 => ({
  x: s.ox + lx * Math.cos(s.rot) + lz * Math.sin(s.rot),
  z: s.oz - lx * Math.sin(s.rot) + lz * Math.cos(s.rot),
})

/**
 * 골목에서 쓰는 자리: 기구 기준 [x, z, 보는 쪽(기구 기준 각도)].
 * 앉는 것(그네·벤치·의자)은 앉아서 보는 쪽, 서서 쓰는 것(자판기·약수터)은 기구에서 미니미가 설 쪽.
 * 그네·벤치는 앞(+z)을, 미끄럼틀은 사다리 쪽(뒤)을, 시소는 서로 마주 보고, 모래놀이터는 가운데를 본다
 */
const SEATS: Partial<Record<Prop['kind'], { item: string; at: [number, number, number][] }>> = {
  swing: { item: 'p_swing', at: [[-0.6, 0, 0], [0.6, 0, 0]] },
  bench: { item: 'p_bench', at: [[-0.4, -0.05, 0], [0.4, -0.05, 0]] },
  slide: { item: 'p_slide', at: [[0, -0.9, Math.PI]] },
  seesaw: { item: 'p_seesaw', at: [[-1.0, 0, Math.PI / 2], [1.0, 0, -Math.PI / 2]] },
  sandbox: { item: 'p_sand', at: [[-0.38, 0.36, Math.atan2(0.38, -0.36)], [0.4, -0.3, Math.atan2(-0.4, 0.3)]] },
  // 편의점 앞 파라솔 테이블: 마주 보고 앉는 의자 둘
  ptable: { item: 'o_table', at: [[-0.74, 0, Math.PI / 2], [0.74, 0, -Math.PI / 2]] },
  vending: { item: 'o_vending', at: [[0, 0, 0]] },
  // 붕어빵 노점: 북쪽(길 쪽)에 서서 수레를 본다 · 버스정류장 벤치: 길(북)을 보고 앉는다
  bungeo: { item: 'o_bungeo', at: [[0, 0, Math.PI]] },
  busstop: { item: 'o_bus', at: [[-0.75, -0.05, Math.PI], [0, -0.05, Math.PI], [0.75, -0.05, Math.PI]] },
  // 빈 집터 팻말: 앞(남)에 서서 읽는다
  lotsign: { item: 'e_lotsign', at: [[0, 0, 0]] },
  // 포장마차: 여는 쪽 의자에 나란히 앉아 안쪽 조리대를 본다
  pocha: { item: 'o_pocha', at: [[-0.85, -1.5, 0], [0, -1.5, 0], [0.85, -1.5, 0]] },
  // 정자: 마루 끝에 걸터앉아 동네(남)를 내려다본다
  pavilion: { item: 'm_pavilion', at: [[-0.75, 1.1, 0], [0, 1.1, 0], [0.75, 1.1, 0]] },
  // 망원경: 뒤(북)에 서서 동네를 본다
  scope: { item: 'm_scope', at: [[0, 0, Math.PI]] },
  summit: { item: 'm_summit', at: [[0, 0, 0]] },
  twister: { item: 'm_twister', at: [[0, 0, 0]] },
  spring: { item: 'm_spring', at: [[0, 0, 0]] },
  // 선베드: 발은 바다(동) 쪽으로 눕는다
  sunbeds: { item: 'b_sunbed', at: [[0.25, -0.62, Math.PI / 2], [0.25, 0.62, Math.PI / 2]] },
  ball: { item: 'b_ball', at: [[0, 0, -Math.PI / 2]] },
  castle: { item: 'b_castle', at: [[0, 0, 0]] },
  shell: { item: 'b_shell', at: [[0, 0, -Math.PI / 2]] },
  wade: { item: 'b_wade', at: [[0, 0, Math.PI / 2]] },
  fwbox: { item: 'b_firework', at: [[0, 0, 0]] },
  tower: { item: 'b_tower', at: [[0, 0.02, Math.PI / 2]] },
  fishing: { item: 'b_fish', at: [[0, 0, 0]] },
}

export function parkSeats(props: Prop[]): ParkSeat[] {
  const seen = new Map<string, number>()
  const out: ParkSeat[] = []
  for (const p of props) {
    const def = SEATS[p.kind]
    if (!def) continue
    const k = seen.get(p.kind) ?? 0
    seen.set(p.kind, k + 1)
    const rot = p.rot ?? 0
    def.at.forEach(([lx, lz, face], i) => {
      const at = parkLocal({ ox: p.x, oz: p.z, rot }, lx, lz)
      out.push({ key: `park/${p.kind}${k}:${i}`, item: def.item, x: at.x, z: at.z, yaw: rot + face, ox: p.x, oz: p.z, rot })
    })
  }
  return out
}

// ─── 지나갈 수 없는 곳 ───

type Seg = { a: Vec2; b: Vec2 }

/** 울타리 선분들 (대문 자리는 비운다) */
export function fenceSegments(lot: Slot): Seg[] {
  const l = lot.x - LOT_W / 2 + 0.3
  const r = lot.x + LOT_W / 2 - 0.3
  const f = FENCE_Z + lot.zOff
  const h = HOUSE_FRONT_Z + lot.zOff
  return [
    { a: { x: l, z: f }, b: { x: lot.x - GATE_HALF, z: f } },
    { a: { x: lot.x + GATE_HALF, z: f }, b: { x: r, z: f } },
    { a: { x: l, z: f }, b: { x: l, z: h } },
    { a: { x: r, z: f }, b: { x: r, z: h } },
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
  /** 동네 장소 자리 (골목이 아닌 곳: 편의점 안 같은 데는 없다) */
  zones?: Zones
}

/** 돌린 사각형 안인지 (가운데·반너비·반깊이·각도, pad만큼 넉넉히) */
const inBox = (p: Vec2, cx: number, cz: number, hw: number, hd: number, rot: number, pad: number) => {
  const dx = p.x - cx
  const dz = p.z - cz
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  return Math.abs(dx * c - dz * s) < hw + pad && Math.abs(dx * s + dz * c) < hd + pad
}

const PAD = 0.35

export function buildTown(roomIds: string[]): TownMap {
  const lots = layoutLots(roomIds)
  const props = townProps(lots)
  const bounds = townBounds(lots)
  const fences = lots.flatMap(fenceSegments)
  const solids = props.filter((p) => p.r > 0 && !p.box)
  const boxes = props.filter((p) => p.box)
  const zones = townZones(lots)
  const shops = SHOP_IDS.map(shopRect)
  /** 칸마다 막힌 띠 (집 · 가게 건물 · 빈 집터 뒤쪽): 띠 앞 z부터 칸 뒤 끝까지 막힌다 */
  const houseAt = new Set(lots.map((l) => `${l.row}:${l.col}`))
  const bands = ALL_SLOTS.map((s) => {
    const shop = shopAtSlot(s)
    return { x: s.x, back: HOUSE_BACK_Z + s.zOff - 1, front: shop ? shopRect(shop).z1 : HOUSE_FRONT_Z + s.zOff, house: houseAt.has(`${s.row}:${s.col}`) }
  })
  const gridBack = rowOff(ROWS - 1) + HOUSE_BACK_Z - 1
  const blocked = (p: Vec2) => {
    if (p.x < bounds.minX + 0.5 || p.x > bounds.maxX - 0.5 || p.z < bounds.minZ + 0.5 || p.z > bounds.maxZ - 0.5) return true
    const inGrid = p.x >= zones.hw && p.x <= zones.he
    // 격자 안: 맨 뒷줄 뒤(숲)는 못 간다. 격자 밖: 앞줄 뒤로는 숲, 뒷산만 산기슭까지 올라간다
    if (inGrid ? p.z < gridBack : p.z < HOUSE_BACK_Z - 1 && !(p.x < zones.hw && hillE(zones, p.x, p.z) < 0.97)) return true
    // 가게 건물
    for (const r of shops) if (Math.abs(p.x - r.x) < STORE_W / 2 + PAD && p.z < r.z1 + PAD && p.z > r.z0 - PAD) return true
    // 바다: 물가 얕은 데까지만 (방파제 위는 끝까지)
    if (p.x > zones.wet && !onPier(zones, p)) return true
    if (boxes.some((b) => inBox(p, b.x, b.z, b.box![0], b.box![1], b.rot ?? 0, PAD))) return true
    // 칸: 집은 앞에 조금 더 넉넉히, 집·가게 사이 뒷마당과 집 뒤는 다음 골목까지 막는다
    for (const b of bands) {
      if (p.z < b.back || Math.abs(p.x - b.x) >= LOT_W / 2) continue
      if (p.z < b.front) return true
      if (b.house && Math.abs(p.x - b.x) < HOUSE_W / 2 + PAD && p.z < b.front + PAD) return true
    }
    if (fences.some((s) => segDist(p, s) < PAD)) return true
    for (const lot of lots) {
      const m = mailboxSpot(lot)
      if (Math.hypot(p.x - m.x, p.z - m.z) < 0.4) return true
    }
    return solids.some((s) => Math.hypot(p.x - s.x, p.z - s.z) < s.r)
  }
  return { lots, props, bounds, blocked, zones }
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

/**
 * a→b 직선이 막힌 데를 안 지나는지.
 * 먼저 미리 재 둔 칸 지도로 빠르게 걸러 내고(대부분 여기서 끝난다), 통과한 선만 정확히 다시 본다.
 * (격자 동네는 꺾이는 길이 많아 줄 당기기가 이 검사를 아주 많이 부른다)
 */
function clearRun(map: TownMap, a: Vec2, b: Vec2) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.15)
  const { nx, nz, g } = townGrid(map)
  for (let k = 1; k < steps; k++) {
    const t = k / steps
    const i = Math.floor((a.x + (b.x - a.x) * t - map.bounds.minX) / CELL)
    const j = Math.floor((a.z + (b.z - a.z) * t - map.bounds.minZ) / CELL)
    if (i < 0 || j < 0 || i >= nx || j >= nz) return false
    if (g[j * nx + i] && map.blocked({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false
  }
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

/** 이 자리가 물건 사각형(pad만큼 넉넉히) 안인지 */
export function insideObstacle(list: Obstacle[], p: Vec2, pad = 0) {
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

/** 물건 자리를 집 안 길찾기가 쓰는 막힘 검사로. pad만큼 넉넉히 비켜 간다 */
export function obstacleBlocker(list: Obstacle[], pad = 0.12): Blocker {
  return (uv) => insideObstacle(list, uvToHouse(uv), pad)
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
