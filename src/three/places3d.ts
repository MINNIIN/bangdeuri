/**
 * 골목 양 끝 동네 장소 3D: 편의점 건물 · 파라솔 테이블 · 자판기 · 포장마차 · 뒷산(땅·소나무·정자·망원경·정상석·약수터·운동기구)
 * · 바닷가(모래·바다·파도·방파제·등대·선베드·비치볼·모래성·조개·튜브·불꽃놀이 상자·망루·낚싯대·배·부표·갈매기).
 * 원점은 바닥 가운데, 앞면은 +z (lib/town.ts 자리 정의와 같은 기준).
 */
import * as THREE from 'three'
import type { AvatarLook } from '../art/avatar'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CVS_DOOR_X } from '../lib/cvs'
import { groundY, HILL_H, PIER_Y, type Prop, type VendorKind, SEA_Y, SIDEWALK_N, STORE_D, STORE_FRONT, STORE_W, type Zones } from '../lib/town'
import { box, canvasTexture, capsule, cone, cyl, group, mat, part, roundBox, sphere, tint, torus, fillFit } from './kit'

/** 밤에만 빛나는 재질 (낮 세기 → 밤 세기) */
export interface Glow {
  mat: THREE.MeshStandardMaterial
  day: number
  night: number
}

/** 매 프레임 움직이는 것들 */
export interface PlaceAnims {
  /** 비치볼 (park/ball0 → 공): 차면 튄다 */
  balls: Map<string, THREE.Object3D>
  /** 누가 그 아래에 앉거나 누우면 비쳐 보이게 할 지붕·파라솔 (park/pavilion0 → 지붕) */
  fades: Map<string, THREE.Object3D>
  glows: Glow[]
  owned: { dispose(): void }[]
  tick: ((t: number, night: boolean) => void)[]
}

export const newAnims = (): PlaceAnims => ({ balls: new Map(), fades: new Map(), glows: [], owned: [], tick: [] })

/** 캐시 밖 재질 (비치게 할 수 있게 따로) */
function own(a: PlaceAnims, color: string, rough = 0.7) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough })
  a.owned.push(m)
  return m
}

function glowMat(a: PlaceAnims, color: string, emissive: string, day: number, night: number, opts: { rough?: number; map?: THREE.Texture } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: day, roughness: opts.rough ?? 0.5, map: opts.map ?? null })
  if (opts.map) m.emissiveMap = opts.map
  a.glows.push({ mat: m, day, night })
  a.owned.push(m)
  return m
}

/** 글씨 판 텍스처 */
function signTex(a: PlaceAnims, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const t = canvasTexture(w, h, (ctx) => draw(ctx, w, h))
  a.owned.push(t)
  return t
}

const FONT = 'Galmuri11, system-ui, sans-serif'

function texMesh(a: PlaceAnims, geo: THREE.BufferGeometry, tex: THREE.Texture, at: [number, number, number], rot: [number, number, number] = [0, 0, 0], rough = 0.6) {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: rough })
  a.owned.push(m)
  const mesh = part(geo, m, at, { rot })
  return mesh
}

// ─── 편의점 건물 ───

/** 편의점 바깥 (가운데 원점, 앞면 +z). 문을 누르면 들어간다 (userData.shop) */
export function storeBuilding(a: PlaceAnims) {
  const W = STORE_W
  const D = STORE_D
  const H = 3.4
  const g = new THREE.Group()
  const wall = mat('#f3f5f2', { rough: 0.85 })
  const mint = '#2fbfa0'
  const orange = '#ff8a3d'
  // 몸통 · 바닥 띠 · 옥상 난간
  g.add(part(roundBox(W, H, D, 0.06), wall, [0, H / 2, 0]))
  g.add(part(box(W + 0.06, 0.36, D + 0.06), mat('#8c8f99', { rough: 0.9 }), [0, 0.18, 0]))
  g.add(part(box(W + 0.16, 0.22, D + 0.16), mat('#d9ddd8'), [0, H + 0.11, 0]))
  for (const [x, z, w, d] of [[0, D / 2, W + 0.16, 0.14], [0, -D / 2, W + 0.16, 0.14], [W / 2, 0, 0.14, D], [-W / 2, 0, 0.14, D]] as const)
    g.add(part(box(w, 0.4, d), mat('#e4e7e2'), [x, H + 0.4, z]))
  // 옥상: 실외기 둘 · 물탱크
  for (const x of [-2.6, -1.3]) {
    g.add(part(roundBox(1.0, 0.7, 0.6, 0.05), mat('#d6d9de'), [x, H + 0.55, -1.8]))
    g.add(part(cyl(0.24, 0.24, 0.04, 20), mat('#7d828c'), [x + 0.12, H + 0.55, -1.49], { rot: [Math.PI / 2, 0, 0] }))
  }
  g.add(part(cyl(0.55, 0.55, 1.0, 20), mat('#5aa9e6', { rough: 0.5 }), [3.2, H + 0.72, -2.2]))
  // 간판 띠: 민트 · 주황 줄무늬 + 이름
  const signTexture = signTex(a, 1024, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = mint
    ctx.fillRect(0, 0, w, 18)
    ctx.fillStyle = orange
    ctx.fillRect(0, h - 16, w, 16)
    ctx.fillStyle = '#2b2233'
    ctx.font = `700 54px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fillFit(ctx, '방들이편의점24', w / 2, h / 2 + 2, w - 24)
    ctx.fillStyle = mint
    ctx.beginPath()
    ctx.arc(w / 2 - 210, h / 2 + 2, 16, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = orange
    ctx.beginPath()
    ctx.arc(w / 2 + 210, h / 2 + 2, 16, 0, Math.PI * 2)
    ctx.fill()
  })
  const signMat = glowMat(a, '#ffffff', '#ffffff', 0.08, 0.9, { map: signTexture })
  g.add(part(box(W + 0.1, 0.78, 0.16), signMat, [0, H - 0.42, D / 2 + 0.06]))
  // 진열장 창: 안이 비치는 그림 (선반 · 물건 · 형광등)
  const winTex = signTex(a, 512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#eaf6f6'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ffffff'
    for (let x = 30; x < w; x += 120) ctx.fillRect(x, 8, 70, 6)
    const colors = ['#ff6b6b', '#ffd94a', '#59c26b', '#5aa9e6', '#ff9fd0', '#ff8a3d', '#b48cff']
    for (let row = 0; row < 3; row++) {
      const y = 70 + row * 62
      ctx.fillStyle = '#b9c4c9'
      ctx.fillRect(10, y + 40, w - 20, 6)
      for (let x = 16, i = 0; x < w - 24; i++) {
        const bw = 14 + ((i * 7 + row * 3) % 4) * 4
        const bh = 22 + ((i * 5 + row) % 3) * 7
        ctx.fillStyle = colors[(i + row * 2) % colors.length]
        ctx.fillRect(x, y + 40 - bh, bw, bh)
        x += bw + 4
      }
    }
    // 1+1 행사 포스터
    ctx.fillStyle = '#ff3b5c'
    ctx.fillRect(w - 110, 18, 86, 44)
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 28px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('1+1', w - 67, 41)
  })
  const winMat = glowMat(a, '#ffffff', '#ffffff', 0.15, 0.85, { map: winTex, rough: 0.2 })
  const frame = mat('#4a4f5c', { rough: 0.5 })
  const doorX = CVS_DOOR_X
  // 창: 문 왼쪽 큰 창 하나 + 문 오른쪽 작은 창
  const winL = { x0: -W / 2 + 0.35, x1: doorX - 0.95 }
  const winR = { x0: doorX + 0.95, x1: W / 2 - 0.35 }
  for (const w of [winL, winR]) {
    const ww = w.x1 - w.x0
    const cx = (w.x0 + w.x1) / 2
    const pane = part(box(ww, 2.0, 0.06), winMat, [cx, 1.42, D / 2 + 0.02])
    g.add(pane)
    g.add(part(box(ww + 0.14, 0.1, 0.12), frame, [cx, 0.42, D / 2 + 0.04]))
    g.add(part(box(ww + 0.14, 0.1, 0.12), frame, [cx, 2.45, D / 2 + 0.04]))
    for (let k = 0; k <= Math.round(ww / 1.6); k++) {
      const x = w.x0 + (ww * k) / Math.round(ww / 1.6)
      g.add(part(box(0.08, 2.1, 0.12), frame, [x, 1.42, D / 2 + 0.04]))
    }
  }
  // 문: 유리 양문 + 손잡이 + 위 작은 차양 (누르면 들어간다)
  const glass = mat('#bfe6ef', { rough: 0.1, opacity: 0.55 })
  const door = group(
    part(box(1.7, 2.5, 0.1), frame, [0, 1.25, 0]),
    part(box(0.72, 2.25, 0.05), glass, [-0.37, 1.18, 0.05]),
    part(box(0.72, 2.25, 0.05), glass, [0.37, 1.18, 0.05]),
    part(box(0.04, 0.5, 0.06), mat('#d9dde2', { metal: 0.6, rough: 0.3 }), [-0.08, 1.15, 0.1]),
    part(box(0.04, 0.5, 0.06), mat('#d9dde2', { metal: 0.6, rough: 0.3 }), [0.08, 1.15, 0.1]),
    part(roundBox(0.5, 0.16, 0.02, 0.02), mat(orange), [-0.37, 1.65, 0.09]),
    part(roundBox(0.5, 0.16, 0.02, 0.02), mat(mint), [0.37, 1.65, 0.09]),
    part(roundBox(2.1, 0.08, 0.7, 0.03), mat(mint, { rough: 0.5 }), [0, 2.72, 0.32]),
    part(box(1.9, 0.06, 1.0), mat('#5c5f6b', { rough: 0.95 }), [0, 0.03, 0.62]),
  )
  door.position.set(doorX, 0, D / 2)
  door.traverse((n) => (n.userData.shop = 'cvs'))
  g.add(door)
  // 앞 계단 (가게 앞 콘크리트 턱)
  g.add(part(box(W + 0.4, 0.08, 0.6), mat('#cfd2cc', { rough: 0.95 }), [0, 0.04, D / 2 + 0.32]))
  // 옆벽 광고판
  const ad = signTex(a, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#fff3b0'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ff8a3d'
    ctx.font = `700 44px ${FONT}`
    ctx.textAlign = 'center'
    fillFit(ctx, '오늘의', w / 2, 70, w - 24)
    fillFit(ctx, '컵라면', w / 2, 125, w - 24)
    ctx.fillStyle = '#ff3b5c'
    ctx.font = `700 58px ${FONT}`
    fillFit(ctx, '2+1', w / 2, 200, w - 24)
  })
  g.add(texMesh(a, new THREE.PlaneGeometry(1.4, 1.4), ad, [W / 2 + 0.01, 1.7, 1.2], [0, Math.PI / 2, 0]))
  g.position.set(0, 0, STORE_FRONT - D / 2)
  g.traverse((n) => {
    if (n.userData.shop === undefined) n.userData.shop = 'cvs'
  })
  return g
}

// ─── 빈 집터 ───

/** "입주 대기" 나무 팻말 (누르면 친구를 초대하면 집이 생긴다고 알려 준다) */
export function lotSign(a: PlaceAnims) {
  const wood = mat('#b98a5e', { rough: 0.9 })
  const t = signTex(a, 256, 160, (ctx, w, h) => {
    ctx.fillStyle = '#fff7e8'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#c9a27e'
    ctx.lineWidth = 10
    ctx.strokeRect(5, 5, w - 10, h - 10)
    ctx.fillStyle = '#2b2233'
    ctx.font = `700 44px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fillFit(ctx, '입주 대기', w / 2, 58, w - 24)
    ctx.fillStyle = '#ff7fa6'
    ctx.font = `700 28px ${FONT}`
    fillFit(ctx, '친구를 초대해요!', w / 2, 112, w - 24)
  })
  const g = new THREE.Group()
  g.add(part(box(0.1, 1.2, 0.1), wood, [-0.45, 0.6, 0]))
  g.add(part(box(0.1, 1.2, 0.1), wood, [0.45, 0.6, 0]))
  g.add(part(roundBox(1.15, 0.72, 0.08, 0.03), wood, [0, 1.05, 0]))
  g.add(texMesh(a, new THREE.PlaneGeometry(1.02, 0.62), t, [0, 1.05, 0.045]))
  return g
}

