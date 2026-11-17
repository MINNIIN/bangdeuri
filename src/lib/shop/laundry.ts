/**
 * 골목 코인빨래방 안 (방들이코인빨래방). 가게 목록(lib/shops.ts)에 등록된다. 무인 가게라 가게 사람은 없다.
 *
 *   (북)  [세탁기][세탁기][세탁기][세탁기] [세제] [바구니 선반]
 *   건조기                                         벤치
 *   (2단)        [빨래 개는 탁자]                   (3자리)
 *   건조기
 *   (남)  화분                              [문]
 *
 * 단위는 m, 가운데가 원점. x가 동쪽, z가 남쪽(골목 쪽). 문은 남쪽 벽 x=2.
 */
import type { ShopDef, ShopSolid, ShopSpot } from './types'

const HW = 5
const HD = 3.5
const DOOR_X = 2

/** 세탁기 4대 가운데 x (북쪽 벽) */
export const LD_WASHER_X = [-2.85, -1.75, -0.65, 0.45]
/** 건조기 2대 가운데 z (서쪽 벽) */
export const LD_DRYER_Z = [-1.35, 0.2]
/** 벤치 자리 z (동쪽 벽, 서쪽을 보고 앉는다) */
export const LD_BENCH_Z = [-1.0, 0.0, 1.0]

export const LD_SOLIDS: ShopSolid[] = [
  // 북쪽 벽: 세탁기 4대 · 세제 자판기 · 바구니 선반
  { x: -1.2, z: -3.12, hw: 2.2, hd: 0.38 },
  { x: 2.25, z: -3.15, hw: 0.45, hd: 0.35 },
  { x: 4.15, z: -3.2, hw: 0.75, hd: 0.3 },
  // 서쪽 벽: 건조기 2대 (2단)
  { x: -4.6, z: -0.575, hw: 0.4, hd: 1.4 },
  // 가운데 빨래 개는 탁자
  { x: -0.9, z: 0.35, hw: 0.85, hd: 0.45 },
  // 동쪽 벽 벤치
  { x: 4.6, z: 0.0, hw: 0.25, hd: 1.55 },
  // 남서쪽 화분
  { x: -4.5, z: 3.0, hw: 0.3, hd: 0.3 },
]

export const LD_SPOTS: ShopSpot[] = [
  ...LD_WASHER_X.map((x, i) => ({ key: `laundry/washer:${i}`, item: 'ld_washer', x, z: -2.74, yaw: 0 })),
  ...LD_DRYER_Z.map((z, i) => ({ key: `laundry/dryer:${i}`, item: 'ld_dryer', x: -4.2, z, yaw: Math.PI / 2 })),
  ...LD_BENCH_Z.map((z, i) => ({ key: `laundry/bench:${i}`, item: 'ld_bench', x: 4.6, z, yaw: -Math.PI / 2 })),
  { key: 'laundry/soap', item: 'ld_soap', x: 2.25, z: -2.8, yaw: 0 },
]

export const LAUNDRY_SHOP: ShopDef = {
  id: 'laundry',
  name: '방들이코인빨래방',
  icon: '🧺',
  desc: '빨래 돌리기',
  hw: HW,
  hd: HD,
  wallH: 3,
  doorX: DOOR_X,
  entrance: { x: DOOR_X, z: HD - 1.15 },
  exit: { x: DOOR_X, z: HD - 0.45 },
  solids: LD_SOLIDS,
  spots: LD_SPOTS,
  light: 'white',
  items: {
    ld_washer: {
      verb: '빨래 돌리기',
      pose: 'back',
      fx: ['bubbles'],
      motion: 'spin',
      lines: ['빨래 시작!', '양말 한 짝 어디 갔지', '동전 넣고… 삑!', '빙글빙글 돌아간다~', '섬유유연제 듬뿍'],
      ms: 3200,
    },
    ld_dryer: {
      verb: '건조기 돌리기',
      pose: 'back',
      fx: ['wind'],
      motion: 'spin',
      lines: ['뽀송뽀송해져라', '따끈따끈 갓 나온 수건', '니트는 넣으면 안 돼!', '40분 남았다…'],
      ms: 3000,
    },
    ld_bench: {
      verb: '기다리기',
      pose: 'sit',
      seat: 5,
      fx: [],
      lines: ['빨래 다 될 때까지 멍~', '세탁기 돌아가는 거 보는 중', '빙글빙글… 졸리다', '빨래방 냄새 좋아'],
    },
    ld_soap: {
      verb: '세제 사기',
      pose: 'back',
      fx: ['ring'],
      lines: ['세제 하나 주세요~', '띵! 섬유유연제 나왔다', '라벤더 향으로!', '동전이 모자라…'],
      ms: 2600,
    },
  },
}
