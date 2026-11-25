/**
 * 3D 공통 도구: 재질(색마다 하나씩 재사용), 둥근 상자, 그림자 설정, 캔버스 텍스처.
 * 전체 톤은 "말랑한 장난감 디오라마": 무광 재질 + 둥근 모서리 + 부드러운 그림자.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const matCache = new Map<string, THREE.MeshStandardMaterial>()

/** 색 하나 = 재질 하나 (같은 색은 같이 쓴다). rough가 낮을수록 반들반들 */
export function mat(color: string, opts: { rough?: number; metal?: number; emissive?: string; glow?: number; opacity?: number } = {}) {
  const key = `${color}|${opts.rough ?? 0.78}|${opts.metal ?? 0}|${opts.emissive ?? ''}|${opts.glow ?? 0}|${opts.opacity ?? 1}`
  let m = matCache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.78,
      metalness: opts.metal ?? 0,
      emissive: opts.emissive ?? '#000000',
      emissiveIntensity: opts.glow ?? 0,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
    })
    matCache.set(key, m)
  }
  return m
}

const geoCache = new Map<string, THREE.BufferGeometry>()
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key)
  if (!g) geoCache.set(key, (g = make()))
  return g as T
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

export const roundBox = (w: number, h: number, d: number, r = 0.06, detail = 3) =>
  geo(`rb${r3(w)}:${r3(h)}:${r3(d)}:${r3(r)}:${detail}`, () => new RoundedBoxGeometry(w, h, d, detail, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)))
export const box = (w: number, h: number, d: number) => geo(`b${r3(w)}:${r3(h)}:${r3(d)}`, () => new THREE.BoxGeometry(w, h, d))
export const sphere = (r: number, ws = 24, hs = 16) => geo(`s${r3(r)}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs))
export const cyl = (rt: number, rb: number, h: number, seg = 24) =>
  geo(`c${r3(rt)}:${r3(rb)}:${r3(h)}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg))
export const capsule = (r: number, len: number) => geo(`cap${r3(r)}:${r3(len)}`, () => new THREE.CapsuleGeometry(r, len, 6, 16))
export const torus = (r: number, tube: number, arc = Math.PI * 2) =>
  geo(`t${r3(r)}:${r3(tube)}:${r3(arc)}`, () => new THREE.TorusGeometry(r, tube, 10, 28, arc))
export const cone = (r: number, h: number, seg = 24) => geo(`co${r3(r)}:${r3(h)}:${seg}`, () => new THREE.ConeGeometry(r, h, seg))

/** 메시 하나 만들고 자리 잡기 */
export function part(
  g: THREE.BufferGeometry,
  m: THREE.Material,
  at: [number, number, number] = [0, 0, 0],
  opts: { rot?: [number, number, number]; scale?: [number, number, number] | number; shadow?: boolean; name?: string } = {},
) {
  const mesh = new THREE.Mesh(g, m)
  mesh.position.set(...at)
  if (opts.rot) mesh.rotation.set(...opts.rot)
  if (opts.scale !== undefined) {
    if (typeof opts.scale === 'number') mesh.scale.setScalar(opts.scale)
    else mesh.scale.set(...opts.scale)
  }
  mesh.castShadow = opts.shadow !== false
  mesh.receiveShadow = true
  if (opts.name) mesh.name = opts.name
  return mesh
}

export function group(...children: THREE.Object3D[]) {
  const g = new THREE.Group()
  for (const c of children) g.add(c)
  return g
}

/** 색을 밝게(+) 어둡게(-) */
export function tint(hex: string, amt: number) {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)))
  return `#${c.getHexString()}`
}

/** 그 안의 모든 메시에 그림자 설정 */
export function shadows(o: THREE.Object3D, cast = true, receive = true) {
  o.traverse((n) => {
    if ((n as THREE.Mesh).isMesh) {
      n.castShadow = cast
      n.receiveShadow = receive
    }
  })
  return o
}

/** 캔버스에 그려서 텍스처로 */
/**
 * 글씨가 maxW보다 넓으면 글자 크기를 줄여 그린다 (간판·팻말 글씨가 판 밖으로 잘리지 않게).
 * ctx.font에 이미 'NNpx'가 들어 있어야 한다.
 */
export function fillFit(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number) {
  const w = ctx.measureText(text).width
  if (w > maxW) {
    const font = ctx.font
    ctx.font = font.replace(/(\d+(?:\.\d+)?)px/, (_, px: string) => `${Math.max(6, Math.floor((Number(px) * maxW) / w))}px`)
    ctx.fillText(text, x, y)
    ctx.font = font
  } else ctx.fillText(text, x, y)
}

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  draw(ctx)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(...repeat)
  }
  return t
}