// ─── 큰길: 붕어빵 노점 · 버스정류장 · 버스 ───

/** 붕어빵 수레: 빨간 천막 지붕 · 붕어빵 틀 · 김 (손님은 북쪽 길 쪽에 선다) */
export function bungeoCart(a: PlaceAnims) {
  const g = new THREE.Group()
  const red = mat('#e8463c', { rough: 0.6 })
  g.add(part(roundBox(1.6, 0.85, 0.95, 0.05), mat('#f4ede2', { rough: 0.8 }), [0, 0.62, 0]))
  g.add(part(box(1.64, 0.12, 0.99), red, [0, 1.0, 0]))
  for (const x of [-0.6, 0.6]) g.add(part(cyl(0.16, 0.16, 0.08, 14), mat('#3b3646'), [x, 0.16, 0.5], { rot: [Math.PI / 2, 0, 0] }))
  // 붕어빵 틀 (까만 철판) + 붕어빵 다섯
  g.add(part(box(1.2, 0.08, 0.5), mat('#2b2a30', { metal: 0.5, rough: 0.4 }), [0, 1.1, -0.12]))
  for (let i = 0; i < 5; i++) {
    const fish = part(sphere(0.09, 10, 8), mat('#d99a4e', { rough: 0.7 }), [-0.44 + i * 0.22, 1.17, -0.12], { scale: [1.6, 0.6, 1] })
    g.add(fish)
    g.add(part(cone(0.06, 0.1, 6), mat('#c9873f'), [-0.44 + i * 0.22 + 0.17, 1.17, -0.12], { rot: [0, 0, Math.PI / 2] }))
  }
  // 천막 지붕 + 기둥 + 간판
  for (const x of [-0.75, 0.75]) g.add(part(cyl(0.03, 0.03, 1.2, 8), mat('#8a5a38'), [x, 1.6, 0.4]))
  const roof = part(box(1.9, 0.08, 1.2), red, [0, 2.22, 0.05], { rot: [-0.18, 0, 0] })
  g.add(roof)
  for (let i = 0; i < 5; i++) g.add(part(box(0.19, 0.081, 1.21), mat('#ffffff', { rough: 0.6 }), [-0.76 + i * 0.38, 2.225, 0.05], { rot: [-0.18, 0, 0] }))
  const t = signTex(a, 256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#fff3d6'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#c0392b'
    ctx.font = `700 46px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fillFit(ctx, '붕어빵', w / 2, h / 2 + 2, w - 24)
  })
  g.add(texMesh(a, new THREE.PlaneGeometry(0.9, 0.34), t, [0, 0.66, -0.48], [0, Math.PI, 0]))
  // 김: 위로 올라가며 사라지는 동그라미 셋
  const steamMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, roughness: 1 })
  a.owned.push(steamMat)
  const puffs = [0, 1, 2].map((i) => {
    const m = part(sphere(0.09, 8, 6), steamMat, [-0.3 + i * 0.3, 1.3, -0.12], { shadow: false, name: 'steam' })
    g.add(m)
    return m
  })
  a.tick.push((time) => {
    puffs.forEach((m, i) => {
      const k = (time * 0.5 + i / 3) % 1
      m.position.y = 1.25 + k * 0.7
      m.scale.setScalar(0.6 + k)
    })
  })
  return g
}

/** 버스정류장: 지붕 · 뒷벽 유리 · 벤치 · 노선 안내판 (벤치는 북쪽 길을 본다) */
export function busStop(a: PlaceAnims) {
  const g = new THREE.Group()
  const frame = mat('#4a6fa5', { rough: 0.5, metal: 0.3 })
  for (const x of [-1.5, 1.5]) g.add(part(box(0.1, 2.3, 0.1), frame, [x, 1.15, 0.3]))
  g.add(part(roundBox(3.4, 0.1, 1.2, 0.04), frame, [0, 2.32, 0.05]))
  g.add(part(box(3.0, 1.6, 0.05), mat('#cfeef8', { rough: 0.05, opacity: 0.35 }), [0, 1.2, 0.32], { shadow: false }))
  // 벤치
  g.add(part(roundBox(2.4, 0.08, 0.42, 0.03), mat('#c9784a', { rough: 0.7 }), [0, 0.45, 0.0]))
  for (const x of [-1, 1]) g.add(part(box(0.08, 0.45, 0.36), mat('#7d828c'), [x, 0.22, 0.0]))
  // 노선 안내판 (밤에 빛난다)
  const t = signTex(a, 256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#4a6fa5'
    ctx.fillRect(0, 0, w, 34)
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 26px ${FONT}`
    ctx.textAlign = 'center'
    fillFit(ctx, '방들이동 정류장', w / 2, 26, w - 24)
    ctx.fillStyle = '#2b2233'
    ctx.font = `700 24px ${FONT}`
    fillFit(ctx, '7 번 · 바닷가 ↔ 뒷산', w / 2, 72, w - 24)
    ctx.fillStyle = '#ff5a4f'
    fillFit(ctx, '곧 도착', w / 2, 108, w - 24)
  })
  const m = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.15, roughness: 0.5 })
  a.owned.push(m)
  a.glows.push({ mat: m, day: 0.15, night: 0.9 })
  g.add(part(box(0.06, 0.6, 1.2), frame, [1.62, 1.45, 0.05]))
  g.add(part(new THREE.PlaneGeometry(1.1, 0.55), m, [1.66, 1.45, 0.05], { rot: [0, Math.PI / 2, 0], shadow: false }))
  return g
}

/** 동네 버스 (초록 마을버스): 가운데 x=0, 앞이 +x (동쪽으로 달린다) */
export function townBus() {
  const g = new THREE.Group()
  const body = mat('#59c26b', { rough: 0.5 })
  g.add(part(roundBox(6.2, 2.3, 2.3, 0.25), body, [0, 1.45, 0]))
  g.add(part(box(6.24, 0.5, 2.34), mat('#ffffff', { rough: 0.5 }), [0, 0.65, 0]))
  const glass = mat('#bfe3ff', { rough: 0.1, metal: 0.2 })
  for (let i = 0; i < 4; i++) for (const side of [-1, 1]) g.add(part(box(1.1, 0.8, 0.04), glass, [-2.2 + i * 1.35, 1.85, side * 1.16]))
  g.add(part(box(0.04, 1.0, 1.9), glass, [3.11, 1.8, 0]))
  for (const x of [-2.1, 2.1]) for (const side of [-1, 1]) g.add(part(cyl(0.42, 0.42, 0.3, 16), mat('#2b2a30'), [x, 0.42, side * 1.05], { rot: [Math.PI / 2, 0, 0] }))
  g.add(part(box(0.06, 0.3, 1.2), mat('#2b2233'), [3.12, 2.45, 0]))
  return g
}

