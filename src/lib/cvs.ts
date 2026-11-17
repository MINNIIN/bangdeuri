/**
 * 골목 편의점 안 (방들이편의점24). 가게 목록(lib/shops.ts)의 첫 가게 — 집 안처럼 따로 떨어진 공간(area 'cvs')이다.
 *
 *   (북)  [ 음료 냉장고 ······ ][김밥·도시락][아이스크림]
 *          │라면│과자│  │생활│빵│        ┃계산대┃ 알바생
 *          │진열대│      │진열대│        ┃      ┃
 *   (남)  [ 창가 바 · 의자 3 ][온수기]      [문]
 *
 * 단위는 m, 가운데가 원점. x가 동쪽, z가 남쪽(골목 쪽). 문은 남쪽 벽 x=2.
 */
import type { Vec2 } from './town'
import type { ShopDef, ShopSolid, ShopSpot } from './shop/types'

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


export const CVS_SOLIDS: ShopSolid[] = [
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

export const CVS_SPOTS: ShopSpot[] = [
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

export const CVS_SHOP: ShopDef = {
  id: 'cvs',
  name: '방들이편의점24',
  icon: '🏪',
  desc: '들어가서 장보기',
  hw: CVS_HW,
  hd: CVS_HD,
  wallH: CVS_WALL_H,
  doorX: CVS_DOOR_X,
  entrance: CVS_ENTRANCE,
  exit: CVS_EXIT,
  solids: CVS_SOLIDS,
  spots: CVS_SPOTS,
  npc: {
    id: 'npc:cvs',
    name: '알바생',
    spot: CLERK_SPOT,
    hello: ['어서오세요~ 방들이편의점24입니다!', '어서오세요~', '안녕하세요~ 천천히 둘러보세요'],
    idle: ['1+1 행사 중이에요~', '컵라면은 저쪽 진열대에 있어요', '온수는 창가 쪽이에요', '(하품) 오늘 손님 많네'],
    reply: { item: 'c_counter', lines: ['삑- 삑- 3,800원입니다!', '봉투 필요하세요?', '포인트 적립하시겠어요?', '감사합니다~ 또 오세요!'] },
  },
  light: 'white',
  items: {},
}
