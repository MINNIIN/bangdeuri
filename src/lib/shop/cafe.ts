/**
 * 골목 카페 안 (카페 방들이). 가게 목록(lib/shops.ts)에 등록된다 — 따로 떨어진 공간(area 'cafe').
 *
 *   (북)  [ 테이블0 ]   [ 테이블1 ]     [디저트][  주문대  ] ← 바리스타 · 커피 머신
 *          의자 마주 봄   의자 마주 봄
 *         [ 테이블2 ]   [ 테이블3 ]
 *   (남)  [ 창가 바 · 의자 3 ]                  [문]
 *
 * 단위는 m, 가운데가 원점. x가 동쪽, z가 남쪽(골목 쪽). 문은 남쪽 벽 x=2.
 */
import type { ShopDef, ShopSolid, ShopSpot } from './types'

const HW = 5
const HD = 3.5
const DOOR_X = 2

/** 테이블 가운데 (북쪽 줄 · 가운데 줄) */
export const CAFE_TABLES = [
  { x: -3.6, z: -2.1 },
  { x: -1.3, z: -2.1 },
  { x: -3.6, z: 0.0 },
  { x: -1.3, z: 0.0 },
]
/** 테이블 가운데에서 의자까지 (북쪽 의자 · 남쪽 의자) */
export const CAFE_CHAIR_DZ = 0.6
/** 창가 바 의자 x (남쪽 창 앞) */
export const CAFE_BAR_X = [-3.9, -2.6, -1.3]
export const CAFE_BAR_Z = 2.5
/** 주문대 (디저트 진열장 + 계산대, 동서로 길다) */
export const CAFE_COUNTER = { x0: 0.4, x1: 4.6, z: -1.9 }

const seatSolids: ShopSolid[] = CAFE_TABLES.flatMap((t) => [
  { x: t.x, z: t.z, hw: 0.35, hd: 0.35 },
  { x: t.x, z: t.z - CAFE_CHAIR_DZ, hw: 0.2, hd: 0.2 },
  { x: t.x, z: t.z + CAFE_CHAIR_DZ, hw: 0.2, hd: 0.2 },
])

export const CAFE_SOLIDS: ShopSolid[] = [
  // 주문대 (디저트 진열장까지 한 줄)
  { x: (CAFE_COUNTER.x0 + CAFE_COUNTER.x1) / 2, z: CAFE_COUNTER.z, hw: (CAFE_COUNTER.x1 - CAFE_COUNTER.x0) / 2, hd: 0.35 },
  // 주문대 뒤 바리스타 자리 + 뒷선반 (손님은 못 들어간다)
  { x: 2.55, z: -2.85, hw: 2.2, hd: 0.6 },
  ...seatSolids,
  // 남쪽 창가 바 · 의자
  { x: -2.6, z: 3.15, hw: 2.0, hd: 0.28 },
  ...CAFE_BAR_X.map((x) => ({ x, z: CAFE_BAR_Z, hw: 0.18, hd: 0.18 })),
  // 동쪽 구석 화분
  { x: 4.4, z: 2.9, hw: 0.3, hd: 0.3 },
]

export const CAFE_SPOTS: ShopSpot[] = [
  { key: 'cafe/order', item: 'cf_order', x: 3.0, z: CAFE_COUNTER.z, yaw: 0 },
  { key: 'cafe/dessert', item: 'cf_dessert', x: 1.0, z: CAFE_COUNTER.z, yaw: 0 },
  // 테이블마다 북쪽 의자(남쪽을 본다) · 남쪽 의자(북쪽을 본다) — 마주 보고 앉는다
  ...CAFE_TABLES.flatMap((t, n) => [
    { key: `cafe/seat${n}:0`, item: 'cf_seat', x: t.x, z: t.z - CAFE_CHAIR_DZ, yaw: 0 },
    { key: `cafe/seat${n}:1`, item: 'cf_seat', x: t.x, z: t.z + CAFE_CHAIR_DZ, yaw: Math.PI },
  ]),
  // 창가 바: 남쪽 창 바깥을 본다
  ...CAFE_BAR_X.map((x, i) => ({ key: `cafe/bar:${i}`, item: 'cf_bar', x, z: CAFE_BAR_Z, yaw: 0 })),
]

export const CAFE_SHOP: ShopDef = {
  id: 'cafe',
  name: '카페 방들이',
  icon: '☕',
  desc: '커피 한 잔',
  hw: HW,
  hd: HD,
  wallH: 3,
  doorX: DOOR_X,
  entrance: { x: DOOR_X, z: 2.35 },
  exit: { x: DOOR_X, z: 3.05 },
  solids: CAFE_SOLIDS,
  spots: CAFE_SPOTS,
  npc: {
    id: 'npc:cafe',
    name: '바리스타',
    spot: { x: 3.0, z: -2.75, yaw: 0 },
    hello: ['어서오세요~ 카페 방들이입니다!', '어서오세요~ 편하게 앉으세요', '안녕하세요~ 주문은 여기서 도와드려요'],
    idle: ['오늘 원두 향 좋다~', '(치이익) 우유 거품 내는 중', '딸기 케이크 방금 나왔어요!', '창가 자리 비었어요~'],
    reply: { item: 'cf_order', lines: ['주문하신 음료 나왔습니다~', '진동벨 울리면 오세요!', '시럽은 저쪽에 있어요~', '맛있게 드세요~'] },
  },
  light: 'warm',
  items: {
    cf_order: {
      verb: '주문하기',
      pose: 'stand',
      fx: ['ring'],
      lines: ['아이스 아메리카노 하나요', '따뜻한 라떼 주세요', '오늘의 커피 한 잔이요', '얼음 많이 주세요!', '구름 크림 라떼 하나요'],
      ms: 2800,
    },
    cf_seat: {
      verb: '커피 마시기',
      pose: 'sit',
      seat: 5,
      fx: ['steam'],
      lines: ['커피 한 모금… 행복', '그래서 걔가 뭐랬는데?', '수다엔 커피지', '여기 분위기 좋다~', '리필 되나?'],
    },
    cf_bar: {
      verb: '창가에 앉기',
      pose: 'sit',
      seat: 5,
      fx: ['steam'],
      lines: ['창밖 구경하며 홀짝', '지나가는 사람 구경', '멍 때리기 좋은 자리', '비 오면 더 좋겠다'],
    },
    cf_dessert: {
      verb: '케이크 고르기',
      pose: 'back',
      fx: ['sparkle'],
      lines: ['딸기 케이크 vs 초코 케이크', '마카롱 색깔 너무 예쁘다', '오늘은 치즈 케이크다', '하나만… 아니 두 개'],
      ms: 2600,
    },
  },
}