/** 동네 고양이: 몸 · 머리 · 귀 · 꼬리 (앞이 +z) */
export function cat(fur: string, belly: string) {
  const g = new THREE.Group()
  const f = mat(fur, { rough: 0.9 })
  const body = new THREE.Group()
  body.name = 'catbody'
  body.add(part(capsule(0.13, 0.32), f, [0, 0.22, 0], { rot: [Math.PI / 2, 0, 0] }))
  body.add(part(sphere(0.12, 12, 10), mat(belly, { rough: 0.9 }), [0, 0.18, 0.08], { scale: [0.9, 0.7, 1.2] }))
  body.add(part(sphere(0.15, 14, 10), f, [0, 0.38, 0.26]))
  for (const x of [-0.08, 0.08]) {
    body.add(part(cone(0.05, 0.1, 6), f, [x, 0.52, 0.25]))
    body.add(part(sphere(0.022, 8, 6), mat('#2b2233'), [x * 0.7, 0.4, 0.4]))
  }
  body.add(part(sphere(0.02, 6, 6), mat('#ff8fb8'), [0, 0.36, 0.41]))
  const tail = part(capsule(0.035, 0.32), f, [0, 0.36, -0.28], { rot: [-0.6, 0, 0], name: 'cattail' })
  body.add(tail)
  for (const [x, z] of [[-0.07, 0.12], [0.07, 0.12], [-0.07, -0.12], [0.07, -0.12]] as const) body.add(part(cyl(0.035, 0.035, 0.14, 8), f, [x, 0.07, z]))
  g.add(body)
  return g
}

// ─── 편의점 앞 ───

/**
 * 우산 덮개: 색 조각들을 색마다 하나로 합친다 (조각마다 그리면 느리다).
 * 재질은 이 덮개만의 것이라 누가 아래 있으면 비치게 바꿀 수 있다
 */
function umbrella(a: PlaceAnims, r: number, h: number, colors: string[], n: number) {
  const byColor = new Map<string, THREE.BufferGeometry[]>()
  for (let i = 0; i < n; i++) {
    const c = colors[i % colors.length]
    const geo = new THREE.ConeGeometry(r, h, 2, 1, true, (i / n) * Math.PI * 2, (Math.PI * 2) / n)
    if (!byColor.has(c)) byColor.set(c, [])
    byColor.get(c)!.push(geo)
  }
  const g = new THREE.Group()
  for (const [c, geos] of byColor) {
    const merged = mergeGeometries(geos)!
    for (const x of geos) x.dispose()
    a.owned.push(merged)
    const m = new THREE.Mesh(merged, cloth(a, c))
    m.castShadow = true
    g.add(m)
  }
  return g
}

/** 천 재질 (양면, 캐시 밖에서 따로) */
function cloth(a: PlaceAnims, color: string) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide })
  a.owned.push(m)
  return m
}

export function parasolTable(a: PlaceAnims, base: string) {
  const g = group(
    // 둥근 탁자 + 기둥 + 받침
    part(cyl(0.45, 0.45, 0.04, 28), mat('#ffffff', { rough: 0.5 }), [0, 0.72, 0]),
    part(cyl(0.035, 0.035, 0.7, 10), mat('#d9dde2', { metal: 0.5, rough: 0.4 }), [0, 0.36, 0]),
    part(cyl(0.26, 0.3, 0.05, 20), mat('#d9dde2', { metal: 0.5, rough: 0.4 }), [0, 0.03, 0]),
    // 컵라면 · 삼각김밥
    part(cyl(0.07, 0.055, 0.1, 16), mat('#ff5a4f'), [0.12, 0.79, 0.08]),
    part(cyl(0.072, 0.072, 0.01, 16), mat('#fff3c4'), [0.12, 0.845, 0.08]),
    part(cone(0.08, 0.12, 3), mat('#ffffff'), [-0.14, 0.78, -0.05], { rot: [Math.PI / 2, 0, 0.3], scale: [1, 1, 0.4] }),
    // 파라솔
    part(cyl(0.025, 0.025, 2.2, 8), mat('#f3f5f2'), [0, 1.8, 0]),
  )
  const canopy = umbrella(a, 1.25, 0.45, ['#2fbfa0', '#ffffff'], 8)
  canopy.position.y = 2.75
  canopy.add(part(sphere(0.05, 10, 8), own(a, '#2fbfa0'), [0, 0.25, 0]))
  canopy.name = 'canopy'
  a.fades.set(base, canopy)
  g.add(canopy)
  // 플라스틱 의자 둘 (탁자를 본다)
  for (const s of [-1, 1]) {
    const chair = group(
      part(roundBox(0.42, 0.05, 0.42, 0.03), mat('#59c26b', { rough: 0.6 }), [0, 0.44, 0]),
      part(roundBox(0.42, 0.42, 0.05, 0.03), mat('#59c26b', { rough: 0.6 }), [0, 0.68, -0.2], { rot: [-0.12, 0, 0] }),
      ...[[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].map(([x, z]) => part(cyl(0.02, 0.02, 0.44, 6), mat('#4aa85a'), [x, 0.22, z])),
    )
    chair.position.set(s * 0.74, 0, 0)
    chair.rotation.y = -s * (Math.PI / 2)
    g.add(chair)
  }
  return g
}

export function vending(a: PlaceAnims) {
  const face = signTex(a, 128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#eef7fb'
    ctx.fillRect(0, 0, w, h)
    const cans = ['#ff3b30', '#ffd94a', '#2fbfa0', '#5aa9e6', '#ff8a3d', '#8b5a3c']
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = cans[(r * 4 + c) % cans.length]
        ctx.fillRect(10 + c * 28, 12 + r * 40, 20, 30)
        ctx.fillStyle = '#ff3b5c'
        ctx.fillRect(14 + c * 28, 46 + r * 40, 12, 4)
      }
    ctx.fillStyle = '#2b2233'
    ctx.fillRect(10, h - 70, w - 20, 44)
  })
  const glow = glowMat(a, '#ffffff', '#ffffff', 0.25, 0.9, { map: face, rough: 0.25 })
  return group(
    part(roundBox(0.9, 1.85, 0.7, 0.05), mat('#ff3b30', { rough: 0.45 }), [0, 0.925, 0]),
    part(box(0.62, 1.2, 0.04), glow, [-0.08, 1.15, 0.35]),
    part(roundBox(0.14, 0.5, 0.04, 0.02), mat('#d9dde2', { metal: 0.5, rough: 0.3 }), [0.33, 1.2, 0.36]),
    part(box(0.5, 0.18, 0.06), mat('#2b2233'), [-0.08, 0.3, 0.34]),
    part(roundBox(0.92, 0.1, 0.72, 0.03), mat('#c42a22'), [0, 1.86, 0]),
  )
}

