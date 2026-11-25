/**
 * 골목 3D: 잔디 · 큰길(차도·인도) · 뒷골목 · 샛길 · 친구들 집(마당·울타리·대문·우편함) · 가게 건물 · 빈 집터 · 공원.
 * 집 겉모습은 그 방 테마 색을 따르고, 정면 박공벽에 "OO네 집" 문패가 붙는다.
 */
import * as THREE from 'three'
import { buildToyHouseExterior, TOY_HOUSES, TOY_HOUSE_NAMEPLATE } from './toyHouse'
import type { Room } from '../lib/types'
import {
  ALLEY_W,
  CROSSWALK_HALF,
  emptySlots,
  FENCE_Z,
  GATE_HALF,
  groundY,
  HOUSE_BACK_Z,
  HOUSE_D,
  HOUSE_FRONT_Z,
  HOUSE_W,
  YARD_SIDE,
  colX,
  LOT_W,
  mailboxSpot,
  PARK_S,
  ROAD_N,
  ROWS,
  rowOff,
  SHOP_IDS,
  shopRect,
  STREET_W,
  STREET_X,
  ROAD_S,
  SIDEWALK_N,
  SIDEWALK_S,
  type Prop,
  type TownMap,
  townZones,
} from '../lib/town'
import { bakeStatic, box, canvasTexture, capsule, cone, cyl, fillFit, group, mat, part, roundBox, sphere, tint, torus } from './kit'
import * as P from './places3d'
import { shopExterior } from './shops3d'
import { type BusNow, busAt, busPhase, CAT_SEEDS, catAt, catRoute } from '../lib/townLife'

const HOUSE_STYLE = TOY_HOUSES

export interface Town3D {
  group: THREE.Group
  /** 밤이면 창문·가로등을 켠다 */
  setNight(night: boolean): void
  /** 우편함 깃발 (편지가 있으면 올린다) */
  setMail(roomId: string, count: number): void
  /** 가로등 불빛 자리 (밤에 조명을 단다) */
  lampHeads: THREE.Vector3[]
  /** 새로 생긴 집 (솟아오르는 연출용으로 따로 둔다) */
  risers: Map<string, THREE.Object3D>
  /** 그네 자리 (자리 이름 → 위 가로대에 매달린 의자·줄). 타면 흔든다 */
  swingSeats: Map<string, THREE.Object3D>
  /** 시소 판 (park/seesaw0 → 가운데 축에 걸린 판). 타면 오르내린다 */
  seesawBoards: Map<string, THREE.Object3D>
  /** 바닷가 비치볼 (park/ball0 → 공). 차면 튄다 */
  balls: Map<string, THREE.Object3D>
  /** 누가 아래에 있으면 비쳐 보이게 하는 지붕·파라솔 */
  fades: Map<string, THREE.Object3D>
  /** 바다 물결 · 갈매기 · 배 · 등대 빛줄기 · 버스 · 고양이처럼 늘 움직이는 것 */
  tick(t: number, night: boolean): void
  /** 고양이 지금 자리 (번호 = CAT_SEEDS 순서) */
  catPos(i: number): { x: number; z: number } | null
  /** 지금 버스 (안 다니면 null) */
  bus(): BusNow | null
  dispose(): void
}

function textTexture(text: string, bg: string, fg: string) {
  return canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.roundRect(4, 4, 504, 120, 28)
    ctx.fill()
    ctx.strokeStyle = 'rgba(43,34,51,0.85)'
    ctx.lineWidth = 6
    ctx.stroke()
    ctx.fillStyle = fg
    ctx.font = '700 64px Galmuri11, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fillFit(ctx, text, 256, 68, 470)
  })
}

function tree(scale = 1, hue = 0) {
  const leaf = hue > 0.66 ? '#6cc47a' : hue > 0.33 ? '#59b86b' : '#4fae64'
  const t = group(
    part(cyl(0.12, 0.17, 1.3, 10), mat('#8a5a38', { rough: 1 }), [0, 0.65, 0]),
    part(sphere(0.85, 18, 14), mat(leaf, { rough: 0.95 }), [0, 1.85, 0]),
    part(sphere(0.6, 16, 12), mat(tint(leaf, 0.06), { rough: 0.95 }), [0.45, 2.35, 0.1]),
    part(sphere(0.55, 16, 12), mat(tint(leaf, -0.05), { rough: 0.95 }), [-0.45, 2.2, -0.15]),
  )
  t.scale.setScalar(scale)
  return t
}

function bush() {
  return group(
    part(sphere(0.42, 14, 10), mat('#5fbf73', { rough: 1 }), [0, 0.3, 0], { scale: [1.2, 0.8, 1] }),
    part(sphere(0.3, 12, 10), mat('#6fcf83', { rough: 1 }), [0.3, 0.35, 0.1]),
  )
}

function flowers(seed: number) {
  const colors = ['#ff7fa6', '#ffd94a', '#ffffff', '#9d8cff', '#ff8a3d']
  const g = new THREE.Group()
  for (let i = 0; i < 6; i++) {
    const a = seed * 3 + i * 2.1
    const x = Math.cos(a) * 0.35 * ((i % 3) / 2 + 0.4)
    const z = Math.sin(a) * 0.3 * ((i % 2) + 0.5)
    g.add(part(cyl(0.012, 0.012, 0.22, 5), mat('#3fa65a'), [x, 0.11, z], { shadow: false }))
    g.add(part(sphere(0.06, 8, 6), mat(colors[(i + seed) % colors.length]), [x, 0.24, z], { scale: [1, 0.6, 1] }))
  }
  return g
}

