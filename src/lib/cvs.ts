/**
 * 골목 편의점 안 (방들이마트 24). 집 안처럼 따로 떨어진 공간(area 'cvs')이다.
 *
 *   (북)  [ 음료 냉장고 ······ ][김밥·도시락][아이스크림]
 *          │라면│과자│  │생활│빵│        ┃계산대┃ 알바생
 *          │진열대│      │진열대│        ┃      ┃
 *   (남)  [ 창가 바 · 의자 3 ][온수기]      [문]
 *
 * 단위는 m, 가운데가 원점. x가 동쪽, z가 남쪽(골목 쪽). 문은 남쪽 벽 x=2.
 */
import type { TownMap, Vec2 } from './town'

/** 안쪽 벽 반너비·반깊이 */
export const CVS_HW = 5
export const CVS_HD = 3.5
export const CVS_WALL_H = 3

/** 문 (남쪽 벽) · 들어오면 서는 곳 · 나갈 때 걸어가는 곳 */
export const CVS_DOOR_X = 2
export const CVS_ENTRANCE: Vec2 = { x: CVS_DOOR_X, z: 2.35 }
export const CVS_EXIT: Vec2 = { x: CVS_DOOR_X, z: 3.05 }

/** 알바생 자리 (계산대 뒤, 손님 쪽을 본다) */
export const CLERK_SPOT = { x: 4.3, z: -0.35, yaw: -Math.PI / 2 }

/** 못 지나가는 것: 가운데·반너비·반깊이 */
export interface CvsSolid {
  x: number
  z: number
  hw: number
  hd: number
}

export const CVS_SOLIDS: CvsSolid[] = [
  // 북쪽 벽: 음료 냉장고 · 김밥 냉장 매대 · 아이스크림 냉동고
  { x: -2.1, z: -3.15, hw: 2.6, hd: 0.36 },
  { x: 1.7, z: -3.17, hw: 0.9, hd: 0.34 },
  { x: 3.85, z: -3.0, hw: 0.85, hd: 0.42 },
  // 가운데 진열대 둘
  { x: -2.6, z: -0.35, hw: 0.32, hd: 1.35 },
  { x: -0.2, z: -0.35, hw: 0.32, hd: 1.35 },
  // 계산대 + 그 뒤 알바생 자리 (손님은 못 들어간다)
  { x: 3.25, z: -0.35, hw: 0.35, hd: 1.25 },
  { x: 4.35, z: -0.75, hw: 0.7, hd: 1.85 },
  // 남쪽 창가 바 · 온수기 탁자
  { x: -2.8, z: 3.17, hw: 1.9, hd: 0.34 },
  { x: 0.05, z: 3.15, hw: 0.55, hd: 0.36 },
  // 창가 의자
  { x: -4.0, z: 2.45, hw: 0.2, hd: 0.2 },
  { x: -2.8, z: 2.45, hw: 0.2, hd: 0.2 },
  { x: -1.6, z: 2.45, hw: 0.2, hd: 0.2 },
]

/** 누르면 쓰는 것: 이름 · 아이템 종류 · 자리 · 보는 쪽 (서서 쓰는 건 미니미가 설 쪽, 앉는 건 앉아서 보는 쪽) */
export interface CvsSpot {
  key: string
  item: string
  x: number
  z: number
  yaw: number
}

export const CVS_PREFIX = 'cvs/'

export const CVS_SPOTS: CvsSpot[] = [
  { key: 'cvs/drink:0', item: 'c_drink', x: -3.4, z: -2.8, yaw: 0 },
  { key: 'cvs/drink:1', item: 'c_drink', x: -1.0, z: -2.8, yaw: 0 },
  { key: 'cvs/kimbap', item: 'c_kimbap', x: 1.7, z: -2.84, yaw: 0 },
  { key: 'cvs/icecream', item: 'c_icecream', x: 3.85, z: -2.58, yaw: 0 },
  { key: 'cvs/ramen', item: 'c_ramen', x: -2.92, z: -0.35, yaw: -Math.PI / 2 },
  { key: 'cvs/snack', item: 'c_snack', x: -2.28, z: -0.35, yaw: Math.PI / 2 },
  { key: 'cvs/goods', item: 'c_goods', x: -0.52, z: -0.35, yaw: -Math.PI / 2 },
  { key: 'cvs/bread', item: 'c_bread', x: 0.12, z: -0.35, yaw: Math.PI / 2 },
  { key: 'cvs/counter', item: 'c_counter', x: 2.9, z: -0.35, yaw: -Math.PI / 2 },
  { key: 'cvs/water', item: 'c_water', x: 0.05, z: 2.82, yaw: Math.PI },
  { key: 'cvs/stool:0', item: 'c_stool', x: -4.0, z: 2.45, yaw: 0 },
  { key: 'cvs/stool:1', item: 'c_stool', x: -2.8, z: 2.45, yaw: 0 },
  { key: 'cvs/stool:2', item: 'c_stool', x: -1.6, z: 2.45, yaw: 0 },
]

export const cvsSpot = (key: string) => CVS_SPOTS.find((s) => s.key === key) ?? null

/** 같은 이름 앞머리를 쓰는 자리들 (cvs/drink → cvs/drink:0, cvs/drink:1) */
export const cvsGroup = (base: string) => CVS_SPOTS.filter((s) => s.key === base || s.key.startsWith(base + ':'))

const PAD = 0.3

/** 편의점 안 길찾기용 지도 (골목 길찾기를 그대로 쓴다) */
export const CVS_MAP: TownMap = {
  lots: [],
  props: [],
  bounds: { minX: -CVS_HW - 0.25, maxX: CVS_HW + 0.25, minZ: -CVS_HD - 0.25, maxZ: CVS_HD + 0.25 },
  blocked: (p) => {
    if (Math.abs(p.x) > CVS_HW - 0.25 || Math.abs(p.z) > CVS_HD - 0.25) return true
    return CVS_SOLIDS.some((s) => Math.abs(p.x - s.x) < s.hw + PAD && Math.abs(p.z - s.z) < s.hd + PAD)
  },
}
