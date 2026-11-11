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

export const roundBox = (w: number, h: number, d: number, r = 0.06) =>
  geo(`rb${r3(w)}:${r3(h)}:${r3(d)}:${r3(r)}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)))
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

/** SVG 문자열 → 텍스처 (방 주인이 꾸민 벽·바닥을 그대로 입힌다) */
export function svgTexture(svg: string, w: number, h: number, onReady?: () => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  const img = new Image()
  img.onload = () => {
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0, w, h)
    t.needsUpdate = true
    onReady?.()
  }
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  return t
}

const FLAG_KEYS = ['house', 'door', 'mail', 'ground', 'yard', 'exit', 'key', 'drop'] as const

/**
 * 움직이지 않는 메시들을 재질별로 하나로 합친다 (그리기 호출을 확 줄인다).
 * 누를 수 있는 표시(userData: 집·문·우편함 …)가 같은 것끼리만 합쳐서 누르기는 그대로 된다.
 * 이름이 있는 메시(화면·전구·깃발처럼 따로 바꾸는 것)와 userData.keep은 그대로 둔다.
 */
export function bakeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; data: Record<string, unknown>; geos: THREE.BufferGeometry[] }>()
  const done: THREE.Mesh[] = []
  root.traverse((n) => {
    const m = n as THREE.Mesh
    if (!m.isMesh || m.name || m.userData.keep || Array.isArray(m.material) || !m.visible) return
    let hidden = false
    for (let p: THREE.Object3D | null = m.parent; p && p !== root; p = p.parent) if (!p.visible || p.name || p.userData.keep) hidden = true
    if (hidden) return
    const data: Record<string, unknown> = {}
    for (const k of FLAG_KEYS) if (m.userData[k] !== undefined) data[k] = m.userData[k]
    const key = `${m.material.uuid}|${m.castShadow}|${JSON.stringify(data)}`
    let b = buckets.get(key)
    if (!b) buckets.set(key, (b = { mat: m.material, cast: m.castShadow, data, geos: [] }))
    // clone()은 RoundedBoxGeometry 같은 걸 생성자부터 다시 만들어서 느리다 → 빈 BufferGeometry에 복사
    const g = m.geometry.index ? m.geometry.toNonIndexed() : new THREE.BufferGeometry().copy(m.geometry)
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name)
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    if (!g.attributes.normal) g.computeVertexNormals()
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))
    b.geos.push(g)
    done.push(m)
  })
  for (const m of done) m.parent?.remove(m)
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos)
    for (const g of b.geos) g.dispose()
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, b.mat)
    mesh.castShadow = b.cast
    mesh.receiveShadow = true
    Object.assign(mesh.userData, b.data)
    root.add(mesh)
  }
}
