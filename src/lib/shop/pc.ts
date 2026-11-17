/**
 * 골목 PC방 안 (방들이PC방). 어둑한 방에 모니터·키보드 RGB가 빛난다.
 *
 *   (북)  [ PC 0 · 1 · 2 · 3 (벽 쪽) ]  [음료 냉장고]  [메뉴판] 알바생
 *            의자 의자 의자 의자                   ┃카운터┃
 *          [ PC 4 · 5 · 6 · 7 (가운데 책상) ]       ┃      ┃
 *            의자 의자 의자 의자
 *   (남)  [화분·포스터]                 [문]
 *
 * 단위는 m, 가운데가 원점. x가 동쪽, z가 남쪽(골목 쪽). 문은 남쪽 벽 x=2. 의자는 모두 북쪽(모니터)을 본다.
 */
import type { ShopDef, ShopSolid, ShopSpot } from './types'

export const PC_HW = 5.5
export const PC_HD = 4
export const PC_DOOR_X = 2

/** 자리 x (두 줄 모두 같은 x) */
export const PC_SEAT_X = [-4.6, -3.5, -2.4, -1.3]
/** 벽 쪽 책상 · 가운데 책상 (가운데 z) · 의자 줄 z */
export const PC_DESK_A_Z = -3.62
export const PC_DESK_B_Z = -0.5
export const PC_ROW_A_Z = -2.85
export const PC_ROW_B_Z = 0.3
/** 책상 x 범위 */
export const PC_DESK_X0 = -5.5
export const PC_DESK_X1 = -0.65

/** 음료 냉장고 · 카운터 · 알바생 */
export const PC_FRIDGE = { x: 1.3, z: -3.58 }
export const PC_COUNTER = { x: 3.6, z: -1.6 }
const CLERK = { x: 4.7, z: -1.6, yaw: -Math.PI / 2 }

const DESK_CX = (PC_DESK_X0 + PC_DESK_X1) / 2
const DESK_HW = (PC_DESK_X1 - PC_DESK_X0) / 2

const SOLIDS: ShopSolid[] = [
  // 벽 쪽 책상 · 가운데 책상
  { x: DESK_CX, z: PC_DESK_A_Z, hw: DESK_HW, hd: 0.38 },
  { x: DESK_CX, z: PC_DESK_B_Z, hw: DESK_HW, hd: 0.36 },
  // 의자 8개
  ...PC_SEAT_X.flatMap((x) => [
    { x, z: PC_ROW_A_Z, hw: 0.24, hd: 0.24 },
    { x, z: PC_ROW_B_Z, hw: 0.24, hd: 0.24 },
  ]),
  // 음료 냉장고
  { x: PC_FRIDGE.x, z: PC_FRIDGE.z, hw: 0.62, hd: 0.42 },
  // 카운터 + 그 뒤 알바생 자리 (손님은 못 들어간다)
  { x: PC_COUNTER.x, z: PC_COUNTER.z, hw: 0.36, hd: 1.15 },
  { x: 4.75, z: -2.2, hw: 0.75, hd: 1.8 },
  // 남서쪽 화분 · 쓰레기통
  { x: -5.05, z: 3.55, hw: 0.3, hd: 0.3 },
  { x: -4.4, z: 3.65, hw: 0.2, hd: 0.2 },
]

const SPOTS: ShopSpot[] = [
  ...PC_SEAT_X.map((x, i) => ({ key: `pc/seat:${i}`, item: 'pc_seat', x, z: PC_ROW_A_Z, yaw: Math.PI })),
  ...PC_SEAT_X.map((x, i) => ({ key: `pc/seat:${i + 4}`, item: 'pc_seat', x, z: PC_ROW_B_Z, yaw: Math.PI })),
  { key: 'pc/counter', item: 'pc_counter', x: PC_COUNTER.x - 0.36, z: PC_COUNTER.z, yaw: -Math.PI / 2 },
  { key: 'pc/drink', item: 'pc_drink', x: PC_FRIDGE.x, z: PC_FRIDGE.z + 0.42, yaw: 0 },
]

export const PC_SHOP: ShopDef = {
  id: 'pc',
  name: '방들이PC방',
  icon: '🖥️',
  desc: '게임 한 판',
  hw: PC_HW,
  hd: PC_HD,
  wallH: 3,
  doorX: PC_DOOR_X,
  entrance: { x: PC_DOOR_X, z: PC_HD - 1.15 },
  exit: { x: PC_DOOR_X, z: PC_HD - 0.45 },
  solids: SOLIDS,
  spots: SPOTS,
  npc: {
    id: 'npc:pc',
    name: '알바생',
    spot: CLERK,
    hello: ['어서오세요~ 방들이PC방입니다!', '어서오세요~ 빈자리 아무 데나 앉으세요', '안녕하세요~ 오늘 자리 많아요'],
    idle: ['라면 주문은 카운터에서요~', '음료는 냉장고에서 꺼내 드세요', '(하품) 밤샘 근무 3일째…', '7번 자리 키보드 새로 바꿨어요'],
    reply: { item: 'pc_counter', lines: ['라면 나왔습니다~', '계란 추가해 드렸어요!', '1시간 충전 완료~', '음료는 냉장고에서 골라 가세요~'] },
  },
  light: 'dark',
  items: {
    pc_seat: {
      verb: '게임하기',
      pose: 'sit',
      seat: 5,
      // 의자는 책상을 보고 있어서, 보는 쪽(책상)으로 다가가지 않고 의자 자리로 곧장 가서 앉는다
      exact: true,
      fx: ['game', 'type'],
      lines: ['한 판만 더…', '에이스!', '아 렉 걸렸어!!', '옆자리 친구 같이 하자', '이번 판은 이긴다', '랭크 올라간다~', '우주 슈팅 최고 기록!', '블록 쌓기 한 줄 남았어'],
      leave: { fx: 'sparkle', line: '오늘은 여기까지!' },
    },
    pc_counter: { verb: '라면 주문하기', pose: 'stand', fx: ['steam'], lines: ['라면 하나요! 계란 추가요', '1시간 충전이요~', '김치볶음밥도 돼요?', '젓가락 하나 더 주세요'], ms: 2800 },
    pc_drink: { verb: '음료 고르기', pose: 'back', fx: ['fridge'], lines: ['게임엔 탄산이지', '에너지 음료 한 캔!', '오늘은 아이스티로', '시원하다~'], ms: 2600 },
  },
}