export function recycleBins(a: PlaceAnims) {
  const g = new THREE.Group()
  ;[['#5aa9e6', '캔'], ['#ffd94a', '플라'], ['#59c26b', '종이']].forEach(([c, t], i) => {
    const label = signTex(a, 128, 64, (ctx, w, h) => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#2b2233'
      ctx.font = `700 34px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      fillFit(ctx, t, w / 2, h / 2 + 2, w - 24)
    })
    const x = (i - 1) * 0.36
    g.add(part(roundBox(0.32, 0.72, 0.42, 0.04), mat(c, { rough: 0.6 }), [x, 0.36, 0]))
    g.add(part(roundBox(0.34, 0.06, 0.44, 0.02), mat(tint(c, -0.15)), [x, 0.74, 0]))
    g.add(texMesh(a, new THREE.PlaneGeometry(0.22, 0.11), label, [x, 0.5, 0.215]))
  })
  return g
}

// ─── 포장마차 (손님 의자는 -z 쪽, 안쪽 조리대는 +z 쪽) ───

export function pocha(a: PlaceAnims) {
  const tarpD = mat('#e2522b', { rough: 0.8 })
  const pole = mat('#6b6f7a', { metal: 0.4, rough: 0.5 })
  const g = new THREE.Group()
  for (const [x, z] of [[-1.7, -1.1], [1.7, -1.1], [-1.7, 1.1], [1.7, 1.1]]) g.add(part(cyl(0.035, 0.035, 2.5, 8), pole, [x, 1.25, z]))
  // 지붕: 둥근 천막 (반원통)
  // 축이 x로 눕고 둥근 면이 위로 (높이는 납작하게)
  // 앞(-z)은 짧게: 화면에서 조리대가 들여다보이게 지붕을 뒤로 물린다
  const roofGeo = new THREE.CylinderGeometry(1.15, 1.15, 3.7, 24, 1, true, 0, Math.PI)
  roofGeo.rotateZ(Math.PI / 2)
  roofGeo.scale(1, 0.4, 1)
  const roof = new THREE.Mesh(roofGeo, cloth(a, '#ff6a3d'))
  roof.position.set(0, 2.48, 0.05)
  roof.castShadow = true
  g.add(roof)
  // 뒤·옆 천막 (손님 쪽 -z는 열려 있다)
  g.add(part(box(3.5, 2.5, 0.04), tarpD, [0, 1.25, 1.12]))
  for (const s of [-1, 1]) g.add(part(box(0.04, 2.5, 2.2), mat('#ffb08a', { rough: 0.8, opacity: 0.75 }), [s * 1.72, 1.25, 0]))
  // 조리대 · 떡볶이 판 · 어묵 통 · 순대
  g.add(part(roundBox(3.0, 0.82, 0.9, 0.04), mat('#c9cbd6', { metal: 0.3, rough: 0.4 }), [0, 0.41, 0.25]))
  g.add(part(cyl(0.45, 0.42, 0.08, 28), mat('#3b3646', { metal: 0.4, rough: 0.4 }), [-0.8, 0.86, 0.25]))
  g.add(part(cyl(0.42, 0.42, 0.04, 28), mat('#e8402a', { rough: 0.6 }), [-0.8, 0.9, 0.25]))
  for (let i = 0; i < 9; i++) g.add(part(capsule(0.025, 0.12), mat('#ff6a4d', { rough: 0.5 }), [-0.8 + Math.cos(i * 2.4) * 0.22, 0.93, 0.25 + Math.sin(i * 2.4) * 0.2], { rot: [Math.PI / 2, 0, i] }))
  g.add(part(roundBox(0.7, 0.18, 0.4, 0.03), mat('#c9cbd6', { metal: 0.5, rough: 0.3 }), [0.4, 0.92, 0.25]))
  g.add(part(box(0.66, 0.02, 0.36), mat('#e6c38a', { rough: 0.5 }), [0.4, 1.0, 0.25]))
  for (let i = 0; i < 4; i++) g.add(part(cyl(0.008, 0.008, 0.4, 5), mat('#c98f5a'), [0.18 + i * 0.14, 1.12, 0.25], { rot: [0.3, 0, 0] }))
  g.add(part(cyl(0.12, 0.12, 0.06, 18), mat('#ffffff'), [1.15, 0.85, 0.15]))
  // 손님 긴 의자 (빨간 플라스틱 동그란 의자)
  for (const x of [-0.85, 0, 0.85]) {
    g.add(part(cyl(0.18, 0.15, 0.04, 18), mat('#e8402a', { rough: 0.5 }), [x, 0.44, -1.5]))
    g.add(part(cyl(0.12, 0.17, 0.42, 14, ), mat('#d33a26', { rough: 0.5 }), [x, 0.21, -1.5]))
  }
  // 손님 탁자 (조리대 앞 턱)
  g.add(part(box(3.0, 0.05, 0.36), mat('#c98f5a'), [0, 0.86, -0.38]))
  // 등 줄 (밤에 켜진다)
  const bulb = glowMat(a, '#fff1c4', '#ffb347', 0.1, 2.4, { rough: 0.3 })
  for (let i = 0; i < 7; i++) {
    const x = -1.5 + i * 0.5
    g.add(part(cyl(0.004, 0.004, 0.12, 4), pole, [x, 2.38, -1.08]))
    g.add(part(sphere(0.07, 10, 8), bulb, [x, 2.28, -1.08]))
  }
  // 간판
  const label = signTex(a, 512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#fff3c4'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#e8402a'
    ctx.font = `700 64px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fillFit(ctx, '방들이 포차', w / 2, h / 2 + 4, w - 24)
  })
  const signMat = glowMat(a, '#ffffff', '#ffffff', 0.05, 0.8, { map: label })
  // 앞 처마 아래 매단 간판
  g.add(part(box(1.7, 0.42, 0.04), signMat, [0, 2.0, -1.12]))
  for (const x of [-0.7, 0.7]) g.add(part(cyl(0.006, 0.006, 0.36, 4), pole, [x, 2.38, -1.12]))
  return g
}

// ─── 뒷산 ───

/** 산 땅: 높이를 따라 휜 판 + 높이에 따른 색 (풀 → 짙은 풀 → 흙길) */
export function hillTerrain(z: Zones, grass: THREE.Texture) {
  const H = z.hill
  const x0 = H.x - H.rx - 3
  const x1 = Math.min(z.hw - 0.5, H.x + H.rx + 3)
  const z0 = H.z - H.rz - 2
  const z1 = SIDEWALK_N
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 72, 48)
  geo.rotateX(-Math.PI / 2)
  geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2)
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  const colors = new Float32Array(pos.count * 3)
  // 잔디 무늬는 골목 잔디와 같은 텍스처 (경계가 안 보이게), 높을수록 짙은 풀색을 곱한다
  const low = new THREE.Color('#ffffff')
  const high = new THREE.Color('#9ccf96')
  const soil = new THREE.Color('#e6c08f')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const zz = pos.getZ(i)
    const y = groundY(z, x, zz)
    pos.setY(i, y + 0.004)
    uv.setXY(i, x / 6, -zz / 6)
    c.copy(low).lerp(high, Math.min(1, y / HILL_H))
    // 등산로: 기슭에서 꼭대기까지 흙길 · 꼭대기 마당
    const tx = H.x + 2.2 - (zz + 5.9) * 0.05
    const trail = Math.max(0, 1 - Math.abs(x - tx) / 0.8) * (zz > H.z + 2.4 && zz < -5.3 ? 1 : 0)
    const top = Math.max(0, 1 - Math.hypot((x - H.x) / H.rx, (zz - H.z) / H.rz) / 0.28)
    c.lerp(soil, Math.min(0.9, trail * 1.6 + Math.min(1, top * 2.5) * 0.55))
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const tex = grass.clone()
  tex.repeat.set(1, 1)
  tex.needsUpdate = true
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 1 }))
  m.receiveShadow = true
  m.userData.ground = true
  m.name = 'terrain'
  return m
}

/** 등산로 통나무 계단 (기슭 → 꼭대기, 땅 높이를 따라) */
export function trailSteps(z: Zones) {
  const g = new THREE.Group()
  const log = mat('#9a6a3e', { rough: 0.9 })
  const H = z.hill
  const z0 = -5.9
  const z1 = H.z + 2.8
  let prevY = 0
  for (let zz = z0; zz >= z1; zz -= 0.55) {
    const x = H.x + 2.2 - (zz + 5.9) * 0.05
    const y = groundY(z, x, zz)
    if (y - prevY < 0.05 && zz !== z0) continue
    prevY = y
    const s = part(cyl(0.07, 0.07, 1.2, 8), log, [x, y + 0.04, zz], { rot: [0, 0, Math.PI / 2] })
    s.userData.ground = true
    g.add(s)
  }
  // 밧줄 난간 (오른쪽)
  for (let zz = z0 - 0.3; zz >= z1; zz -= 1.6) {
    const x = H.x + 2.2 - (zz + 5.9) * 0.05 + 0.8
    g.add(part(cyl(0.04, 0.05, 0.75, 8), log, [x, groundY(z, x, zz) + 0.37, zz]))
  }
  return g
}

export function pine(scale = 1) {
  const leaf = mat('#3f8f5a', { rough: 0.95 })
  const leaf2 = mat('#4fa266', { rough: 0.95 })
  const t = group(
    part(cyl(0.1, 0.15, 1.0, 8), mat('#7a4f30', { rough: 1 }), [0, 0.5, 0]),
    part(cone(0.95, 1.3, 9), leaf, [0, 1.35, 0]),
    part(cone(0.75, 1.1, 9), leaf2, [0, 2.0, 0]),
    part(cone(0.5, 0.9, 9), leaf, [0, 2.55, 0]),
  )
  t.scale.setScalar(scale)
  t.traverse((n) => (n.userData.ground = true))
  return t
}

export function trailSign(a: PlaceAnims) {
  const tex = signTex(a, 256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#c98f5a'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 34px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fillFit(ctx, '↑ 방들이산 정상', w / 2, h / 2 + 2, w - 24)
  })
  return group(
    part(cyl(0.05, 0.06, 1.6, 8), mat('#8a5a38'), [0, 0.8, 0]),
    texMesh(a, box(1.1, 0.4, 0.06), tex, [0.25, 1.45, 0], [0, -0.35, 0]),
  )
}

/** 정자: 마루 + 기둥 넷 + 처마가 들린 기와 지붕 (앞 +z에 디딤돌) */
export function pavilion(a: PlaceAnims, base: string) {
  const wood = mat('#a5532f', { rough: 0.7 })
  const floor = mat('#d9a86c', { rough: 0.8 })
  const roofM = own(a, '#4d5566', 0.8)
  const eaveM = own(a, '#5d6577', 0.8)
  const goldM = own(a, '#ffd94a', 0.4)
  const g = group(
    part(roundBox(2.8, 0.14, 2.8, 0.04), floor, [0, 0.42, 0]),
    part(box(2.6, 0.36, 2.6), mat('#8a5a38'), [0, 0.18, 0]),
    part(box(0.9, 0.12, 0.45), mat('#cfc6b8', { rough: 1 }), [0, 0.12, 1.65]),
  )
  for (const [x, z] of [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]]) {
    g.add(part(cyl(0.09, 0.1, 2.2, 10), wood, [x, 1.55, z]))
    g.add(part(cyl(0.12, 0.12, 0.08, 10), mat('#3b3646'), [x, 0.5, z]))
  }
  // 대들보 (단청 느낌 초록·빨강)
  for (const [x, z, w, d] of [[0, -1.25, 2.6, 0.16], [0, 1.25, 2.6, 0.16], [-1.25, 0, 0.16, 2.6], [1.25, 0, 0.16, 2.6]] as const) {
    g.add(part(box(w, 0.2, d), mat('#3f9a7a', { rough: 0.6 }), [x, 2.58, z]))
    g.add(part(box(w * 0.98 + 0.01, 0.06, d * 0.98 + 0.01), mat('#e2522b'), [x, 2.45, z]))
  }
  // 지붕: 네모뿔 + 처마 (조금 들린). 누가 앉으면 비쳐 보이게 따로 둔다
  const roof = new THREE.Group()
  roof.name = 'roof'
  roof.add(part(cone(2.45, 1.25, 4), roofM, [0, 3.25, 0], { rot: [0, Math.PI / 4, 0] }))
  roof.add(part(box(3.3, 0.08, 3.3), eaveM, [0, 2.72, 0]))
  for (const [x, z] of [[-1.65, -1.65], [1.65, -1.65], [-1.65, 1.65], [1.65, 1.65]])
    roof.add(part(cone(0.12, 0.35, 6), roofM, [x, 2.85, z], { rot: [x > 0 ? -0.6 : 0.6, 0, z > 0 ? 0.6 : -0.6] }))
  roof.add(part(sphere(0.14, 12, 8), goldM, [0, 3.92, 0]))
  a.fades.set(base, roof)
  g.add(roof)
  // 마루 끝 방석 셋 (걸터앉는 자리)
  for (const x of [-0.75, 0, 0.75]) g.add(part(roundBox(0.48, 0.05, 0.42, 0.03), mat('#ff8fb8', { rough: 0.9 }), [x, 0.515, 1.12]))
  return g
}