function lamp(heads: THREE.Vector3[], lampMat: THREE.MeshStandardMaterial, x: number, z: number) {
  const g = group(
    part(cyl(0.12, 0.15, 0.2, 10), mat('#3b3646'), [0, 0.1, 0]),
    part(cyl(0.05, 0.05, 3.2, 8), mat('#3b3646'), [0, 1.7, 0]),
    part(cyl(0.02, 0.02, 0.8, 6), mat('#3b3646'), [0, 3.25, -0.35], { rot: [Math.PI / 2, 0, 0] }),
    part(cone(0.28, 0.25, 16), mat('#3b3646'), [0, 3.25, -0.7], { rot: [Math.PI, 0, 0] }),
    part(sphere(0.14, 12, 8), lampMat, [0, 3.12, -0.7]),
  )
  g.position.set(x, 0, z)
  heads.push(new THREE.Vector3(x, 3.0, z - 0.7))
  return g
}

function bench() {
  return group(
    ...[-0.35, -0.12, 0.12].map((z, i) => part(roundBox(1.6, 0.06, 0.2, 0.02), mat('#c98f5a'), i < 2 ? [0, 0.45, z + 0.15] : [0, 0.75, -0.25], { rot: i === 2 ? [-0.25, 0, 0] : [0, 0, 0] })),
    part(box(0.08, 0.45, 0.5), mat('#3b3646'), [-0.7, 0.225, 0]),
    part(box(0.08, 0.45, 0.5), mat('#3b3646'), [0.7, 0.225, 0]),
  )
}

function swing(seats: Map<string, THREE.Object3D>, base: string) {
  // 나무 A자 틀: 양쪽 다리 둘이 위에서 만나 가로대를 받친다 (아래로 벌어져 선다)
  const wood = mat('#b5713f', { rough: 0.85 })
  const dark = mat('#8a5230', { rough: 0.85 })
  const metal = mat('#9aa0ad', { metal: 0.6, rough: 0.35 })
  const H = 2.2
  const SPREAD = 0.75
  const legLen = Math.hypot(H, SPREAD)
  const tilt = Math.atan2(SPREAD, H)
  const g = group(part(cyl(0.075, 0.075, 2.9, 12), wood, [0, H + 0.02, 0], { rot: [0, 0, Math.PI / 2] }))
  for (const x of [-1.3, 1.3]) {
    // 다리: 위 끝이 가로대 바로 밑(z=0)에서 만난다
    for (const s of [1, -1]) g.add(part(cyl(0.06, 0.07, legLen, 10), wood, [x, H / 2, (s * SPREAD) / 2], { rot: [-s * tilt, 0, 0] }))
    // 다리 사이 버팀목 · 꼭대기 쇠 이음쇠 · 땅에 박힌 받침
    g.add(part(cyl(0.035, 0.035, SPREAD * 0.95, 8), dark, [x, 0.75, 0], { rot: [Math.PI / 2, 0, 0] }))
    g.add(part(roundBox(0.2, 0.22, 0.24, 0.04), metal, [x, H, 0]))
    for (const s of [1, -1]) g.add(part(cyl(0.1, 0.12, 0.08, 10), dark, [x, 0.04, s * SPREAD]))
  }
  // 가로대 양끝 마개
  for (const x of [-1.47, 1.47]) g.add(part(sphere(0.085, 10, 8), dark, [x, H + 0.02, 0]))
  // 의자 + 두 줄: 가로대(높이 H)에 매달아 통째로 앞뒤로 흔든다
  ;[-0.6, 0.6].forEach((x, i) => {
    const hang = new THREE.Group()
    hang.name = 'swingSeat'
    hang.position.set(x, H, 0)
    for (const dx of [-0.21, 0.21]) {
      hang.add(part(cyl(0.012, 0.012, 1.5, 5), metal, [dx, 1.38 - H, 0]))
      hang.add(part(cyl(0.035, 0.035, 0.03, 8), metal, [dx, -0.06, 0], { rot: [0, 0, Math.PI / 2] }))
    }
    hang.add(part(roundBox(0.52, 0.06, 0.24, 0.025), mat('#5aa9e6', { rough: 0.5 }), [0, 0.6 - H, 0]))
    hang.traverse((n) => (n.userData.key = `${base}:${i}`))
    seats.set(`${base}:${i}`, hang)
    g.add(hang)
  })
  return g
}

/** 누름 상자 (가로·높이·깊이·앞뒤 위치): 보이지 않지만 눌린다 */
const HIT_BOX: Partial<Record<Prop['kind'], [number, number, number, number]>> = {
  swing: [3.1, 2.4, 1.4, 0],
  slide: [1.3, 1.7, 3.8, 0.1],
  bench: [1.8, 1.0, 0.9, -0.05],
  seesaw: [2.7, 1.0, 0.8, 0],
  sandbox: [2.0, 0.6, 2.0, 0],
  ptable: [2.2, 1.3, 1.2, 0],
  vending: [1.0, 1.95, 0.85, 0],
  lotsign: [1.2, 1.6, 0.8, 0.2],
  bungeo: [1.9, 2.3, 1.3, 0],
  busstop: [3.4, 2.4, 1.3, 0],
  pocha: [3.6, 2.5, 3.6, -0.3],
  pavilion: [3.0, 3.4, 3.2, 0.1],
  scope: [0.8, 1.6, 0.9, 0],
  summit: [0.9, 1.5, 0.8, 0],
  twister: [1.1, 1.3, 1.3, 0.2],
  spring: [1.3, 1.4, 1.0, 0],
  sunbeds: [2.4, 1.1, 2.6, 0],
  ball: [0.9, 0.9, 0.9, 0],
  castle: [1.4, 1.2, 1.4, 0],
  shell: [0.9, 0.4, 0.9, 0],
  wade: [1.6, 0.9, 1.6, 0],
  fwbox: [0.9, 1.0, 0.9, 0],
  tower: [1.8, 2.6, 1.6, 0],
  fishing: [1.1, 1.3, 1.4, 0.3],
}
const HIT_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
/** 누름 상자만 있는 층 (카메라는 안 그리고, 누름 검사만 본다) */
export const HIT_LAYER = 1

