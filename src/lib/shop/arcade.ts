/**
 * 골목 오락실 안 (방들이오락실). 가게 목록(lib/shops.ts)에 등록된다 — 따로 떨어진 공간(area 'arcade').
 *
 *   (북)  [집게왕][집게왕] [둠칫스텝]  [꽝꽝펀치] [경품장]  [동전]
 *                           (발판)
 *         ┃레이싱┃의자
 *         ┃레이싱┃의자                  [에어하키]
 *   (남)  [캡슐뽑기]                  [문]
 *
 * 단위는 m, 가운데가 원점. x가 동쪽, z가 남쪽(골목 쪽). 문은 남쪽 벽 x=2.
 * 게임 이름은 모두 가짜다.
 */
import type { Vec2 } from '../town'
import type { ShopDef, ShopSolid, ShopSpot } from './types'

export const ARCADE_HW = 5.5
export const ARCADE_HD = 4
export const ARCADE_DOOR_X = 2

/** 인형뽑기 두 대 (북쪽 벽, 서쪽 끝) */
export const CLAW_X = [-4.4, -3.15] as const
export const CLAW_Z = -3.45
/** 리듬게임 (발판은 앞 바닥) */
export const RHYTHM = { x: -1.2, z: -3.5 }
/** 펀치기 · 경품장 · 동전교환기 */
export const PUNCH = { x: 0.9, z: -3.55 }
export const PRIZE = { x: 2.9, z: -3.65 }
export const COIN = { x: 4.7, z: -3.65 }
/** 레이싱 두 대: 서쪽 벽에 게임기(화면은 동쪽을 본다), 그 앞에 의자 */
export const RACE_Z = [-0.9, 0.9] as const
export const RACE_CAB_X = -4.85
export const RACE_SEAT_X = -3.6
/** 에어하키 · 캡슐뽑기 (구경만) */
export const HOCKEY = { x: 3.6, z: 0.3 }
export const GACHA = { x: -4.35, z: 3.3 }

const ENTRANCE: Vec2 = { x: ARCADE_DOOR_X, z: ARCADE_HD - 1.15 }
const EXIT: Vec2 = { x: ARCADE_DOOR_X, z: ARCADE_HD - 0.45 }

const SOLIDS: ShopSolid[] = [
  ...CLAW_X.map((x) => ({ x, z: CLAW_Z, hw: 0.55, hd: 0.5 })),
  { x: RHYTHM.x, z: RHYTHM.z, hw: 0.62, hd: 0.45 },
  { x: PUNCH.x, z: PUNCH.z, hw: 0.45, hd: 0.4 },
  { x: PRIZE.x, z: PRIZE.z, hw: 0.75, hd: 0.3 },
  { x: COIN.x, z: COIN.z, hw: 0.4, hd: 0.3 },
  ...RACE_Z.flatMap((z) => [
    { x: RACE_CAB_X, z, hw: 0.6, hd: 0.6 },
    { x: RACE_SEAT_X, z, hw: 0.3, hd: 0.3 },
  ]),
  { x: HOCKEY.x, z: HOCKEY.z, hw: 0.55, hd: 0.9 },
  { x: GACHA.x, z: GACHA.z, hw: 0.75, hd: 0.3 },
]

const SPOTS: ShopSpot[] = [
  ...CLAW_X.map((x, i) => ({ key: `arcade/claw:${i}`, item: 'ar_claw', x, z: CLAW_Z + 0.5, yaw: 0 })),
  { key: 'arcade/rhythm', item: 'ar_rhythm', x: RHYTHM.x, z: RHYTHM.z + 0.45, yaw: 0 },
  { key: 'arcade/punch', item: 'ar_punch', x: PUNCH.x, z: PUNCH.z + 0.4, yaw: 0 },
  { key: 'arcade/coin', item: 'ar_coin', x: COIN.x, z: COIN.z + 0.3, yaw: 0 },
  // 레이싱 의자: 앉아서 서쪽 화면을 본다
  ...RACE_Z.map((z, i) => ({ key: `arcade/race:${i}`, item: 'ar_race', x: RACE_SEAT_X, z, yaw: -Math.PI / 2 })),
]

export const ARCADE_SHOP: ShopDef = {
  id: 'arcade',
  name: '방들이오락실',
  icon: '🕹️',
  desc: '인형뽑기 · 펀치기',
  hw: ARCADE_HW,
  hd: ARCADE_HD,
  wallH: 3,
  doorX: ARCADE_DOOR_X,
  entrance: ENTRANCE,
  exit: EXIT,
  solids: SOLIDS,
  spots: SPOTS,
  light: 'dark',
  items: {
    ar_claw: {
      verb: '인형뽑기',
      pose: 'back',
      fx: ['sparkle'],
      lines: ['아 집게 힘 왜 이래', '거의 다 왔는데…!', '집게가 스르륵…', '한 판만 더…', '저 곰돌이 노린다', '뽑았다!!!'],
      ms: 3200,
    },
    ar_punch: { verb: '펀치 날리기', pose: 'dance', fx: ['shock'], lines: ['987점!', '오늘 최고 기록!', '456점… 다시!', '손목 나갈 뻔', '펀치왕 등극!'], ms: 2600 },
    ar_rhythm: { verb: '리듬게임', pose: 'dance', fx: ['notes'], lines: ['둠칫둠칫', '풀콤보 가자!', '발이 꼬였다…', '퍼펙트! 퍼펙트!'], ms: 4000 },
    ar_race: { verb: '레이싱', pose: 'sit', seat: 5, fx: ['game'], lines: ['부릉부릉~', '드리프트!!', '1등 가즈아', '앗 벽에 박았다'] },
    ar_coin: { verb: '동전 바꾸기', pose: 'back', fx: ['ring'], lines: ['짤랑짤랑~', '천 원 = 동전 열 개', '동전 부자 됐다'], ms: 2400 },
  },
}