/** 동전 망원경: 동네(남, +z)를 본다. 눈 대는 쪽은 뒤(-z) */
export function scope() {
  const metal = mat('#5aa9e6', { metal: 0.3, rough: 0.4 })
  const dark = mat('#2b2233', { rough: 0.4 })
  const head = group(
    part(roundBox(0.5, 0.32, 0.42, 0.08), metal, [0, 0, 0]),
    part(cyl(0.09, 0.11, 0.24, 16), metal, [-0.12, 0.02, 0.28], { rot: [Math.PI / 2, 0, 0] }),
    part(cyl(0.09, 0.11, 0.24, 16), metal, [0.12, 0.02, 0.28], { rot: [Math.PI / 2, 0, 0] }),
    part(cyl(0.075, 0.075, 0.02, 16), mat('#9fdcff', { rough: 0.1 }), [-0.12, 0.02, 0.405], { rot: [Math.PI / 2, 0, 0] }),
    part(cyl(0.075, 0.075, 0.02, 16), mat('#9fdcff', { rough: 0.1 }), [0.12, 0.02, 0.405], { rot: [Math.PI / 2, 0, 0] }),
    part(roundBox(0.38, 0.1, 0.12, 0.03), dark, [0, 0.03, -0.24]),
  )
  head.position.y = 1.28
  head.rotation.x = 0.12
  return group(
    part(cyl(0.22, 0.28, 0.12, 18), mat('#8c8f99'), [0, 0.06, 0]),
    part(cyl(0.06, 0.07, 1.1, 12), mat('#8c8f99', { metal: 0.4, rough: 0.4 }), [0, 0.66, 0]),
    part(roundBox(0.16, 0.2, 0.14, 0.03), dark, [0, 1.05, 0.02]),
    head,
  )
}

export function summitStone(a: PlaceAnims) {
  const tex = signTex(a, 128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#d7d2c8'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#2b2233'
    ctx.font = `700 34px ${FONT}`
    ctx.textAlign = 'center'
    for (const [i, t] of ['방', '들', '이', '산'].entries()) fillFit(ctx, t, w / 2, 48 + i * 42, w - 24)
    ctx.font = `400 20px ${FONT}`
    fillFit(ctx, '해발 52m', w / 2, h - 30, w - 24)
  })
  return group(
    part(roundBox(0.7, 0.16, 0.5, 0.05), mat('#9b9690', { rough: 1 }), [0, 0.08, 0]),
    texMesh(a, roundBox(0.46, 1.25, 0.32, 0.08), tex, [0, 0.78, 0], [0, 0, 0], 1),
  )
}

/** 허리 돌리기 운동기구: 돌아가는 발판 + 앞 손잡이 */
export function twister() {
  const yellow = mat('#ffd94a', { rough: 0.5 })
  const blue = mat('#3d7fd6', { rough: 0.5 })
  return group(
    part(cyl(0.42, 0.45, 0.1, 24), mat('#8c8f99'), [0, 0.05, 0]),
    part(cyl(0.34, 0.34, 0.05, 24), yellow, [0, 0.13, 0]),
    part(cyl(0.05, 0.05, 1.15, 10), blue, [0, 0.6, 0.55]),
    part(torus(0.24, 0.03, Math.PI), blue, [0, 1.15, 0.55], { rot: [0, 0, 0] }),
    part(cyl(0.11, 0.13, 0.08, 12), mat('#6b6f7a'), [0, 0.04, 0.55]),
  )
}

