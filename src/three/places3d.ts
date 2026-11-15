/**
 * 골목 양 끝 동네 장소 3D: 편의점 건물 · 파라솔 테이블 · 자판기 · 포장마차 · 뒷산(땅·소나무·정자·망원경·정상석·약수터·운동기구)
 * · 바닷가(모래·바다·파도·방파제·등대·선베드·비치볼·모래성·조개·튜브·불꽃놀이 상자·망루·낚싯대·배·부표·갈매기).
 * 원점은 바닥 가운데, 앞면은 +z (lib/town.ts 자리 정의와 같은 기준).
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CVS_DOOR_X } from '../lib/cvs'
import { groundY, HILL_H, PIER_Y, type Prop, SEA_Y, SIDEWALK_N, STORE_D, STORE_FRONT, STORE_W, type Zones } from '../lib/town'
import { box, canvasTexture, capsule, cone, cyl, group, mat, part, roundBox, sphere, tint, torus } from './kit'

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
    ctx.fillText('방들이마트 24', w / 2, h / 2 + 2)
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
    ctx.fillText('오늘의', w / 2, 70)
    ctx.fillText('컵라면', w / 2, 125)
    ctx.fillStyle = '#ff3b5c'
    ctx.font = `700 58px ${FONT}`
    ctx.fillText('2+1', w / 2, 200)
  })
  g.add(texMesh(a, new THREE.PlaneGeometry(1.4, 1.4), ad, [W / 2 + 0.01, 1.7, 1.2], [0, Math.PI / 2, 0]))
  g.position.set(0, 0, STORE_FRONT - D / 2)
  g.traverse((n) => {
    if (n.userData.shop === undefined) n.userData.shop = 'cvs'
  })
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
      ctx.fillText(t, w / 2, h / 2 + 2)
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
    ctx.fillText('방들이 포차', w / 2, h / 2 + 4)
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
    ctx.fillText('↑ 방들이산 정상', w / 2, h / 2 + 2)
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
    for (const [i, t] of ['방', '들', '이', '산'].entries()) ctx.fillText(t, w / 2, 48 + i * 42)
    ctx.font = `400 20px ${FONT}`
    ctx.fillText('해발 52m', w / 2, h - 30)
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
    ctx.fillText('약수터', w / 2, h / 2 + 2)
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

/** 바다: 잔물결 무늬가 흐르고, 물가엔 하얀 파도가 밀려왔다 밀려간다 */
export function sea(z: Zones, a: PlaceAnims) {
  const g = new THREE.Group()
  g.name = 'sea'
  const ripple = canvasTexture(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = '#3fb4d6'
      ctx.fillRect(0, 0, 256, 256)
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 3
      for (let i = 0; i < 40; i++) {
        const x = (i * 71) % 256
        const y = (i * 113) % 256
        ctx.beginPath()
        ctx.arc(x, y, 9 + (i % 4) * 3, Math.PI * 1.15, Math.PI * 1.85)
        ctx.stroke()
      }
    },
    [40, 40],
  )
  a.owned.push(ripple)
  const water = new THREE.MeshStandardMaterial({ color: '#ffffff', map: ripple, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.86 })
  a.owned.push(water)
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), water)
  plane.rotation.x = -Math.PI / 2
  plane.position.set(z.shore + 200, SEA_Y, 0)
  plane.receiveShadow = true
  plane.userData.ground = true
  plane.name = 'water'
  g.add(plane)
  // 물가 파도 두 줄
  // 거품 줄: 가운데가 진하고 가장자리로 갈수록 투명, 군데군데 거품 방울
  const foamTex = canvasTexture(64, 256, (ctx) => {
    for (let x = 0; x < 64; x++) {
      const k = 1 - Math.abs(x - 32) / 32
      ctx.fillStyle = `rgba(255,255,255,${(k * k * 0.9).toFixed(3)})`
      ctx.fillRect(x, 0, 1, 256)
    }
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.arc(8 + ((i * 37) % 48), (i * 53) % 256, 1 + (i % 3), 0, Math.PI * 2)
      ctx.fill()
    }
  }, [1, 20])
  a.owned.push(foamTex)
  const foamMat = new THREE.MeshBasicMaterial({ color: '#ffffff', map: foamTex, transparent: true, opacity: 0.7, depthWrite: false })
  a.owned.push(foamMat)
  const foams: THREE.Mesh[] = []
  for (let k = 0; k < 2; k++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 80, 1, 40), foamMat.clone())
    a.owned.push(f.material as THREE.Material)
    f.rotation.x = -Math.PI / 2
    f.name = 'foam'
    f.renderOrder = 2
    foams.push(f)
    g.add(f)
  }
  const edge = z.shore + 2.0
  a.tick.push((t) => {
    ripple.offset.set((t * 0.004) % 1, (t * 0.002) % 1)
    foams.forEach((f, k) => {
      const ph = (t * 0.22 + k * 0.5) % 1
      const x = edge + 0.6 - Math.sin(ph * Math.PI) * 1.3
      f.position.set(x, SEA_Y + 0.012 + Math.max(0, groundY(z, x, 0) - SEA_Y), 0)
      ;(f.material as THREE.MeshBasicMaterial).opacity = 0.6 * Math.sin(ph * Math.PI)
    })
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
    ctx.fillText('불꽃놀이', w / 2, h / 2 + 2)
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
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 64px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('방들이 해수욕장', w / 2, h / 2 - 14)
    ctx.font = `400 34px ${FONT}`
    ctx.fillText('→ 바다 · 방파제 · 등대', w / 2, h / 2 + 50)
  })
  return group(
    part(cyl(0.06, 0.07, 2.2, 8), mat('#8a5a38'), [-0.9, 1.1, 0]),
    part(cyl(0.06, 0.07, 2.2, 8), mat('#8a5a38'), [0.9, 1.1, 0]),
    texMesh(a, box(2.2, 0.82, 0.08), tex, [0, 1.85, 0]),
  )
}