/** 시소가 쉴 때 기울기 */
export const SEESAW_REST = 0.16

/** 시소: 가운데 받침 + 기울어진 판 + 양끝 손잡이 (x 방향으로 길다) */
function seesaw(boards: Map<string, THREE.Object3D>, base: string) {
  const tilt = SEESAW_REST
  const board = group(
    part(roundBox(2.4, 0.07, 0.32, 0.03), mat('#ff8fb8', { rough: 0.5 }), [0, 0, 0]),
    ...[-1.0, 1.0].flatMap((x) => [
      part(roundBox(0.28, 0.06, 0.3, 0.025), mat('#5aa9e6', { rough: 0.5 }), [x, 0.05, 0]),
      part(cyl(0.022, 0.022, 0.3, 8), mat('#9aa0ad', { metal: 0.6, rough: 0.35 }), [x * 0.8, 0.18, 0]),
      part(cyl(0.022, 0.022, 0.3, 8), mat('#9aa0ad', { metal: 0.6, rough: 0.35 }), [x * 0.8, 0.33, 0], { rot: [Math.PI / 2, 0, 0] }),
    ]),
  )
  board.position.y = 0.42
  board.rotation.z = tilt
  board.name = 'seesawBoard'
  board.traverse((n) => (n.userData.key = base))
  boards.set(base, board)
  return group(
    part(roundBox(0.3, 0.42, 0.42, 0.05), mat('#ffd94a', { rough: 0.6 }), [0, 0.21, 0]),
    part(cyl(0.05, 0.05, 0.5, 10), mat('#9aa0ad', { metal: 0.6, rough: 0.35 }), [0, 0.42, 0], { rot: [Math.PI / 2, 0, 0] }),
    board,
  )
}

/** 모래놀이터: 나무 테두리 + 모래 + 양동이·삽 */
function sandbox() {
  const wood = mat('#c98f5a', { rough: 0.85 })
  const g = group(part(box(1.8, 0.12, 1.8), mat('#f3dfae', { rough: 1 }), [0, 0.06, 0]))
  for (const [x, z, w, d] of [[0, -0.9, 2.0, 0.2], [0, 0.9, 2.0, 0.2], [-0.9, 0, 0.2, 1.6], [0.9, 0, 0.2, 1.6]] as const)
    g.add(part(roundBox(w, 0.24, d, 0.04), wood, [x, 0.12, z]))
  // 모래 언덕 · 양동이 · 삽
  g.add(part(sphere(0.3, 14, 10), mat('#ecd39b', { rough: 1 }), [-0.3, 0.12, 0.2], { scale: [1, 0.4, 1] }))
  g.add(part(cyl(0.11, 0.08, 0.18, 14), mat('#ff7f2a', { rough: 0.5 }), [0.35, 0.21, -0.25]))
  g.add(part(torus(0.1, 0.01, Math.PI), mat('#2b2233'), [0.35, 0.3, -0.25], { rot: [0, 0, 0] }))
  g.add(part(roundBox(0.06, 0.03, 0.34, 0.01), mat('#59c26b', { rough: 0.5 }), [0.1, 0.14, 0.35], { rot: [0, 0.7, 0] }))
  g.add(part(roundBox(0.14, 0.03, 0.14, 0.02), mat('#59c26b', { rough: 0.5 }), [-0.02, 0.14, 0.48], { rot: [0, 0.7, 0] }))
  return g
}

/** 놀이기구 아래 푹신한 바닥 (밟고 지나갈 수 있다) */
function playMat(size: number, color: string) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(size, 40), mat(color, { rough: 0.95 }))
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.012
  m.receiveShadow = true
  m.userData.ground = true
  const ring = part(torus(size, 0.04, Math.PI * 2), mat(tint(color, -0.12), { rough: 0.9 }), [0, 0.014, 0], { rot: [Math.PI / 2, 0, 0], shadow: false })
  ring.receiveShadow = true
  return group(m, ring)
}

/** 징검다리: 횡단보도에서 공원으로 */
function stones() {
  const g = new THREE.Group()
  ;[[0.1, -0.5], [-0.15, 0.1], [0.12, 0.7]].forEach(([x, z], i) => {
    const s = part(cyl(0.28 - i * 0.02, 0.3 - i * 0.02, 0.05, 14), mat('#d9d3cc', { rough: 0.95 }), [x, 0.02, z], { scale: [1, 1, 0.8] })
    s.userData.ground = true
    g.add(s)
  })
  return g
}

/** 쓰레기통 */
function trash() {
  return group(
    part(cyl(0.2, 0.17, 0.62, 16), mat('#59c26b', { rough: 0.6 }), [0, 0.31, 0]),
    part(cyl(0.22, 0.22, 0.05, 16), mat('#3f9a55', { rough: 0.6 }), [0, 0.64, 0]),
    part(roundBox(0.16, 0.05, 0.04, 0.015), mat('#2b2233'), [0, 0.67, 0]),
  )
}