/** 약수터: 돌 물받이 + 쇠 꼭지에서 졸졸 (앞 +z) */
export function spring(a: PlaceAnims) {
  const stone = mat('#a9a49c', { rough: 1 })
  const water = new THREE.MeshStandardMaterial({ color: '#8fd3ff', roughness: 0.1, transparent: true, opacity: 0.7 })
  a.owned.push(water)
  const tex = signTex(a, 256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#8a5a38'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#fff3c4'
    ctx.font = `700 48px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fillFit(ctx, '약수터', w / 2, h / 2 + 2, w - 24)
  })
  const stream = part(cyl(0.02, 0.02, 0.42, 8), water, [0, 0.62, 0.22], { shadow: false, name: 'stream' })
  return group(
    part(roundBox(1.1, 0.9, 0.5, 0.12), stone, [0, 0.45, -0.18]),
    part(roundBox(0.8, 0.3, 0.45, 0.08), stone, [0, 0.15, 0.25]),
    part(box(0.66, 0.04, 0.32), water, [0, 0.28, 0.25]),
    part(cyl(0.025, 0.025, 0.3, 8), mat('#9aa0ad', { metal: 0.7, rough: 0.3 }), [0, 0.84, 0.07], { rot: [Math.PI / 2, 0, 0] }),
    stream,
    // 바가지
    part(sphere(0.09, 12, 8, ), mat('#ffd94a', { rough: 0.5 }), [0.32, 0.33, 0.3], { scale: [1, 0.5, 1] }),
    texMesh(a, box(0.8, 0.3, 0.05), tex, [0, 1.12, -0.18]),
  )
}

// ─── 바닷가 ───

/** 모래사장: 물가로 갈수록 젖은 색, 바다 밑으로 이어진다 */
export function sandBeach(z: Zones) {
  const x0 = z.sand
  const x1 = z.wet + 10
  const geo = new THREE.PlaneGeometry(x1 - x0, 80, 60, 1)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const dry = new THREE.Color('#f6e2b3')
  const wet = new THREE.Color('#d9bb86')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (x0 + x1) / 2
    pos.setY(i, groundY(z, Math.max(x, z.sand + 0.01), 30) - 0.003)
    const k = Math.max(0, Math.min(1, (x - z.shore + 1.5) / 3))
    c.copy(dry).lerp(wet, k)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  // 모래알 무늬
  const grain = canvasTexture(
    128,
    128,
    (ctx) => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 128, 128)
      for (let i = 0; i < 700; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(160,120,60,0.18)' : 'rgba(255,255,255,0.5)'
        ctx.fillRect((i * 37) % 128, (i * 59 + ((i * i) % 31)) % 128, 2, 2)
      }
    },
    [(x1 - x0) / 3, 80 / 3],
  )
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 1 }))
  m.position.set((x0 + x1) / 2, 0, 0)
  m.receiveShadow = true
  m.userData.ground = true
  m.name = 'sand'
  return m
}

/**
 * 바다: 물가는 옥빛으로 얕고 멀수록 짙은 파랑, 잔물결·반짝임이 흐르고,
 * 물가는 무늬 없이 맑아서 모래가 그대로 비친다. 물결 따라 살짝 출렁인다.
 * (조명·그림자·안개는 보통 재질 그대로 받는다)
 */
export function sea(z: Zones, a: PlaceAnims) {
  const g = new THREE.Group()
  g.name = 'sea'
  // 모래가 물 높이 아래로 들어가는 x (물가 선)
  let shoreX = z.shore
  while (shoreX < z.wet + 2 && groundY(z, shoreX, 0) > SEA_Y) shoreX += 0.05
  const x0 = shoreX - 1.5
  const x1 = shoreX + 170
  const geo = new THREE.PlaneGeometry(x1 - x0, 200, 170, 100)
  geo.rotateX(-Math.PI / 2)
  geo.translate((x0 + x1) / 2, 0, 0)
  a.owned.push(geo)
  const uni = {
    uTime: { value: 0 },
    uShore: { value: shoreX },
    uShallow: { value: new THREE.Color('#62dbd6') },
    uDeep: { value: new THREE.Color('#1f78c8') },
  }
  const water = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.22, metalness: 0.08, transparent: true })
  water.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni)
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform float uShore;
varying vec2 vW;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vW = position.xz;
float sdv = position.x - uShore;
float amp = 0.045 * smoothstep(0.5, 7.0, sdv);
transformed.y += amp * (sin(position.x * 0.8 + uTime * 1.25) + 0.6 * sin(position.z * 0.65 - uTime * 1.05 + position.x * 0.25));`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform float uShore;
uniform vec3 uShallow;
uniform vec3 uDeep;
varying vec2 vW;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float sd = vW.x - uShore;
float depthK = smoothstep(0.0, 22.0, sd);
vec3 col = mix(uShallow, uDeep, depthK);
// 물가(얕은 데)는 무늬 없이 맑게: 잔물결·반짝임은 조금 먼 데부터 서서히
float calm = smoothstep(2.0, 9.0, sd);
// 잔물결: 두 방향 물결이 겹치는 밝은 줄
float r1 = sin(vW.x * 1.9 + uTime * 1.5 + sin(vW.y * 1.1 + uTime * 0.3) * 1.6);
float r2 = sin(vW.y * 1.6 - uTime * 1.1 + sin(vW.x * 0.7) * 1.4);
col += vec3(0.06) * smoothstep(0.35, 0.95, r1 * r2) * calm;
col -= vec3(0.025) * smoothstep(0.4, 0.95, -r1 * r2) * calm;
// 햇빛 반짝임
float sp = sin(vW.x * 6.3 + uTime * 2.7) * sin(vW.y * 5.7 - uTime * 2.2 + vW.x * 0.6);
col += vec3(0.3) * smoothstep(0.93, 1.0, sp) * calm * (0.4 + 0.6 * depthK);
diffuseColor.rgb = col;
// 물가는 얕아서 모래가 비치고, 모래와 물 사이는 부드럽게 이어진다
diffuseColor.a = mix(0.0, 0.94, smoothstep(-0.2, 4.0, sd));`,
      )
  }
  a.owned.push(water)
  const plane = new THREE.Mesh(geo, water)
  plane.position.y = SEA_Y
  plane.receiveShadow = true
  plane.userData.ground = true
  plane.name = 'water'
  g.add(plane)
  a.tick.push((t) => {
    uni.uTime.value = t
  })
  return g
}

/** 방파제: 나무 데크 + 물속 기둥 + 북쪽 난간 + 가로등 (경사로는 모래에서 올라온다) */
export function pier(z: Zones, a: PlaceAnims) {
  const P = z.pier
  const deck = mat('#b88452', { rough: 0.85 })
  const deckD = mat('#966a40', { rough: 0.85 })
  const g = new THREE.Group()
  const len = P.x1 - P.x0
  const w = P.half * 2
  const top = part(box(len, 0.14, w), deck, [(P.x0 + P.x1) / 2, PIER_Y - 0.07, P.z])
  top.userData.ground = true
  g.add(top)
  // 판자 줄무늬
  for (let x = P.x0 + 0.3; x < P.x1; x += 0.6) g.add(part(box(0.03, 0.01, w), deckD, [x, PIER_Y + 0.002, P.z], { shadow: false }))
  // 경사로 (모래 → 데크)
  const ramp = part(box(1.05, 0.12, w), deck, [P.x0 - 0.5, PIER_Y / 2 - 0.05, P.z], { rot: [0, 0, Math.atan2(PIER_Y, 1)] })
  ramp.userData.ground = true
  g.add(ramp)
  // 기둥
  for (let x = P.x0 + 0.4; x <= P.x1; x += 1.6)
    for (const s of [-1, 1]) g.add(part(cyl(0.09, 0.09, 1.2, 10), deckD, [x, PIER_Y - 0.6, P.z + s * (P.half - 0.08)]))
  // 북쪽 난간
  for (let x = P.x0 + 0.2; x <= P.x1 - 1.6; x += 1.2) g.add(part(box(0.06, 0.8, 0.06), deckD, [x, PIER_Y + 0.4, P.z - P.half + 0.05]))
  g.add(part(box(len - 1.6, 0.06, 0.08), deck, [(P.x0 + P.x1 - 1.6) / 2, PIER_Y + 0.8, P.z - P.half + 0.05]))
  // 가로등 둘 (밤에 켜진다)
  const lampM = glowMat(a, '#fff3c4', '#ffd27a', 0.15, 2.2, { rough: 0.4 })
  for (const x of [P.x0 + 3, P.x0 + 8.5]) {
    g.add(part(cyl(0.05, 0.05, 2.6, 8), mat('#3b3646'), [x, PIER_Y + 1.3, P.z - P.half + 0.05]))
    g.add(part(sphere(0.16, 12, 8), lampM, [x, PIER_Y + 2.7, P.z - P.half + 0.05]))
  }
  return g
}

/** 등대: 빨강·하양 줄 기둥 + 불빛 방 + 밤엔 빛줄기가 돈다 */
export function lighthouse(a: PlaceAnims) {
  const g = new THREE.Group()
  const red = mat('#e8402a', { rough: 0.6 })
  const white = mat('#ffffff', { rough: 0.6 })
  g.add(part(cyl(0.85, 0.9, 0.3, 24), mat('#a9a49c', { rough: 1 }), [0, 0.15, 0]))
  for (let k = 0; k < 5; k++) {
    const r0 = 0.62 - k * 0.05
    g.add(part(cyl(r0 - 0.05, r0, 0.9, 24), k % 2 ? white : red, [0, 0.3 + 0.45 + k * 0.9, 0]))
  }
  const topY = 0.3 + 4.5
  g.add(part(cyl(0.55, 0.55, 0.08, 24), mat('#3b3646'), [0, topY + 0.04, 0]))
  g.add(part(torus(0.52, 0.02), mat('#3b3646'), [0, topY + 0.32, 0], { rot: [Math.PI / 2, 0, 0] }))
  for (let k = 0; k < 8; k++) {
    const an = (k / 8) * Math.PI * 2
    g.add(part(cyl(0.015, 0.015, 0.3, 4), mat('#3b3646'), [Math.cos(an) * 0.52, topY + 0.17, Math.sin(an) * 0.52]))
  }
  const lamp = glowMat(a, '#fff6d0', '#fff1a8', 0.4, 3, { rough: 0.2 })
  g.add(part(cyl(0.3, 0.3, 0.5, 16), lamp, [0, topY + 0.33, 0]))
  g.add(part(cone(0.42, 0.45, 16), red, [0, topY + 0.8, 0]))
  g.add(part(sphere(0.07, 8, 6), mat('#3b3646'), [0, topY + 1.05, 0]))
  // 빛줄기 (밤에만)
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  a.owned.push(beamMat)
  const beamGeo = new THREE.ConeGeometry(1.6, 16, 20, 1, true)
  beamGeo.translate(0, -8, 0)
  beamGeo.rotateZ(Math.PI / 2)
  a.owned.push(beamGeo)
  const beam = new THREE.Group()
  beam.name = 'beam'
  for (const s of [0, Math.PI]) {
    const b = new THREE.Mesh(beamGeo, beamMat)
    b.rotation.y = s
    b.castShadow = false
    beam.add(b)
  }
  beam.position.y = topY + 0.33
  g.add(beam)
  a.tick.push((t, night) => {
    beam.visible = night
    beam.rotation.y = t * 0.9
  })
  return g
}

export function sunbeds(a: PlaceAnims, base: string) {
  const g = new THREE.Group()
  const frame = mat('#ffffff', { rough: 0.5 })
  for (const s of [-1, 1]) {
    const cloth = mat(s < 0 ? '#5aa9e6' : '#ff8fb8', { rough: 0.8 })
    const bed = group(
      part(roundBox(1.4, 0.07, 0.6, 0.03), frame, [0.15, 0.27, 0]),
      part(roundBox(1.36, 0.04, 0.54, 0.02), cloth, [0.15, 0.32, 0]),
      // 등받이 (서쪽 머리 쪽이 들려 있다)
      part(roundBox(0.62, 0.07, 0.6, 0.03), frame, [-0.78, 0.43, 0], { rot: [0, 0, -0.5] }),
      part(roundBox(0.58, 0.04, 0.54, 0.02), cloth, [-0.76, 0.47, 0], { rot: [0, 0, -0.5] }),
      ...[[-0.45, -0.25], [-0.45, 0.25], [0.75, -0.25], [0.75, 0.25]].map(([x, z]) => part(cyl(0.025, 0.025, 0.26, 6), frame, [x, 0.13, z])),
    )
    bed.position.z = s * 0.62
    g.add(bed)
  }
  // 둘 사이 큰 파라솔 + 수건 + 주스
  g.add(part(cyl(0.03, 0.03, 2.4, 8), frame, [-0.45, 1.2, 0]))
  const canopy = umbrella(a, 1.5, 0.5, ['#ff5a4f', '#ffffff', '#ffd94a', '#ffffff'], 12)
  canopy.position.set(-0.45, 2.45, 0)
  canopy.rotation.z = -0.12
  canopy.name = 'canopy'
  a.fades.set(base, canopy)
  g.add(canopy)
  g.add(part(cyl(0.18, 0.18, 0.04, 16), mat('#ffffff'), [0.95, 0.4, 0]))
  g.add(part(cyl(0.03, 0.03, 0.4, 6), mat('#ffffff'), [0.95, 0.2, 0]))
  g.add(part(cyl(0.05, 0.04, 0.12, 12), mat('#ff8a3d', { rough: 0.3 }), [0.95, 0.48, 0.05]))
  return g
}

export function beachBall(a: PlaceAnims, base: string) {
  const tex = canvasTexture(256, 128, (ctx) => {
    const cs = ['#ff5a4f', '#ffffff', '#ffd94a', '#ffffff', '#5aa9e6', '#ffffff']
    cs.forEach((c, i) => {
      ctx.fillStyle = c
      ctx.fillRect((i * 256) / cs.length, 0, 256 / cs.length + 1, 128)
    })
  })
  a.owned.push(tex)
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 })
  a.owned.push(m)
  const ball = part(sphere(0.28, 24, 16), m, [0, 0.28, 0], { name: 'ball' })
  const holder = new THREE.Group()
  holder.name = 'ballHolder'
  holder.add(ball)
  a.balls.set(base, holder)
  return holder
}

export function sandCastle() {
  const sand = mat('#ecd39b', { rough: 1 })
  const sandD = mat('#dfc287', { rough: 1 })
  const g = group(
    part(roundBox(0.9, 0.22, 0.9, 0.06), sandD, [0, 0.11, 0]),
    part(box(0.56, 0.32, 0.56), sand, [0, 0.38, 0]),
    part(cyl(0.12, 0.14, 0.62, 12), sand, [0, 0.62, 0]),
    part(cone(0.15, 0.22, 12), sandD, [0, 1.04, 0]),
  )
  for (const [x, z] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) {
    g.add(part(cyl(0.1, 0.11, 0.44, 10), sand, [x, 0.4, z]))
    for (let k = 0; k < 4; k++) g.add(part(box(0.05, 0.06, 0.05), sand, [x + Math.cos(k * 1.57) * 0.07, 0.65, z + Math.sin(k * 1.57) * 0.07]))
  }
  g.add(part(cyl(0.006, 0.006, 0.3, 4), mat('#8a5a38'), [0, 1.25, 0]))
  g.add(part(box(0.16, 0.1, 0.01), mat('#ff5a4f'), [0.08, 1.33, 0]))
  // 양동이 · 삽
  g.add(part(cyl(0.11, 0.08, 0.18, 14), mat('#5aa9e6', { rough: 0.5 }), [0.62, 0.09, 0.2]))
  g.add(part(roundBox(0.06, 0.03, 0.32, 0.01), mat('#ff8a3d', { rough: 0.5 }), [0.55, 0.03, -0.3], { rot: [0, 0.5, 0] }))
  return g
}

export function shells() {
  const g = new THREE.Group()
  // 가리비 · 소라 · 불가사리 · 조약돌
  g.add(part(sphere(0.12, 14, 8, ), mat('#ffc0cb', { rough: 0.5 }), [0, 0.02, 0], { scale: [1, 0.25, 0.85] }))
  for (let k = -2; k <= 2; k++) g.add(part(box(0.012, 0.012, 0.18), mat('#ff9fb4'), [k * 0.04, 0.045, 0], { rot: [0, k * 0.25, 0], shadow: false }))
  g.add(part(cone(0.06, 0.18, 10), mat('#f3e1c4', { rough: 0.4 }), [0.25, 0.05, 0.18], { rot: [0, 0, Math.PI / 2] }))
  const star = new THREE.Group()
  for (let k = 0; k < 5; k++) star.add(part(cone(0.035, 0.14, 6), mat('#ff8a3d', { rough: 0.6 }), [Math.cos((k * Math.PI * 2) / 5) * 0.07, 0.02, Math.sin((k * Math.PI * 2) / 5) * 0.07], { rot: [Math.PI / 2, 0, -(k * Math.PI * 2) / 5 + Math.PI / 2] }))
  star.position.set(-0.24, 0, -0.14)
  star.rotation.y = 0.4
  g.add(star)
  for (const [x, z, c] of [[0.1, -0.24, '#c9c3ba'], [-0.1, 0.24, '#e7e1d6']] as const) g.add(part(sphere(0.05, 10, 8), mat(c, { rough: 0.6 }), [x, 0.02, z], { scale: [1, 0.55, 1] }))
  return g
}

/** 물놀이 자리: 물 위에 떠 있는 튜브 (출렁인다) */
export function tube(a: PlaceAnims) {
  const holder = new THREE.Group()
  holder.name = 'tube'
  // 빨강·하양 네 칸씩: 색마다 한 덩어리
  const ring = new THREE.Group()
  for (const [c, off] of [['#ff5a4f', 0], ['#ffffff', 1]] as const) {
    const geos = [0, 1, 2, 3].map((k) => {
      const t = new THREE.TorusGeometry(0.36, 0.13, 10, 8, Math.PI / 4 + 0.01)
      t.rotateZ(((k * 2 + off) * Math.PI) / 4)
      return t
    })
    const merged = mergeGeometries(geos)!
    for (const x of geos) x.dispose()
    merged.rotateX(Math.PI / 2)
    a.owned.push(merged)
    ring.add(part(merged, mat(c, { rough: 0.35 }), [0, 0, 0]))
  }
  ring.position.set(0.95, 0, 0.4)
  holder.add(ring)
  const t0 = Math.random() * 10
  a.tick.push((t) => {
    ring.position.y = SEA_Y - holder.position.y + 0.08 + Math.sin(t * 1.6 + t0) * 0.04
    ring.rotation.z = Math.sin(t * 1.1 + t0) * 0.08
  })
  return holder
}

export function fireworkBox(a: PlaceAnims) {
  const tex = signTex(a, 128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#2b2233'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ffd94a'
    ctx.font = `700 26px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fillFit(ctx, '불꽃놀이', w / 2, h / 2 + 2, w - 24)
  })
  const g = group(
    part(roundBox(0.55, 0.32, 0.45, 0.03), mat('#c98f5a', { rough: 0.9 }), [0, 0.16, 0]),
    texMesh(a, new THREE.PlaneGeometry(0.42, 0.21), tex, [0, 0.18, 0.231]),
  )
  ;['#ff5a4f', '#ffd94a', '#5aa9e6', '#59c26b', '#ff8fb8', '#b48cff'].forEach((c, i) => {
    const x = ((i % 3) - 1) * 0.14
    const z = (Math.floor(i / 3) - 0.5) * 0.16
    g.add(part(cyl(0.045, 0.045, 0.32, 10), mat(c, { rough: 0.5 }), [x, 0.4, z]))
    g.add(part(cyl(0.005, 0.005, 0.08, 4), mat('#2b2233'), [x, 0.6, z]))
  })
  return g
}

