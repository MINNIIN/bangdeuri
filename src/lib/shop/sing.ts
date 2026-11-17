/**
 * 골목 코인노래방 안 (방들이코인노래방). 가게 목록(lib/shops.ts)에 등록된다.
 *
 *   (북)  [화면 1번방   ][화면 2번방   ][화면 3번방   ][동전교환기]
 *          탬│ 🎤 🎤      탬│ 🎤 🎤      탬│ 🎤 🎤
 *          소│            소│            소│
 *          파│            파│            파│
 *   (가운데) ══유리══  문   ══유리══  문   ══유리══  문      ┃카운터┃ 사장님
 *          [대기 의자]                    [문]
 *   (남)
 *
 * 단위는 m, 가운데가 원점. x가 동쪽, z가 남쪽(골목 쪽). 문은 남쪽 벽 x=2.
 * 부스는 x -5~-2.5 · -2.5~0 · 0~2.5, z -3.5~0 (남쪽 유리 칸막이에 문 자리).
 */
import type { Interaction } from '../interactions'
import type { ShopDef, ShopSolid, ShopSpot } from './types'

export const SING_HW = 5
export const SING_HD = 3.5
export const SING_DOOR_X = 2

/** 부스 하나 너비 · 깊이 (북쪽 벽 ~ 앞 칸막이 z=0) */
export const BOOTH_W = 2.5
export const BOOTH_FRONT_Z = 0
/** 부스 n의 서쪽 끝 x */
export const boothX0 = (n: number) => -SING_HW + n * BOOTH_W
/** 부스 안 물건 자리 (서쪽 끝 기준) */
export const SOFA_DX = 0.33
export const SOFA_Z = -1.45
export const MIC_DX = [1.6, 2.1]
export const MIC_Z = -2.6
export const TAMB_DX = 0.42
export const TAMB_Z = -3.25

/** 동전교환기 · 카운터 · 사장님 */
export const COIN = { x: 3.75, z: -3.15 }
export const COUNTER = { x: 4.0, z: 1.2 }
const BOSS_SPOT = { x: 4.55, z: 1.2, yaw: -Math.PI / 2 }

const solids: ShopSolid[] = []
const spots: ShopSpot[] = []
for (let n = 0; n < 3; n++) {
  const x0 = boothX0(n)
  // 칸막이: 서쪽 (맨 서쪽 부스는 벽) · 남쪽 앞 (서쪽 1m만, 나머지는 문 자리)
  if (n > 0) solids.push({ x: x0, z: -SING_HD / 2, hw: 0.04, hd: SING_HD / 2 })
  solids.push({ x: x0 + 0.5, z: BOOTH_FRONT_Z, hw: 0.5, hd: 0.04 })
  // 소파 (서쪽에 붙어 동쪽을 본다)
  solids.push({ x: x0 + SOFA_DX, z: SOFA_Z, hw: 0.25, hd: 0.6 })
  spots.push({ key: `sing/sofa${n}:0`, item: 'sg_sofa', x: x0 + SOFA_DX, z: SOFA_Z - 0.3, yaw: Math.PI / 2 })
  spots.push({ key: `sing/sofa${n}:1`, item: 'sg_sofa', x: x0 + SOFA_DX, z: SOFA_Z + 0.3, yaw: Math.PI / 2 })
  // 마이크 스탠드 둘 (화면 쪽을 보고 노래한다)
  for (const [i, dx] of MIC_DX.entries()) {
    solids.push({ x: x0 + dx, z: MIC_Z, hw: 0.05, hd: 0.05 })
    spots.push({ key: `sing/mic${n}:${i}`, item: 'sg_mic', x: x0 + dx, z: MIC_Z, yaw: 0 })
  }
  // 탬버린 탁자 (북서 구석)
  solids.push({ x: x0 + TAMB_DX, z: TAMB_Z, hw: 0.22, hd: 0.15 })
  spots.push({ key: `sing/tamb${n}`, item: 'sg_tamb', x: x0 + TAMB_DX, z: TAMB_Z, yaw: 0 })
}
// 마지막 부스 동쪽 칸막이
solids.push({ x: boothX0(3), z: -SING_HD / 2, hw: 0.04, hd: SING_HD / 2 })
solids.push(
  // 동전교환기 (북동 구석)
  { x: COIN.x, z: COIN.z, hw: 0.4, hd: 0.3 },
  // 카운터 + 그 뒤 사장님 자리 (손님은 못 들어간다)
  { x: 4.4, z: COUNTER.z, hw: 0.6, hd: 0.9 },
  // 서쪽 대기 의자
  { x: -4.6, z: 2.0, hw: 0.28, hd: 0.7 },
)
spots.push({ key: 'sing/coin', item: 'sg_coin', x: COIN.x, z: COIN.z, yaw: 0 })

/** 부스 화면에 뜨는 가짜 곡 제목 (부스 0·1·2) */
export const SING_SONGS = ['♪ 방들이 블루스', '♪ 새벽 세 시의 컵라면', '♪ 우리 동네 골목길']

const items: Record<string, Interaction> = {
  sg_mic: {
    verb: '노래하기',
    pose: 'dance',
    fx: ['notes'],
    lines: ['♪ 방들이 블루스', '♪ 편의점 앞에서', '♪ 새벽 세 시의 컵라면', '♪ 우리 동네 골목길', '♪ 미니미의 하루', '고음 간다!', '점수 100점 나와라', '이 노래 내 십팔번이야'],
  },
  sg_sofa: {
    verb: '호응하기',
    pose: 'sit',
    fx: ['hearts'],
    lines: ['(짝짝짝) 잘한다~', '앵콜! 앵콜!', '와 가수 데뷔해도 되겠다', '다음 곡은 내 차례!', '(박수) 고음 미쳤다'],
  },
  sg_tamb: { verb: '탬버린 치기', pose: 'dance', fx: ['sparkle'], lines: ['찰찰찰!', '분위기 띄운다~', '탬버린은 나한테 맡겨', '찰찰 찰찰찰!'] },
  sg_coin: { verb: '동전 바꾸기', pose: 'back', fx: ['ring'], lines: ['천 원 넣고… 짤랑짤랑', '500원짜리로 바꿔야지', '몇 곡 부를까?'], ms: 2600 },
}

export const SING_SHOP: ShopDef = {
  id: 'sing',
  name: '방들이코인노래방',
  icon: '🎤',
  desc: '한 곡 뽑기',
  hw: SING_HW,
  hd: SING_HD,
  wallH: 3,
  doorX: SING_DOOR_X,
  entrance: { x: SING_DOOR_X, z: 2.35 },
  exit: { x: SING_DOOR_X, z: 3.05 },
  solids,
  spots,
  npc: {
    id: 'npc:sing',
    name: '사장님',
    spot: BOSS_SPOT,
    hello: ['어서오세요~ 방들이코인노래방!', '빈 방 아무 데나 들어가세요~', '어서와요~ 한 곡 500원!'],
    idle: ['3번방 노래 잘하네~', '마이크 소독 다 했어요', '동전은 저쪽 교환기에서 바꿔요', '(흥얼흥얼) 방들이 블루스~'],
    reply: { item: 'sg_coin', lines: ['서비스 두 곡 넣어 드렸어요~', '오늘 손님 운 좋네! 서비스 두 곡~', '마이크는 살살 써 줘요~', '노래 끝나면 또 와요~'] },
  },
  light: 'dark',
  items,
}