/** 갈매기 셋이 바닷가 위를 빙빙 돈다 */
export function gulls(z: Zones, a: PlaceAnims) {
  const g = new THREE.Group()
  g.name = 'gulls'
  const white = mat('#ffffff', { rough: 0.6 })
  const grey = mat('#c9cbd6', { rough: 0.6 })
  const birds = [0, 1, 2].map((i) => {
    const b = new THREE.Group()
    b.add(part(sphere(0.16, 12, 8), white, [0, 0, 0], { scale: [1, 0.8, 2], shadow: false }))
    b.add(part(sphere(0.09, 10, 8), white, [0, 0.06, 0.3], { shadow: false }))
    b.add(part(cone(0.03, 0.12, 6), mat('#ffb020'), [0, 0.05, 0.43], { rot: [Math.PI / 2, 0, 0], shadow: false }))
    const wings = [-1, 1].map((s) => {
      const w = new THREE.Group()
      w.add(part(box(0.6, 0.02, 0.22), grey, [s * 0.3, 0, 0], { shadow: false }))
      w.position.x = s * 0.08
      b.add(w)
      return w
    })
    g.add(b)
    return { b, wings, r: 6 + i * 2.2, h: 6 + i * 0.9, sp: 0.35 + i * 0.07, ph: i * 2.1 }
  })
  const cx = z.he + 17
  a.tick.push((t) => {
    for (const q of birds) {
      const an = t * q.sp + q.ph
      q.b.position.set(cx + Math.cos(an) * q.r, q.h + Math.sin(t * 0.8 + q.ph) * 0.4, 2 + Math.sin(an) * q.r * 0.6)
      q.b.rotation.y = -an
      const f = Math.sin(t * 7 + q.ph) * 0.45
      q.wings[0].rotation.z = f
      q.wings[1].rotation.z = -f
    }
  })
  return g
}

/** 놓인 높이: 장소 소품은 그 자리 땅 높이에 선다 */
export const propY = (z: Zones, p: Prop) => (p.kind === 'buoy' || p.kind === 'boat' ? 0 : groundY(z, p.x, p.z))