/** 안전요원 망루: 높은 의자가 바다(+x)를 본다, 사다리는 뒤(-x) */
export function lifeguardTower() {
  const white = mat('#ffffff', { rough: 0.6 })
  const red = mat('#e8402a', { rough: 0.6 })
  const g = new THREE.Group()
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) g.add(part(box(0.1, 1.5, 0.1), white, [x * 0.85, 0.75, z * 0.85], { rot: [z * 0.12, 0, -x * 0.12] }))
  g.add(part(roundBox(1.3, 0.1, 1.3, 0.03), white, [0, 1.5, 0]))
  // 의자
  g.add(part(roundBox(0.5, 0.08, 0.55, 0.03), red, [0, 1.7, 0]))
  g.add(part(roundBox(0.08, 0.6, 0.55, 0.03), red, [-0.27, 2.0, 0], { rot: [0, 0, 0.12] }))
  for (const z of [-0.25, 0.25]) g.add(part(box(0.5, 0.06, 0.06), white, [0, 1.9, z]))
  for (const [x, z] of [[-0.2, -0.22], [0.2, -0.22], [-0.2, 0.22], [0.2, 0.22]]) g.add(part(box(0.05, 0.2, 0.05), white, [x, 1.6, z]))
  // 사다리 (뒤)
  for (const z of [-0.25, 0.25]) g.add(part(box(0.06, 1.7, 0.06), white, [-0.95, 0.75, z], { rot: [0, 0, -0.35] }))
  for (let k = 0; k < 5; k++) g.add(part(box(0.06, 0.04, 0.5), white, [-1.15 + k * 0.1, 0.25 + k * 0.28, 0]))
  // 깃발
  g.add(part(cyl(0.02, 0.02, 1.2, 6), white, [0.55, 2.1, -0.55]))
  g.add(part(box(0.02, 0.3, 0.45), red, [0.55, 2.55, -0.32]))
  return g
}

/** 방파제 낚시 자리: 낚싯대가 바다(+z) 쪽으로 뻗고 찌가 떠 있다 */
export function fishingSpot(a: PlaceAnims) {
  const g = new THREE.Group()
  const rod = new THREE.Group()
  rod.add(part(cyl(0.012, 0.022, 2.4, 6), mat('#2b2233', { rough: 0.4 }), [0, 1.2, 0]))
  rod.add(part(cyl(0.04, 0.04, 0.08, 10), mat('#c9cbd6', { metal: 0.6, rough: 0.3 }), [0.04, 0.35, 0], { rot: [0, 0, Math.PI / 2] }))
  rod.position.set(0.35, 0.05, -0.15)
  rod.rotation.x = 0.95
  g.add(rod)
  // 낚싯줄 + 찌
  const tipZ = -0.15 + Math.sin(0.95) * 2.4
  const tipY = 0.05 + Math.cos(0.95) * 2.4
  const lineLen = tipY + PIER_Y - SEA_Y
  g.add(part(cyl(0.003, 0.003, lineLen, 3), mat('#ffffff'), [0.35, tipY - lineLen / 2, tipZ], { shadow: false }))
  const bobber = part(sphere(0.05, 10, 8), mat('#ff3b30', { rough: 0.4 }), [0.35, SEA_Y - PIER_Y + 0.03, tipZ], { name: 'bobber' })
  g.add(bobber)
  const t0 = Math.random() * 10
  a.tick.push((t) => {
    bobber.position.y = SEA_Y - PIER_Y + 0.03 + Math.sin(t * 2.2 + t0) * 0.025
  })
  // 양동이 · 작은 의자
  g.add(part(cyl(0.13, 0.1, 0.22, 14), mat('#5aa9e6', { rough: 0.5 }), [-0.45, 0.11, -0.25]))
  g.add(part(torus(0.12, 0.008, Math.PI), mat('#3b3646'), [-0.45, 0.22, -0.25]))
  return g
}

export function boat(a: PlaceAnims) {
  const g = new THREE.Group()
  g.name = 'boat'
  const hull = part(sphere(1, 20, 12, ), mat('#ffffff', { rough: 0.5 }), [0, 0, 0], { scale: [1.6, 0.45, 0.65] })
  g.add(hull)
  g.add(part(box(3.0, 0.08, 1.2), mat('#3d7fd6', { rough: 0.5 }), [0, 0.06, 0]))
  g.add(part(roundBox(0.9, 0.6, 0.8, 0.06), mat('#ffffff'), [-0.3, 0.38, 0]))
  g.add(part(box(0.7, 0.22, 0.82), mat('#9fdcff', { rough: 0.1 }), [-0.3, 0.52, 0]))
  g.add(part(cyl(0.03, 0.03, 1.4, 6), mat('#3b3646'), [0.4, 0.8, 0]))
  g.add(part(box(0.3, 0.2, 0.02), mat('#ff5a4f'), [0.55, 1.4, 0]))
  const t0 = Math.random() * 10
  a.tick.push((t) => {
    g.position.y = SEA_Y + 0.12 + Math.sin(t * 1.2 + t0) * 0.08
    g.rotation.z = Math.sin(t * 0.9 + t0) * 0.06
    g.rotation.x = Math.sin(t * 1.3 + t0) * 0.04
  })
  return g
}