/** 보행 신호등: 기둥 + 빨간불(켜짐)·초록불 상자. 앞(+z)을 본다 */
function signal() {
  const pole = mat('#3b3646', { rough: 0.6 })
  const g = group(
    part(cyl(0.11, 0.13, 0.12, 10), pole, [0, 0.06, 0]),
    part(cyl(0.05, 0.05, 2.5, 10), pole, [0, 1.25, 0]),
    part(roundBox(0.34, 0.74, 0.22, 0.04), pole, [0, 2.3, 0.1]),
    // 빨간 사람 (서 있다) — 켜짐
    part(roundBox(0.24, 0.26, 0.04, 0.03), mat('#ff5a4f', { emissive: '#ff3b30', glow: 1.3, rough: 0.4 }), [0, 2.48, 0.21]),
    // 초록 사람 — 꺼짐
    part(roundBox(0.24, 0.26, 0.04, 0.03), mat('#2f5c46', { rough: 0.4 }), [0, 2.13, 0.21]),
    // 차양
    part(box(0.34, 0.03, 0.12), pole, [0, 2.63, 0.27]),
    part(box(0.34, 0.03, 0.12), pole, [0, 2.28, 0.27]),
    // 보행 버튼
    part(roundBox(0.12, 0.18, 0.08, 0.02), mat('#ffd94a'), [0, 1.05, 0.07]),
  )
  return g
}

function slide() {
  return group(
    part(roundBox(0.9, 1.4, 0.9, 0.05), mat('#ffd94a'), [0, 0.7, -0.9]),
    part(roundBox(0.8, 0.06, 2.4, 0.03), mat('#59c26b', { rough: 0.4 }), [0, 0.72, 0.5], { rot: [0.55, 0, 0] }),
    ...[0.3, 0.6, 0.9, 1.2].map((y, i) => part(box(0.7, 0.05, 0.15), mat('#ff7f2a'), [0, y, -1.4 - i * 0.02])),
  )
}

function buildProp(
  p: Prop,
  i: number,
  heads: THREE.Vector3[],
  lampMat: THREE.MeshStandardMaterial,
  seats: Map<string, THREE.Object3D>,
  boards: Map<string, THREE.Object3D>,
  base: string,
  zones: ReturnType<typeof townZones>,
  anims: P.PlaceAnims,
) {
  let o: THREE.Object3D
  switch (p.kind) {
    case 'ptable':
      o = P.parasolTable(anims, base)
      break
    case 'vending':
      o = P.vending(anims)
      break
    case 'bins':
      o = P.recycleBins(anims)
      break
    case 'pocha':
      o = P.pocha(anims)
      break
    case 'lotsign':
      o = P.lotSign(anims)
      break
    case 'bungeo':
      o = P.bungeoCart(anims)
      break
    case 'busstop':
      o = P.busStop(anims)
      break
    case 'pavilion':
      o = P.pavilion(anims, base)
      break
    case 'scope':
      o = P.scope()
      break
    case 'summit':
      o = P.summitStone(anims)
      break
    case 'twister':
      o = P.twister()
      break
    case 'spring':
      o = P.spring(anims)
      break
    case 'pine':
      o = P.pine(0.85 + hashScale(i))
      break
    case 'trail':
      // 계단은 산 땅 높이를 따라 제자리에 만든다
      return P.trailSteps(zones)
    case 'trailsign':
      o = P.trailSign(anims)
      break
    case 'sunbeds':
      o = P.sunbeds(anims, base)
      break
    case 'ball':
      o = P.beachBall(anims, base)
      break
    case 'castle':
      o = P.sandCastle()
      break
    case 'shell':
      o = P.shells()
      break
    case 'wade':
      o = P.tube(anims)
      break
    case 'fwbox':
      o = P.fireworkBox(anims)
      break
    case 'tower':
      o = P.lifeguardTower()
      break
    case 'fishing':
      o = P.fishingSpot(anims)
      break
    case 'lighthouse':
      o = P.lighthouse(anims)
      break
    case 'boat':
      o = P.boat(anims)
      break
    case 'buoy':
      o = P.buoy(anims)
      break
    case 'bollard':
      o = P.bollard()
      break
    case 'beachsign':
      o = P.beachSign(anims)
      break
    case 'tree':
      o = tree(0.85 + ((i * 37) % 10) / 30, ((i * 53) % 100) / 100)
      break
    case 'bush':
      o = bush()
      break
    case 'flower':
      o = flowers(i)
      break
    case 'lamp':
      return lamp(heads, lampMat, p.x, p.z)
    case 'bench':
      o = bench()
      break
    case 'swing':
      o = swing(seats, base)
      break
    case 'seesaw':
      o = seesaw(boards, base)
      break
    case 'sandbox':
      o = sandbox()
      break
    case 'mat':
      o = playMat(p.size ?? 2, p.color ?? '#f4a46a')
      break
    case 'stones':
      o = stones()
      break
    case 'trash':
      o = trash()
      break
    case 'slide':
      o = slide()
      break
    case 'signal':
      o = signal()
      break
  }
  // 탈 수 있는 것: 누르면 그 자리로 (그네 의자는 위에서 자리마다 따로 붙였다).
  // 휴대폰에서는 의자·판이 손가락보다 작아서 기구 전체를 감싸는 보이지 않는 누름 상자를 씌운다
  const hit = HIT_BOX[p.kind]
  if (hit) {
    o.traverse((n) => {
      if (n.userData.key === undefined) n.userData.key = base
    })
    const [w, h, d, z] = hit
    const m = new THREE.Mesh(box(w, h, d), HIT_MAT)
    m.name = 'hit'
    // 누르기 전용 층: 화면엔 그리지 않고(그리기 호출 0) 누름 검사에만 걸린다
    m.layers.set(HIT_LAYER)
    m.position.set(0, h / 2, z)
    m.userData.key = base
    o.add(m)
  }
  o.position.set(p.x, P.propY(zones, p), p.z)
  o.rotation.y = p.rot ?? 0
  return o
}

