/**
 * 들어갈 수 있는 가게 하나의 정의 (편의점 · PC방 · 코인노래방 · 오락실 · 코인빨래방 · 카페).
 * 가게 안은 집 안처럼 따로 떨어진 공간(area = 가게 id)이다.
 *
 * 단위는 m, 가게 안 가운데가 원점. x가 동쪽, z가 남쪽(골목 쪽). 문은 남쪽 벽.
 */
import type { Interaction } from '../interactions'
import type { ShopId, Vec2 } from '../town'

/** 못 지나가는 것: 가운데·반너비·반깊이 */
export interface ShopSolid {
  x: number
  z: number
  hw: number
  hd: number
}

/** 누르면 쓰는 것: 이름(`<가게id>/…`) · 아이템 종류 · 자리 · 보는 쪽 (서서 쓰는 건 미니미가 설 쪽, 앉는 건 앉아서 보는 쪽) */
export interface ShopSpot {
  key: string
  item: string
  x: number
  z: number
  yaw: number
}

/** 가게 사람 (알바생 · 사장님 · 바리스타): 정해진 자리에 서서 손님을 맞는다 */
export interface ShopNpc {
  /** 'npc:<가게id>' */
  id: string
  name: string
  spot: { x: number; z: number; yaw: number }
  /** 손님이 들어오면 */
  hello: string[]
  /** 가끔 혼잣말 */
  idle: string[]
  /** 이 item을 쓰면 대답한다 (계산대 · 주문대) */
  reply?: { item: string; lines: string[] }
}

export interface ShopDef {
  id: ShopId
  /** 간판 이름 */
  name: string
  icon: string
  /** 동네 지도 메뉴 한 줄 설명 */
  desc: string
  /** 안쪽 벽 반너비 · 반깊이 · 벽 높이 */
  hw: number
  hd: number
  wallH: number
  /** 문 x (남쪽 벽) */
  doorX: number
  /** 들어오면 서는 곳 · 나갈 때 걸어가는 곳 */
  entrance: Vec2
  exit: Vec2
  solids: ShopSolid[]
  spots: ShopSpot[]
  npc?: ShopNpc
  /** 안 조명: 하얀 형광등 · 따뜻한 등 · 어두운 데 화면·네온 빛 */
  light: 'white' | 'warm' | 'dark'
  /** 이 가게에서만 쓰는 item 동작 (편의점 c_*는 interactions.ts에 있다) */
  items: Record<string, Interaction>
}