export function buoy(a: PlaceAnims) {
  const g = group(part(sphere(0.22, 14, 10), mat('#ff8a3d', { rough: 0.4 }), [0, 0, 0]), part(cyl(0.02, 0.02, 0.3, 6), mat('#ffffff'), [0, 0.3, 0]))
  g.name = 'buoy'
  const t0 = Math.random() * 10
  a.tick.push((t) => {
    g.position.y = SEA_Y + 0.08 + Math.sin(t * 1.5 + t0) * 0.06
  })
  return g
}

export function bollard() {
  return group(
    part(cyl(0.12, 0.14, 0.75, 14), mat('#e7e4dd', { rough: 0.8 }), [0, 0.375, 0]),
    part(cyl(0.125, 0.125, 0.12, 14), mat('#ffd94a', { rough: 0.6 }), [0, 0.55, 0]),
    part(sphere(0.12, 12, 8), mat('#e7e4dd'), [0, 0.75, 0], { scale: [1, 0.5, 1] }),
  )
}

export function beachSign(a: PlaceAnims) {
  const tex = signTex(a, 512, 192, (ctx, w, h) => {
    ctx.fillStyle = '#5aa9e6'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 6
    ctx.strokeRect(10, 10, w - 20, h - 20)
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 54px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fillFit(ctx, '방들이 해수욕장', w / 2, h / 2 - 18, w - 24)
    ctx.font = `400 30px ${FONT}`
    fillFit(ctx, '→ 바다 · 방파제 · 등대', w / 2, h / 2 + 42, w - 24)
  })
  // 기둥은 판 뒤(-z)에 세워 글씨를 가리지 않는다
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })
  a.owned.push(face)
  const edge = mat('#3d7fd6', { rough: 0.6 })
  return group(
    part(cyl(0.06, 0.07, 2.25, 8), mat('#8a5a38'), [-0.85, 1.12, -0.1]),
    part(cyl(0.06, 0.07, 2.25, 8), mat('#8a5a38'), [0.85, 1.12, -0.1]),
    part(box(2.24, 0.86, 0.08), edge, [0, 1.85, -0.02]),
    part(new THREE.PlaneGeometry(2.2, 0.82), face, [0, 1.85, 0.025], { shadow: false }),
  )
}

/** 갈매기 한 마리: 유선형 몸통 · 두 마디 날개(끝은 검정) · 부채 꼬리 · 노란 부리. 앞은 +z */
function gull(a: PlaceAnims, mats: { white: THREE.Material; grey: THREE.Material; black: THREE.Material; beak: THREE.Material; eye: THREE.Material }) {
  const b = new THREE.Group()
  // 몸통: 꼬리 쪽이 가늘고 가슴이 통통한 물방울 (y축으로 돌려 깎고 눕힌다)
  const prof = [[0, -0.46], [0.035, -0.4], [0.075, -0.26], [0.11, -0.1], [0.125, 0.04], [0.115, 0.15], [0.085, 0.24], [0.04, 0.29], [0, 0.3]].map(([r, y]) => new THREE.Vector2(r, y))
  const bodyGeo = new THREE.LatheGeometry(prof, 14)
  bodyGeo.rotateX(Math.PI / 2)
  bodyGeo.scale(1, 0.85, 1)
  a.owned.push(bodyGeo)
  b.add(new THREE.Mesh(bodyGeo, mats.white))
  // 등은 회색 (날개 사이)
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.grey)
  back.scale.set(0.9, 0.35, 2.2)
  back.position.set(0, 0.035, -0.06)
  a.owned.push(back.geometry)
  b.add(back)
  // 머리 · 눈 · 부리
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), mats.white)
  head.position.set(0, 0.07, 0.3)
  a.owned.push(head.geometry)
  b.add(head)
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), mats.eye)
    e.position.set(s * 0.062, 0.1, 0.34)
    a.owned.push(e.geometry)
    b.add(e)
  }
  const beakGeo = new THREE.ConeGeometry(0.026, 0.13, 8)
  beakGeo.rotateX(Math.PI / 2)
  a.owned.push(beakGeo)
  const beak = new THREE.Mesh(beakGeo, mats.beak)
  beak.position.set(0, 0.055, 0.43)
  beak.rotation.x = 0.12
  b.add(beak)
  // 부채 꼬리
  const tail = new THREE.Shape()
  tail.moveTo(-0.03, 0)
  tail.lineTo(-0.1, -0.16)
  tail.quadraticCurveTo(0, -0.2, 0.1, -0.16)
  tail.lineTo(0.03, 0)
  const tailGeo = new THREE.ShapeGeometry(tail)
  tailGeo.rotateX(Math.PI / 2)
  a.owned.push(tailGeo)
  const tailM = new THREE.Mesh(tailGeo, mats.white)
  tailM.position.set(0, 0.0, -0.4)
  b.add(tailM)
  // 날개: 안쪽 마디(몸에 붙은 넓은 판) + 바깥 마디(끝이 뾰족, 검은 끝)
  const flat = (pts: [number, number][]) => {
    const sh = new THREE.Shape()
    sh.moveTo(pts[0][0], pts[0][1])
    for (const [x, z] of pts.slice(1)) sh.lineTo(x, z)
    const g = new THREE.ShapeGeometry(sh)
    g.rotateX(Math.PI / 2)
    a.owned.push(g)
    return g
  }
  // (x: 몸에서 바깥, z: 앞이 +) — 앞가장자리는 둥글게 휘고 뒤는 곧게
  const innerGeo = flat([[0, 0.12], [0.2, 0.13], [0.4, 0.1], [0.4, -0.1], [0.2, -0.14], [0, -0.14]])
  const outerGeo = flat([[0, 0.1], [0.2, 0.08], [0.36, 0.02], [0.3, -0.04], [0.14, -0.08], [0, -0.1]])
  const tipGeo = flat([[0.24, 0.055], [0.36, 0.02], [0.3, -0.04], [0.2, -0.065]])
  const wings = [-1, 1].map((side) => {
    const root = new THREE.Group()
    root.position.set(side * 0.07, 0.04, 0.02)
    root.scale.x = side
    const inner = new THREE.Mesh(innerGeo, mats.grey)
    root.add(inner)
    const elbow = new THREE.Group()
    elbow.position.x = 0.4
    elbow.add(new THREE.Mesh(outerGeo, mats.grey))
    const tip = new THREE.Mesh(tipGeo, mats.black)
    tip.position.y = 0.002
    elbow.add(tip)
    root.add(elbow)
    b.add(root)
    return { root, elbow, side }
  })
  b.traverse((n) => {
    if ((n as THREE.Mesh).isMesh) n.castShadow = false
  })
  b.scale.setScalar(1.15)
  return { b, wings }
}

/** 갈매기 셋이 바닷가 위를 빙빙 돈다: 대부분 활공하다가 가끔 날갯짓 */
export function gulls(z: Zones, a: PlaceAnims) {
  const g = new THREE.Group()
  g.name = 'gulls'
  const side = THREE.DoubleSide
  const mk = (color: string, rough = 0.7) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, side })
    a.owned.push(m)
    return m
  }
  const mats = { white: mk('#ffffff'), grey: mk('#b9c1cc'), black: mk('#2b2b33'), beak: mk('#ffc23a', 0.4), eye: mk('#1b1b22', 0.3) }
  const birds = [0, 1, 2].map((i) => {
    const q = gull(a, mats)
    g.add(q.b)
    return { ...q, r: 6 + i * 2.4, h: 6.2 + i * 0.9, sp: 0.32 + i * 0.06, ph: i * 2.1 }
  })
  const cx = z.he + 17
  a.tick.push((t) => {
    for (const q of birds) {
      const an = t * q.sp + q.ph
      q.b.position.set(cx + Math.cos(an) * q.r, q.h + Math.sin(t * 0.7 + q.ph) * 0.35, 2 + Math.sin(an) * q.r * 0.6)
      // 원을 도는 방향으로 머리를 두고, 안쪽으로 살짝 기운다
      q.b.rotation.set(0, Math.atan2(-Math.sin(an), Math.cos(an) * 0.6), 0.22, 'YXZ')
      // 6초 중 1.6초만 날갯짓, 나머지는 날개를 살짝 올린 채 활공
      const cyc = (t + q.ph * 3) % 6
      const flap = cyc < 1.6 ? Math.sin(cyc * 9) : 0
      const lift = 0.1 + Math.sin(t * 1.3 + q.ph) * 0.04
      for (const w of q.wings) {
        w.root.rotation.z = (lift + flap * 0.55) * w.side
        w.elbow.rotation.z = -(flap * 0.35 + 0.08) * (1)
      }
    }
  })
  return g
}

/** 놓인 높이: 장소 소품은 그 자리 땅 높이에 선다 */
export const propY = (z: Zones, p: Prop) => (p.kind === 'buoy' || p.kind === 'boat' ? 0 : groundY(z, p.x, p.z))

/** 노점 사장님 미니미: 붕어빵 사장님(빨간 비니·앞치마 색) · 포차 이모(뽀글머리·주황 조끼) */
export const VENDOR_LOOKS: Record<VendorKind, AvatarLook> = {
  bungeo: { hair: 'short', hairColor: '#3a2a20', skin: '#ffd9c0', eyes: 'smile', top: 'hoodie', topColor: '#e8463c', bottom: 'pants', bottomColor: '#3b3646', hat: 'beanie', hatColor: '#c0392b' },
  pocha: { hair: 'curly', hairColor: '#4a3328', skin: '#ffe0cc', eyes: 'smile', top: 'tee', topColor: '#ff8a3d', bottom: 'pants', bottomColor: '#2b2233', hat: 'none', hatColor: '#ff5fa2' },
}