const hashScale = (i: number) => ((i * 37) % 10) / 30

/** rise: 방금 생긴 집들 — 합치지 않고 따로 두어 솟아오르게 한다 */
export function buildTown3D(map: TownMap, rooms: Map<string, Room>, rise: ReadonlySet<string> = new Set()): Town3D {
  const g = new THREE.Group()
  const risers = new Map<string, THREE.Object3D>()
  const owned: { dispose(): void }[] = []
  const b = map.bounds
  const zones = map.zones ?? townZones(map.lots)
  const anims = P.newAnims()
  const groundAt = (x: number, z: number) => groundY(zones, x, z)
  // 잔디·길은 서쪽 끝 너머(안개 속)부터, 잔디는 모래사장까지 · 길은 길 끝까지
  const gx0 = b.minX - 30
  // 잔디는 맨 뒷줄 뒤 숲부터 공원 앞 끝까지
  const GROUND_Z0 = b.minZ - 12
  const GROUND_D = 40 - GROUND_Z0
  const GROUND_Z = (GROUND_Z0 + 40) / 2
  const W = zones.sand - gx0
  const cx = (gx0 + zones.sand) / 2
  const roadW = zones.roadEnd - gx0
  const roadCx = (gx0 + zones.roadEnd) / 2

  // ─── 땅 ───
  const grassTex = canvasTexture(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = '#9fd88a'
      ctx.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 900; i++) {
        const x = (i * 97) % 256
        const y = (i * 61 + ((i * i) % 89)) % 256
        ctx.fillStyle = i % 3 ? 'rgba(80,160,80,0.18)' : 'rgba(255,255,220,0.2)'
        ctx.fillRect(x, y, 3, 6)
      }
    },
    [W / 6, GROUND_D / 6],
  )
  owned.push(grassTex)
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 })
  owned.push(grassMat)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, GROUND_D), grassMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.set(cx, -0.01, GROUND_Z)
  ground.receiveShadow = true
  ground.userData.ground = true
  g.add(ground)

  // 차도 + 가운데 점선 + 횡단보도
  const roadTex = canvasTexture(
    128,
    256,
    (ctx) => {
      ctx.fillStyle = '#6a6f80'
      ctx.fillRect(0, 0, 128, 256)
      for (let i = 0; i < 300; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'
        ctx.fillRect((i * 41) % 128, (i * 73) % 256, 2, 2)
      }
      ctx.fillStyle = '#ffd94a'
      ctx.fillRect(0, 122, 64, 12)
    },
    [roadW / 4, 1],
  )
  owned.push(roadTex)
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9 })
  owned.push(roadMat)
  const road = new THREE.Mesh(new THREE.PlaneGeometry(roadW, ROAD_S - ROAD_N), roadMat)
  road.rotation.x = -Math.PI / 2
  road.position.set(roadCx, 0.005, (ROAD_N + ROAD_S) / 2)
  road.receiveShadow = true
  road.userData.ground = true
  g.add(road)
  // 횡단보도: 흰 줄은 차가 다니는 방향(x)으로 길고, 건너는 방향(z)으로 차례차례 놓인다 (길 끝에서 끝까지)
  const stripes = 7
  const pitch = (ROAD_S - ROAD_N - 0.7) / (stripes - 1)
  for (let k = 0; k < stripes; k++)
    g.add(part(box(CROSSWALK_HALF * 2, 0.012, 0.45), mat('#ffffff', { rough: 0.6 }), [0, 0.01, ROAD_N + 0.35 + k * pitch], { shadow: false }))
  // 정지선: 차는 오른쪽으로 다닌다 → 동쪽으로 가는 차선(남쪽 절반)은 서쪽에, 서쪽으로 가는 차선(북쪽 절반)은 동쪽에
  for (const side of [-1, 1])
    g.add(part(box(0.16, 0.012, ROAD_S - 0.15), mat('#ffffff', { rough: 0.6 }), [side * (CROSSWALK_HALF + 1.1), 0.01, (-side * ROAD_S) / 2], { shadow: false }))

  // 인도 (보도블록) + 연석
  const walkTex = canvasTexture(
    128,
    128,
    (ctx) => {
      ctx.fillStyle = '#efe4d6'
      ctx.fillRect(0, 0, 128, 128)
      ctx.strokeStyle = '#d8c9b6'
      ctx.lineWidth = 4
      for (let i = 0; i <= 128; i += 32) {
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i, 128)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(0, i)
        ctx.lineTo(128, i)
        ctx.stroke()
      }
    },
    [roadW / 1.6, 1],
  )
  owned.push(walkTex)
  const walkMat = new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.95 })
  owned.push(walkMat)
  for (const [z0, z1] of [
    [SIDEWALK_N, ROAD_N],
    [ROAD_S, SIDEWALK_S],
  ]) {
    const s = new THREE.Mesh(box(roadW, 0.12, z1 - z0), [walkMat, walkMat, walkMat, walkMat, mat('#cbbba6'), mat('#cbbba6')])
    s.position.set(roadCx, 0.06, (z0 + z1) / 2)
    s.receiveShadow = true
    s.userData.ground = true
    g.add(s)
  }

  // ─── 뒷골목 · 샛길 (차 없는 보도블록 길) ───
  const alleyTex = canvasTexture(
    128,
    128,
    (ctx) => {
      ctx.fillStyle = '#e6dccb'
      ctx.fillRect(0, 0, 128, 128)
      ctx.strokeStyle = '#d2c4ae'
      ctx.lineWidth = 3
      for (let i = 0; i <= 128; i += 32) {
        ctx.beginPath()
        ctx.moveTo(0, i)
        ctx.lineTo(128, i)
        ctx.stroke()
        for (let k = 0; k < 128; k += 64) {
          const x = k + ((i / 32) % 2 ? 32 : 0)
          ctx.beginPath()
          ctx.moveTo(x, i)
          ctx.lineTo(x, i + 32)
          ctx.stroke()
        }
      }
    },
    [1, 1],
  )
  owned.push(alleyTex)
  const paths: [number, number, number, number][] = []
  for (let r = 1; r < ROWS; r++) {
    const z0 = FENCE_Z + rowOff(r)
    paths.push([zones.hw, z0, zones.he, z0 + ALLEY_W])
  }
  // 이웃집 사이 샛길: 앞 인도(또는 골목)에서 집 옆을 지나 뒷골목까지 (맨 뒷줄은 뒤가 숲이라 없다)
  for (let r = 0; r < ROWS - 1; r++)
    for (let c = -4; c <= 3; c++) {
      // 칸 -2|-1 · 1|2 사이는 큰 샛길이 이미 있다
      if (c === -2 || c === 1) continue
      const x = colX(c) + LOT_W / 2
      paths.push([x - 0.9, FENCE_Z + rowOff(r + 1) + ALLEY_W, x + 0.9, FENCE_Z + rowOff(r)])
    }
  const streetZ0 = FENCE_Z + rowOff(ROWS - 1)
  for (const x of [zones.hw + STREET_W / 2, ...STREET_X, zones.he - STREET_W / 2]) paths.push([x - STREET_W / 2, streetZ0, x + STREET_W / 2, SIDEWALK_N])
  for (const [x0, z0, x1, z1] of paths) {
    const t = alleyTex.clone()
    t.needsUpdate = true
    t.repeat.set((x1 - x0) / 2, (z1 - z0) / 2)
    owned.push(t)
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 })
    owned.push(m)
    const path = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m)
    path.rotation.x = -Math.PI / 2
    path.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2)
    path.receiveShadow = true
    path.userData.ground = true
    g.add(path)
  }

  // ─── 집들 ───
  const windowMat = new THREE.MeshStandardMaterial({ color: '#f4dfb8', roughness: 0.35, metalness: 0, emissive: '#ffcf7a', emissiveIntensity: 0 })
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3c4', roughness: 0.4, emissive: '#ffd27a', emissiveIntensity: 0.2 })
  owned.push(windowMat, lampMat)
  const flags = new Map<string, THREE.Object3D>()
  const heads: THREE.Vector3[] = []

  for (const lot of map.lots) {
    const room = rooms.get(lot.roomId)
    const style = HOUSE_STYLE[room?.theme ?? 'studio'] ?? HOUSE_STYLE.studio
    const hx = lot.x
    // 줄마다 z가 밀린다 (줄0 = 큰길 앞)
    const FRONT = HOUSE_FRONT_Z + lot.zOff
    const FENCE = FENCE_Z + lot.zOff
    const hz = (HOUSE_FRONT_Z + HOUSE_BACK_Z) / 2 + lot.zOff
    const house = buildToyHouseExterior(style, windowMat, lot.roomId)
    house.position.set(hx, 0, hz)
    house.traverse((n) => {
      if (!n.userData.door) n.userData.house = lot.roomId
    })
    if (rise.has(lot.roomId)) {
      house.userData.keep = true
      risers.set(lot.roomId, house)
    }
    g.add(house)

    // 박공벽 문패: 현관 지붕 위로 올리고, 박공의 앞면 밖으로 꺼내 가려지지 않게 한다.
    if (room) {
      const label = textTexture(`${room.owner.nickname}네 집`, style.trim, '#2b2233')
      owned.push(label)
      const signMat = new THREE.MeshBasicMaterial({ map: label, transparent: true })
      owned.push(signMat)
      const plate = TOY_HOUSE_NAMEPLATE
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(plate.width, plate.height), signMat)
      sign.name = 'houseNameplate'
      sign.position.set(hx, plate.y, FRONT + plate.frontOffset)
      sign.userData.door = lot.roomId
      g.add(sign)
    }

    // 마당: 잔디 조금 밝게 + 디딤돌 길
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(YARD_SIDE * 2, FENCE - FRONT), mat('#b3e39c', { rough: 1 }))
    yard.rotation.x = -Math.PI / 2
    yard.position.set(hx, 0.003, (FRONT + FENCE) / 2)
    yard.receiveShadow = true
    yard.userData.ground = true
    yard.userData.yard = lot.roomId
    g.add(yard)
    for (let k = 0; k < 4; k++) {
      const z = FRONT + 1.1 + k * 1.05
      g.add(part(cyl(0.38, 0.4, 0.06, 12), mat('#ddd3c4', { rough: 1 }), [hx + (k % 2 ? 0.12 : -0.12), 0.03, z], { scale: [1, 1, 0.8], shadow: false }))
    }

    // 울타리 (대문 자리는 비운다)
    const pickets = mat('#ffffff', { rough: 0.7 })
    const rails = mat('#f1ece4', { rough: 0.7 })
    const l = hx - YARD_SIDE
    const r = hx + YARD_SIDE
    const fenceRun = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0)
      const n = Math.max(2, Math.round(len / 0.32))
      const fg = new THREE.Group()
      for (let i = 0; i <= n; i++) {
        const t = i / n
        fg.add(part(roundBox(0.13, 0.78, 0.09, 0.043), pickets, [x0 + (x1 - x0) * t, 0.375, z0 + (z1 - z0) * t]))
      }
      const rail = part(roundBox(len, 0.075, 0.065, 0.03), rails, [(x0 + x1) / 2, 0.5, (z0 + z1) / 2])
      rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0)
      const rail2 = rail.clone()
      rail2.position.y = 0.25
      fg.add(rail, rail2)
      g.add(fg)
    }
    fenceRun(l, FENCE, hx - GATE_HALF, FENCE)
    fenceRun(hx + GATE_HALF, FENCE, r, FENCE)
    fenceRun(l, FENCE, l, FRONT)
    fenceRun(r, FENCE, r, FRONT)
    fenceRun(l, FRONT, hx - HOUSE_W / 2 - 0.05, FRONT)
    fenceRun(hx + HOUSE_W / 2 + 0.05, FRONT, r, FRONT)
    // 대문 기둥
    for (const x of [hx - GATE_HALF, hx + GATE_HALF]) {
      g.add(part(roundBox(0.24, 1.0, 0.24, 0.05), mat(style.wall), [x, 0.5, FENCE]))
      g.add(part(sphere(0.13, 12, 8), mat(style.roof), [x, 1.08, FENCE]))
    }

    // 우편함 (깃발이 서 있으면 편지가 있다)
    const m = mailboxSpot(lot)
    const flag = part(box(0.04, 0.22, 0.14), mat('#ff3b5c'), [0.2, 1.2, 0.05], { name: 'mailflag' })
    flag.visible = false
    const mailbox = group(
      part(cyl(0.05, 0.05, 1.0, 8), mat('#8a5a38'), [0, 0.5, 0]),
      part(capsule(0.17, 0.3), mat(style.roof, { rough: 0.5 }), [0, 1.13, 0], { rot: [Math.PI / 2, 0, 0] }),
      part(cyl(0.14, 0.14, 0.02, 16), mat(tint(style.roof, -0.2)), [0, 1.13, 0.31], { rot: [Math.PI / 2, 0, 0] }),
      flag,
    )
    mailbox.position.set(m.x, 0, m.z)
    mailbox.traverse((n) => (n.userData.mail = lot.roomId))
    flags.set(lot.roomId, flag)
    g.add(mailbox)
  }

  // ─── 빈 집터 (입주 대기): 밝은 잔디 + 낮은 돌 테두리 ───
  for (const s of emptySlots(map.lots)) {
    const f = FENCE_Z + s.zOff
    const front = HOUSE_FRONT_Z + s.zOff
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(YARD_SIDE * 2 - 0.4, f - front + HOUSE_D - 0.6), mat('#c4eaa8', { rough: 1 }))
    lawn.rotation.x = -Math.PI / 2
    lawn.position.set(s.x, 0.003, (f + front - HOUSE_D + 0.6) / 2)
    lawn.receiveShadow = true
    lawn.userData.ground = true
    g.add(lawn)
    for (const sx of [-1, 1]) g.add(part(box(0.18, 0.16, f - front + HOUSE_D - 0.6), mat('#d8d2c4'), [s.x + sx * (YARD_SIDE - 0.2), 0.08, (f + front - HOUSE_D + 0.6) / 2]))
  }

  // ─── 가게 건물 (문을 누르면 들어간다) ───
  for (const id of SHOP_IDS) {
    const r = shopRect(id)
    const shop = shopExterior(id, anims)
    shop.position.set(r.x, 0, r.zOff)
    // 이름을 붙이면 합치기(bakeStatic)에서 빠진다 → 이름 없이 둔다 (문 누르기는 userData.shop으로 그대로 된다)
    g.add(shop)
  }

  // ─── 공원 ───
  const parkW = zones.sand - b.minX
  const park = new THREE.Mesh(new THREE.PlaneGeometry(parkW, PARK_S - SIDEWALK_S - 0.6), mat('#a8de8f', { rough: 1 }))
  park.rotation.x = -Math.PI / 2
  park.position.set((b.minX + zones.sand) / 2, 0.002, (SIDEWALK_S + PARK_S) / 2 + 0.3)
  park.receiveShadow = true
  park.userData.ground = true
  g.add(park)
  // 놀이터 모래
  const sand = new THREE.Mesh(new THREE.CircleGeometry(4.6, 40), mat('#f3dfae', { rough: 1 }))
  sand.rotation.x = -Math.PI / 2
  sand.position.set(0, 0.006, 10.6)
  sand.scale.set(1.5, 0.75, 1)
  sand.receiveShadow = true
  sand.userData.ground = true
  g.add(sand)
  // 놀이기구 이름은 lib/town.ts parkSeats와 같게: park/<종류><몇 번째>
  const swingSeats = new Map<string, THREE.Object3D>()
  const seesawBoards = new Map<string, THREE.Object3D>()
  const nth = new Map<string, number>()
  // 골목 양 끝 장소는 따로 묶어 합친다: 화면 밖이면 통째로 안 그린다
  const west = new THREE.Group()
  const east = new THREE.Group()
  const zoneOf = (x: number) => (x < zones.hw - 1.5 ? west : x > zones.he + 1.5 ? east : g)
  map.props.forEach((p, i) => {
    const k = nth.get(p.kind) ?? 0
    nth.set(p.kind, k + 1)
    zoneOf(p.x).add(buildProp(p, i, heads, lampMat, swingSeats, seesawBoards, `park/${p.kind}${k}`, zones, anims))
  })
  // 맨 뒷줄 뒤 먼 산
  for (let x = zones.hw - 8; x <= zones.he + 4; x += 14) {
    const k = Math.round(x / 14)
    const hill = part(sphere(9, 24, 12), mat(k % 2 ? '#8fcf7e' : '#7fc271', { rough: 1 }), [x, -4, HOUSE_BACK_Z + rowOff(ROWS - 1) - 12], { shadow: false })
    hill.scale.set(1, 0.7, 0.6)
    g.add(hill)
  }

  // ─── 동네 장소 ───
  // 뒷산: 땅 + 뒤로 이어지는 먼 능선
  west.add(P.hillTerrain(zones, grassTex))
  for (const [dx, h, sc] of [[-6, 7, 1.15], [5, 6, 1], [-16, 5, 0.9]] as const) {
    const ridge = part(sphere(10, 28, 14), mat(dx < -10 ? '#7fc271' : '#74b866', { rough: 1 }), [zones.hill.x + dx, -2, zones.hill.z - 15], { shadow: false })
    ridge.scale.set(sc, h / 10, 0.6)
    west.add(ridge)
  }
  // 바닷가: 모래 · 바다 · 방파제 · 갈매기
  east.add(P.sandBeach(zones))
  east.add(P.sea(zones, anims))
  east.add(P.pier(zones, anims))
  east.add(P.gulls(zones, anims))
  for (const [z, name] of [[west, 'zone-west'], [east, 'zone-east']] as const) {
    bakeStatic(z)
    z.name = name
    g.add(z)
  }
  // 길 끝 연석 (차도가 모래사장 앞에서 끝난다)
  g.add(part(box(0.3, 0.16, ROAD_S - ROAD_N + 3.2), mat('#cbbba6'), [zones.roadEnd + 0.15, 0.08, 0]))
  owned.push(...anims.owned)

  // 움직이지 않는 것들은 재질별로 합친다 (휴대폰에서 부드럽게)
  bakeStatic(g)

  // ─── 저절로 움직이는 것 (합치지 않는다): 버스 · 고양이. 시각으로 자리를 정해 모든 화면에서 같다 ───
  const bus = P.townBus()
  bus.userData.keep = true
  bus.visible = false
  g.add(bus)
  const busRoute = { x0: b.minX - 6, x1: zones.roadEnd - 3.5 }
  let busNow: BusNow | null = null
  // 고양이 길은 계산이 무거워서(골목 전체 길찾기 지도) 동네를 다 그린 뒤 한가할 때 만든다. 그 전엔 고양이를 숨긴다
  let route: ReturnType<typeof catRoute> | null = null
  let disposed = false
  const later = (f: () => void) => (typeof window !== 'undefined' && window.requestIdleCallback ? window.requestIdleCallback(f, { timeout: 2000 }) : setTimeout(f, 800))
  later(() => {
    if (!disposed) route = catRoute(map)
  })
  const cats = CAT_SEEDS.map((seed, i) => {
    const c = i === 0 ? P.cat('#f2a65a', '#fff3e0') : P.cat('#5c5a66', '#e8e6ee')
    c.userData.keep = true
    c.visible = false
    c.traverse((n) => (n.userData.cat = i))
    // 손가락보다 작아서 보이지 않는 누름 상자를 씌운다
    const hit = new THREE.Mesh(box(0.9, 0.8, 0.9), HIT_MAT)
    hit.layers.set(HIT_LAYER)
    hit.name = 'hit'
    hit.position.y = 0.4
    hit.userData.cat = i
    c.add(hit)
    g.add(c)
    return { seed, obj: c, body: c.getObjectByName('catbody')!, tail: c.getObjectByName('cattail')! }
  })
  anims.tick.push((t) => {
    const now = Date.now()
    const p = busPhase(now)
    busNow = busAt(now, busRoute)
    bus.visible = busNow !== null
    if (busNow && p !== null) {
      bus.position.set(busNow.x, 0, busNow.z)
      // 끝에서는 작아지며 사라진다
      bus.scale.setScalar(p > 0.94 ? Math.max(0.01, (1 - p) / 0.06) : 1)
    }
    if (!route) return
    for (const c of cats) {
      c.obj.visible = true
      const at = catAt(route, now, c.seed)
      c.obj.position.set(at.pos.x, groundAt(at.pos.x, at.pos.z), at.pos.z)
      c.obj.rotation.y = at.yaw
      // 쉴 때는 납작 엎드려 꼬리만 살랑, 걸을 때는 통통
      c.body.scale.y = at.nap ? 0.62 : 1
      c.body.position.y = at.nap ? -0.02 : Math.abs(Math.sin(t * 9)) * 0.03
      c.tail.rotation.z = Math.sin(t * (at.nap ? 1.5 : 4)) * 0.5
    }
  })

  return {
    group: g,
    lampHeads: heads,
    risers,
    swingSeats,
    seesawBoards,
    balls: anims.balls,
    fades: anims.fades,
    tick(t, night) {
      for (const f of anims.tick) f(t, night)
    },
    bus: () => busNow,
    catPos(i) {
      const c = cats[i]
      return c && route ? { x: c.obj.position.x, z: c.obj.position.z } : null
    },
    setNight(night) {
      windowMat.emissiveIntensity = night ? 0.9 : 0
      lampMat.emissiveIntensity = night ? 2.2 : 0.15
      for (const gl of anims.glows) gl.mat.emissiveIntensity = night ? gl.night : gl.day
    },
    setMail(roomId, count) {
      const f = flags.get(roomId)
      if (f) f.visible = count > 0
    },
    dispose() {
      disposed = true
      for (const o of owned) o.dispose()
      g.traverse((n) => {
        const m = n as THREE.Mesh
        if (m.isMesh && (m.geometry.type === 'ExtrudeGeometry' || m.geometry.type === 'PlaneGeometry' || m.geometry.type === 'CircleGeometry')) m.geometry.dispose()
      })
    },
  }
}
