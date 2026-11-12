/**
 * 골목 3D: 잔디 · 차도 · 인도 · 친구들 집(마당·울타리·대문·우편함) · 공원.
 * 집 겉모습은 그 방 테마 색을 따르고, 대문 위에 "OO네" 문패가 붙는다.
 */
import * as THREE from 'three'
import type { Room } from '../lib/types'
import {
  CROSSWALK_HALF,
  FENCE_Z,
  GATE_HALF,
  HOUSE_BACK_Z,
  HOUSE_D,
  HOUSE_FRONT_Z,
  HOUSE_W,
  LOT_W,
  mailboxSpot,
  PARK_S,
  ROAD_N,
  ROAD_S,
  SIDEWALK_N,
  SIDEWALK_S,
  type Prop,
  type TownMap,
} from '../lib/town'
import { bakeStatic, box, canvasTexture, capsule, cone, cyl, group, mat, part, roundBox, sphere, tint, torus } from './kit'

const HOUSE_STYLE: Record<string, { wall: string; roof: string; trim: string; door: string }> = {
  pink: { wall: '#ffe1ec', roof: '#ff7fa6', trim: '#ffffff', door: '#c9577d' },
  studio: { wall: '#f6ead6', roof: '#c9784a', trim: '#ffffff', door: '#8a5a38' },
  night: { wall: '#d6dcff', roof: '#5a5fb0', trim: '#f4f4ff', door: '#3a4178' },
}

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
    ctx.fillText(text, 256, 68, 470)
  })
}

function gableRoof(w: number, d: number, h: number, color: string) {
  const shape = new THREE.Shape()
  shape.moveTo(-d / 2, 0)
  shape.lineTo(d / 2, 0)
  shape.lineTo(0, h)
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 })
  g.translate(0, 0, -w / 2)
  g.rotateY(Math.PI / 2)
  const m = new THREE.Mesh(g, mat(color, { rough: 0.7 }))
  m.castShadow = true
  m.receiveShadow = true
  return m
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
}
const HIT_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })

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
) {
  let o: THREE.Object3D
  switch (p.kind) {
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
    m.position.set(0, h / 2, z)
    m.userData.key = base
    o.add(m)
  }
  o.position.set(p.x, 0, p.z)
  o.rotation.y = p.rot ?? 0
  return o
}