/** 메시들이 쓰는 텍스처·재질 중 캐시 밖에서 만든 것만 치운다 */
export function disposeTree(o: THREE.Object3D) {
  const cached = new Set<THREE.Material>(matCache.values())
  const geos = new Set<THREE.BufferGeometry>(geoCache.values())
  o.traverse((n) => {
    const m = n as THREE.Mesh
    if (!m.isMesh && !(n as THREE.Sprite).isSprite) return
    if (m.geometry && !geos.has(m.geometry)) m.geometry.dispose()
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    for (const x of mats) {
      if (!x || cached.has(x as THREE.MeshStandardMaterial)) continue
      const mm = x as THREE.MeshStandardMaterial
      mm.map?.dispose()
      mm.dispose()
    }
  })
}

let pendingTextures = 0
/** 아직 그림이 안 그려진 SVG 텍스처 수 (첫 화면을 그 뒤에 보여 주려고) */
export const texturesPending = () => pendingTextures

/** SVG 문자열 → 텍스처 (방 주인이 꾸민 벽·바닥을 그대로 입힌다) */
export function svgTexture(svg: string, w: number, h: number, onReady?: () => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  const img = new Image()
  pendingTextures++
  img.onerror = () => {
    pendingTextures--
  }
  img.onload = () => {
    pendingTextures--
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0, w, h)
    t.needsUpdate = true
    onReady?.()
  }
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  return t
}

const FLAG_KEYS = ['house', 'door', 'mail', 'ground', 'yard', 'exit', 'key', 'drop', 'shop'] as const

/**
 * 움직이지 않는 메시들을 하나로 합친다 (그리기 호출을 확 줄인다).
 * 색만 다른 공용 재질(mat)끼리는 색을 꼭짓점에 칠해서 한 덩어리로 (색이 많아도 그리기 1번),
 * 그림이 붙었거나 밤낮으로 바뀌는 재질(캐시 밖)은 재질마다 따로 합친다.
 * 누를 수 있는 표시(userData: 집·문·우편함 …)가 같은 것끼리만 합쳐서 누르기는 그대로 된다.
 * 이름이 있는 메시(화면·전구·깃발처럼 따로 바꾸는 것)와 userData.keep은 그대로 둔다.
 */
export function bakeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const cached = new Set<THREE.Material>(matCache.values())
  type Bucket = { mat: THREE.Material; tinted: boolean; cast: boolean; data: Record<string, unknown>; geos: THREE.BufferGeometry[] }
  const buckets = new Map<string, Bucket>()
  const done: THREE.Mesh[] = []
  root.traverse((n) => {
    const m = n as THREE.Mesh
    if (!m.isMesh || m.name || m.userData.keep || Array.isArray(m.material) || !m.visible) return
    let hidden = false
    for (let p: THREE.Object3D | null = m.parent; p && p !== root; p = p.parent) if (!p.visible || p.name || p.userData.keep) hidden = true
    if (hidden) return
    const data: Record<string, unknown> = {}
    for (const k of FLAG_KEYS) if (m.userData[k] !== undefined) data[k] = m.userData[k]
    const sm = m.material as THREE.MeshStandardMaterial
    // 공용 재질이고 그림이 없으면 색은 꼭짓점으로 (나머지 성질이 같은 것끼리 한 덩어리)
    const tinted = cached.has(sm) && sm.isMeshStandardMaterial && !sm.map
    const matKey = tinted
      ? `t|${sm.roughness}|${sm.metalness}|${sm.emissive.getHexString()}|${sm.emissiveIntensity}|${sm.transparent}|${sm.opacity}|${sm.side}`
      : sm.uuid
    const key = `${matKey}|${m.castShadow}|${JSON.stringify(data)}`
    let b = buckets.get(key)
    if (!b) buckets.set(key, (b = { mat: sm, tinted, cast: m.castShadow, data, geos: [] }))
    // clone()은 RoundedBoxGeometry 같은 걸 생성자부터 다시 만들어서 느리다 → 빈 BufferGeometry에 복사
    const g = m.geometry.index ? m.geometry.toNonIndexed() : new THREE.BufferGeometry().copy(m.geometry)
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name)
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    if (!g.attributes.normal) g.computeVertexNormals()
    if (tinted) {
      const n3 = g.attributes.position.count
      const col = new Float32Array(n3 * 3)
      for (let i = 0; i < n3; i++) col.set([sm.color.r, sm.color.g, sm.color.b], i * 3)
      g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    }
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))
    b.geos.push(g)
    done.push(m)
  })
  for (const m of done) m.parent?.remove(m)
  for (const b of buckets.values()) {
    // 조각이 하나뿐이면 원래 재질 그대로 (꼭짓점 색 없이)
    if (b.tinted && b.geos.length === 1) b.geos[0].deleteAttribute('color')
    const merged = mergeGeometries(b.geos)
    for (const g of b.geos) g.dispose()
    if (!merged) continue
    let material = b.mat
    if (b.tinted && b.geos.length > 1) {
      const src = b.mat as THREE.MeshStandardMaterial
      const t = src.clone()
      t.color.set('#ffffff')
      t.vertexColors = true
      material = t
    }
    const mesh = new THREE.Mesh(merged, material)
    mesh.castShadow = b.cast
    mesh.receiveShadow = true
    Object.assign(mesh.userData, b.data)
    root.add(mesh)
  }
}