/** rise: 방금 생긴 집들 — 합치지 않고 따로 두어 솟아오르게 한다 */
export function buildTown3D(map: TownMap, rooms: Map<string, Room>, rise: ReadonlySet<string> = new Set()): Town3D {
  const g = new THREE.Group()
  const risers = new Map<string, THREE.Object3D>()
  const owned: { dispose(): void }[] = []
  const b = map.bounds
  const W = b.maxX - b.minX
  const cx = (b.minX + b.maxX) / 2

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
    [W / 6, 40 / 6],
  )
  owned.push(grassTex)
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 })
  owned.push(grassMat)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 60, 80), grassMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.set(cx, -0.01, 0)
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
    [(W + 60) / 4, 1],
  )
  owned.push(roadTex)
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9 })
  owned.push(roadMat)
  const road = new THREE.Mesh(new THREE.PlaneGeometry(W + 60, ROAD_S - ROAD_N), roadMat)
  road.rotation.x = -Math.PI / 2
  road.position.set(cx, 0.005, (ROAD_N + ROAD_S) / 2)
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
    [(W + 60) / 1.6, 1],
  )
  owned.push(walkTex)
  const walkMat = new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.95 })
  owned.push(walkMat)
  for (const [z0, z1] of [
    [SIDEWALK_N, ROAD_N],
    [ROAD_S, SIDEWALK_S],
  ]) {
    const s = new THREE.Mesh(box(W + 60, 0.12, z1 - z0), [walkMat, walkMat, walkMat, walkMat, mat('#cbbba6'), mat('#cbbba6')])
    s.position.set(cx, 0.06, (z0 + z1) / 2)
    s.receiveShadow = true
    s.userData.ground = true
    g.add(s)
  }

  // ─── 집들 ───
  const windowMat = new THREE.MeshStandardMaterial({ color: '#cfe9ff', roughness: 0.15, metalness: 0.1, emissive: '#ffcf7a', emissiveIntensity: 0 })
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3c4', roughness: 0.4, emissive: '#ffd27a', emissiveIntensity: 0.2 })
  owned.push(windowMat, lampMat)
  const flags = new Map<string, THREE.Object3D>()
  const heads: THREE.Vector3[] = []

  for (const lot of map.lots) {
    const room = rooms.get(lot.roomId)
    const style = HOUSE_STYLE[room?.theme ?? 'studio'] ?? HOUSE_STYLE.studio
    const hx = lot.x
    const hz = (HOUSE_FRONT_Z + HOUSE_BACK_Z) / 2
    const house = new THREE.Group()
    house.userData.house = lot.roomId
    const wallH = 2.9
    house.add(part(roundBox(HOUSE_W, wallH, HOUSE_D, 0.08), mat(style.wall, { rough: 0.9 }), [0, wallH / 2, 0]))
    house.add(part(box(HOUSE_W + 0.1, 0.3, HOUSE_D + 0.1), mat(tint(style.wall, -0.2)), [0, 0.15, 0]))
    const roof = gableRoof(HOUSE_W + 0.7, HOUSE_D + 0.9, 2.1, style.roof)
    roof.position.y = wallH
    house.add(roof)
    house.add(part(roundBox(0.6, 1.3, 0.6, 0.05), mat(tint(style.roof, -0.15)), [HOUSE_W / 2 - 1.3, wallH + 1.3, -0.8]))
    // 문 (누르면 들어간다)
    const front = HOUSE_D / 2
    const door = group(
      part(roundBox(1.3, 2.15, 0.14, 0.05), mat(style.trim), [0, 1.1, 0]),
      part(roundBox(1.05, 1.95, 0.1, 0.06), mat(style.door, { rough: 0.6 }), [0, 1.03, 0.05]),
      part(sphere(0.06, 10, 8), mat('#ffd94a', { metal: 0.6, rough: 0.3 }), [0.35, 1.0, 0.13]),
      part(box(1.6, 0.12, 0.7), mat(tint(style.wall, -0.25)), [0, 0.06, 0.4]),
      part(roundBox(1.8, 0.08, 0.9, 0.03), mat(style.roof), [0, 2.4, 0.35], { rot: [0.18, 0, 0] }),
    )
    door.position.set(0, 0, front)
    door.traverse((n) => (n.userData.door = lot.roomId))
    house.add(door)
    // 창문
    for (const x of [-2.3, 2.3]) {
      house.add(part(roundBox(1.25, 1.05, 0.12, 0.04), mat(style.trim), [x, 1.6, front + 0.01]))
      house.add(part(roundBox(1.05, 0.85, 0.12, 0.03), windowMat, [x, 1.6, front + 0.03]))
      house.add(part(box(0.05, 0.85, 0.13), mat(style.trim), [x, 1.6, front + 0.04]))
      house.add(part(roundBox(1.3, 0.12, 0.3, 0.03), mat(style.trim), [x, 1.05, front + 0.12]))
      const box_ = flowers(Math.round(x * 3) + 7)
      box_.scale.setScalar(0.6)
      box_.position.set(x, 1.1, front + 0.15)
      house.add(box_)
    }
    // 지붕: 용마루 + 기와 줄 (앞뒤 경사면에)
    const roofW = HOUSE_W + 0.7
    const roofD = HOUSE_D + 0.9
    const slope = Math.atan2(2.1, roofD / 2)
    const ridge = mat(tint(style.roof, -0.18), { rough: 0.6 })
    house.add(part(cyl(0.12, 0.12, roofW + 0.15, 12), ridge, [0, wallH + 2.12, 0], { rot: [0, 0, Math.PI / 2] }))
    for (const side of [1, -1])
      for (let k = 1; k <= 4; k++) {
        const t = k / 5
        const z = side * (roofD / 2) * (1 - t)
        const y = wallH + 2.1 * t + 0.05
        house.add(part(box(roofW, 0.06, 0.1), ridge, [0, y, z], { rot: [side * slope, 0, 0] }))
      }
    // 박공 창 (옆면)
    for (const sx of [-1, 1]) {
      house.add(part(roundBox(0.12, 0.8, 0.8, 0.05), mat(style.trim), [sx * (HOUSE_W / 2 + 0.02), wallH + 0.7, 0]))
      house.add(part(roundBox(0.12, 0.62, 0.62, 0.04), windowMat, [sx * (HOUSE_W / 2 + 0.05), wallH + 0.7, 0]))
    }
    house.position.set(hx, 0, hz)
    house.traverse((n) => {
      if (!n.userData.door) n.userData.house = lot.roomId
    })
    if (rise.has(lot.roomId)) {
      house.userData.keep = true
      risers.set(lot.roomId, house)
    }
    g.add(house)

    // 문패
    if (room) {
      const label = textTexture(`${room.owner.nickname}네`, '#ffffff', '#2b2233')
      owned.push(label)
      const signMat = new THREE.MeshStandardMaterial({ map: label, roughness: 0.6 })
      owned.push(signMat)
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), signMat)
      sign.position.set(hx, 2.75, HOUSE_FRONT_Z + 0.06)
      sign.userData.door = lot.roomId
      g.add(sign)
    }

    // 마당: 잔디 조금 밝게 + 디딤돌 길
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(LOT_W - 1, FENCE_Z - HOUSE_FRONT_Z), mat('#b3e39c', { rough: 1 }))
    yard.rotation.x = -Math.PI / 2
    yard.position.set(hx, 0.003, (HOUSE_FRONT_Z + FENCE_Z) / 2)
    yard.receiveShadow = true
    yard.userData.ground = true
    yard.userData.yard = lot.roomId
    g.add(yard)
    for (let k = 0; k < 4; k++) {
      const z = HOUSE_FRONT_Z + 1.1 + k * 1.05
      g.add(part(cyl(0.38, 0.4, 0.06, 12), mat('#ddd3c4', { rough: 1 }), [hx + (k % 2 ? 0.12 : -0.12), 0.03, z], { scale: [1, 1, 0.8], shadow: false }))
    }

    // 울타리 (대문 자리는 비운다)
    const pickets = mat('#ffffff', { rough: 0.7 })
    const rails = mat('#f1ece4', { rough: 0.7 })
    const l = hx - LOT_W / 2 + 0.3
    const r = hx + LOT_W / 2 - 0.3
    const fenceRun = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0)
      const n = Math.max(2, Math.round(len / 0.32))
      const fg = new THREE.Group()
      for (let i = 0; i <= n; i++) {
        const t = i / n
        fg.add(part(box(0.1, 0.75, 0.06), pickets, [x0 + (x1 - x0) * t, 0.375, z0 + (z1 - z0) * t]))
      }
      const rail = part(box(len, 0.06, 0.04), rails, [(x0 + x1) / 2, 0.5, (z0 + z1) / 2])
      rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0)
      const rail2 = rail.clone()
      rail2.position.y = 0.25
      fg.add(rail, rail2)
      g.add(fg)
    }
    fenceRun(l, FENCE_Z, hx - GATE_HALF, FENCE_Z)
    fenceRun(hx + GATE_HALF, FENCE_Z, r, FENCE_Z)
    fenceRun(l, FENCE_Z, l, HOUSE_FRONT_Z)
    fenceRun(r, FENCE_Z, r, HOUSE_FRONT_Z)
    // 대문 기둥
    for (const x of [hx - GATE_HALF, hx + GATE_HALF]) {
      g.add(part(roundBox(0.24, 1.0, 0.24, 0.05), mat(style.wall), [x, 0.5, FENCE_Z]))
      g.add(part(sphere(0.13, 12, 8), mat(style.roof), [x, 1.08, FENCE_Z]))
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

  // ─── 공원 ───
  const park = new THREE.Mesh(new THREE.PlaneGeometry(W, PARK_S - SIDEWALK_S - 0.6), mat('#a8de8f', { rough: 1 }))
  park.rotation.x = -Math.PI / 2
  park.position.set(cx, 0.002, (SIDEWALK_S + PARK_S) / 2 + 0.3)
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
  map.props.forEach((p, i) => {
    const k = nth.get(p.kind) ?? 0
    nth.set(p.kind, k + 1)
    g.add(buildProp(p, i, heads, lampMat, swingSeats, seesawBoards, `park/${p.kind}${k}`))
  })
  // 골목 뒤 먼 산
  for (let k = -3; k <= 3; k++) {
    const hill = part(sphere(9, 24, 12), mat(k % 2 ? '#8fcf7e' : '#7fc271', { rough: 1 }), [cx + k * 14, -4, HOUSE_BACK_Z - 12], { shadow: false })
    hill.scale.set(1, 0.7, 0.6)
    g.add(hill)
  }

  // 움직이지 않는 것들은 재질별로 합친다 (휴대폰에서 부드럽게)
  bakeStatic(g)

  return {
    group: g,
    lampHeads: heads,
    risers,
    swingSeats,
    seesawBoards,
    setNight(night) {
      windowMat.emissiveIntensity = night ? 0.9 : 0
      lampMat.emissiveIntensity = night ? 2.2 : 0.15
    },
    setMail(roomId, count) {
      const f = flags.get(roomId)
      if (f) f.visible = count > 0
    },
    dispose() {
      for (const o of owned) o.dispose()
      g.traverse((n) => {
        const m = n as THREE.Mesh
        if (m.isMesh && (m.geometry.type === 'ExtrudeGeometry' || m.geometry.type === 'PlaneGeometry' || m.geometry.type === 'CircleGeometry')) m.geometry.dispose()
      })
    },
  }
}
