/**
 * 게임 캐릭터 미니미 (Kenney Mini Characters, CC0 → public/models/chars/*.glb).
 *
 * - 머리 모양마다 캐릭터 하나 (tools/assets/kenney_chars.py의 PICK).
 * - 색: 캐릭터는 16×4칸 색 팔레트 텍스처를 쓴다. 부위(피부·머리·윗옷·바지)별로 UV를 팔레트 맨 윗줄 빈칸으로 옮겨 두고,
 *   미니미마다 그 칸을 미니미 색으로 칠한 텍스처를 쓴다 (한 칸을 여러 부위가 같이 쓰는 경우가 있어 칸째 칠하면 안 된다).
 * - 동작: 애니메이션 파일 대신 avatar3d와 똑같은 계산(걷기·앉기·눕기·춤·컵 들기)으로 뼈를 직접 돌린다.
 *   Kenney 뼈대엔 무릎·팔꿈치가 없어 그 부분만 빠진다. 팔은 T자세가 기본이라 아래로 내린 각도를 더한다.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { AvatarLook, HairId } from '../art/avatar'
import { OUTFITS } from '../art/poses'
import type { Avatar3D } from './avatar3d'
import { mat, part, roundBox, tint } from './kit'

type Role = 'skin' | 'skinShade' | 'skinLight' | 'hair' | 'hairLight' | 'top' | 'topShade' | 'topLight' | 'bottom'
const ROLES: Role[] = ['skin', 'skinShade', 'skinLight', 'hair', 'hairLight', 'top', 'topShade', 'topLight', 'bottom']
type Bone = 'root' | 'leg-left' | 'leg-right' | 'torso' | 'arm-left' | 'arm-right' | 'head'
/** [메시, 팔레트 줄, 팔레트 칸, 부위, (이 뼈에 붙은 꼭짓점만)] */
type Rule = ['body' | 'head', number, number, Role, Bone[]?]

const ARMS: Bone[] = ['torso', 'arm-left', 'arm-right']
const LEGS: Bone[] = ['leg-left', 'leg-right']

/** 캐릭터별 팔레트 칸 → 부위 (Blender로 앞뒤를 찍어 보고 정했다) */
const RULES: Record<HairId, Rule[]> = {
  bob: [
    ['head', 2, 5, 'skin'],
    ['head', 3, 7, 'hair'],
    ['body', 2, 1, 'skinShade'],
    ['body', 1, 1, 'skin'],
    ['body', 3, 15, 'top', ARMS],
    ['body', 3, 7, 'bottom', LEGS],
  ],
  short: [
    ['head', 2, 1, 'skin'],
    ['head', 3, 7, 'hair'],
    ['body', 2, 1, 'skin'],
    ['body', 2, 5, 'skinLight'],
    ['body', 2, 9, 'top'],
    ['body', 3, 3, 'bottom', ['torso']],
    // 허리띠 자리 (원본 검정 → 옆에서 보면 옆구리에 검은 덩어리)
    ['body', 3, 7, 'bottom', ['torso']],
  ],
  long: [
    ['head', 2, 3, 'hair'],
    ['head', 2, 1, 'hairLight'],
    ['head', 2, 5, 'skin'],
    ['body', 2, 5, 'skin'],
    ['body', 2, 4, 'skin'],
    ['body', 3, 7, 'top'],
    ['body', 3, 1, 'topLight'],
    ['body', 1, 1, 'bottom'],
  ],
  bun: [
    ['head', 2, 1, 'hair'],
    ['head', 3, 1, 'hairLight'],
    ['head', 2, 5, 'skin'],
    ['body', 2, 5, 'skin'],
    ['body', 2, 4, 'skin'],
    ['body', 3, 1, 'top'],
    ['body', 1, 5, 'bottom'],
  ],
  curly: [
    ['head', 3, 7, 'hair'],
    ['head', 2, 3, 'skin'],
    ['body', 2, 3, 'skin'],
    ['body', 2, 1, 'skinShade'],
    ['body', 2, 2, 'skinShade'],
    ['body', 2, 9, 'top'],
    ['body', 1, 1, 'bottom'],
  ],
}

const HAIRS = Object.keys(RULES) as HairId[]
/** 미니미 키 (머리 꼭대기, m). 예전 미니미와 비슷하게 */
const TARGET_H = 1.2
/** 팔레트 텍스처: 512×512, 칸 32×128 */
const TEX = 512
const CW = 32
const CH = 128

interface Template {
  scene: THREE.Object3D
  image: CanvasImageSource
  /** 모델 단위 → m */
  scale: number
  /** 엉덩이 바닥 · 등 두께의 절반 (m) */
  butt: number
  back: number
  /** 머리 뼈 기준 머리통 상자 (얼굴 피부, 귀 포함) · 머리카락까지 포함한 머리 꼭대기 (모델 단위) */
  skull: THREE.Box3
  hairTop: number
  /** 오른팔 뼈 기준 손 위치 (모델 단위) */
  hand: THREE.Vector3
}

const templates = new Map<HairId, Template>()
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

export const avatarModelsReady = () => templates.size > 0
/** 캐릭터 모델을 다 불러오면 한 번 불린다 (그 전에 만든 미니미를 다시 지으라고) */
export function onAvatarModels(cb: () => void) {
  if (avatarModelsReady()) cb()
  else listeners.add(cb)
  return () => listeners.delete(cb)
}

const boneOf = (geo: THREE.BufferGeometry, skel: THREE.Skeleton, i: number) => {
  const si = geo.attributes.skinIndex
  const sw = geo.attributes.skinWeight
  let best = 0
  for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, best)) best = k
  return skel.bones[si.getComponent(i, best)]?.name as Bone
}

/**
 * 원본 얼굴(눈·입·안경·눈화장)을 지운다 → 미니미 눈 설정대로 kenneyFace가 새로 그린다.
 * 얼굴 조각 = 얼굴 앞면에 붙은 작은 덩어리 (같은 자리·같은 칸 꼭짓점끼리 이어 덩어리를 나눈다).
 * 머리카락·피부·귀는 꼭짓점이 40개 넘게 많아서 안 걸린다.
 */
function dropFace(geo: THREE.BufferGeometry, sw: number[], skull: THREE.Box3) {
  const index = geo.index
  if (!index) return
  const pos = geo.attributes.position
  const key = (i: number) => `${sw[i]}|${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let r = k
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(k, r)
    return r
  }
  for (let i = 0; i < pos.count; i++) if (!parent.has(key(i))) parent.set(key(i), key(i))
  for (let t = 0; t < index.count; t += 3) {
    const a = find(key(index.getX(t)))
    for (const q of [1, 2]) {
      const b = find(key(index.getX(t + q)))
      if (a !== b) parent.set(b, a)
    }
  }
  const islands = new Map<string, number[]>()
  for (let i = 0; i < pos.count; i++) {
    const r = find(key(i))
    if (!islands.has(r)) islands.set(r, [])
    islands.get(r)!.push(i)
  }
  const H = skull.max.y - skull.min.y
  const drop = new Set<number>()
  for (const vs of islands.values()) {
    if (vs.length > 30) continue
    const ys = vs.map((i) => pos.getY(i))
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const front = Math.max(...vs.map((i) => pos.getZ(i)))
    if (front >= skull.max.z - 0.01 && cy > skull.min.y + H * 0.1 && cy < skull.min.y + H * 0.65) for (const i of vs) drop.add(i)
  }
  const keep: number[] = []
  for (let t = 0; t < index.count; t += 3) {
    const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)]
    if (!tri.every((i) => drop.has(i))) keep.push(...tri)
  }
  geo.setIndex(keep)
}

function prepare(hair: HairId, gltf: { scene: THREE.Object3D }): Template {
  const scene = gltf.scene
  scene.updateMatrixWorld(true)
  let image: CanvasImageSource | null = null
  const legVerts: number[] = []
  const torsoZ: number[] = []
  const head = new THREE.Box3()
  const skull = new THREE.Box3()
  const handX: number[] = []
  const bones: Partial<Record<Bone, THREE.Bone>> = {}
  scene.traverse((n) => {
    if ((n as THREE.Bone).isBone) bones[n.name as Bone] = n as THREE.Bone
  })
  scene.traverse((n) => {
    const m = n as THREE.SkinnedMesh
    if (!m.isSkinnedMesh) return
    const src = m.material as THREE.MeshStandardMaterial
    if (!image && src.map) image = src.map.image as CanvasImageSource
    const part: 'body' | 'head' = m.name.includes('head') ? 'head' : 'body'
    // UV를 부위 칸(맨 윗줄)으로 옮긴다 (칸 안에서의 위치는 그대로 → 위아래 명암이 남는다)
    const geo = m.geometry.clone()
    const uv = geo.attributes.uv as THREE.BufferAttribute
    const pos = geo.attributes.position
    /** 꼭짓점마다 원래 팔레트 칸 (얼굴 조각 찾기용) */
    const sw: number[] = []
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i) * TEX
      const v = uv.getY(i) * TEX
      const col = Math.min(15, Math.floor(u / CW))
      const row = Math.min(3, Math.floor(v / CH))
      sw.push(row * 16 + col)
      const bone = boneOf(geo, m.skeleton, i)
      const rule = RULES[hair].find(([p, r, c, , only]) => p === part && r === row && c === col && (!only || only.includes(bone)))
      if (rule) {
        const role = ROLES.indexOf(rule[3])
        uv.setXY(i, (role * CW + (u - col * CW)) / TEX, (v - row * CH) / TEX)
      }
      // 크기 재기 (묶인 자세 = 모델 좌표)
      if (bone === 'leg-left' || bone === 'leg-right') legVerts.push(pos.getZ(i))
      if (bone === 'torso') torsoZ.push(pos.getZ(i))
      if (bone === 'arm-right') handX.push(pos.getX(i))
      if (part === 'head') head.expandByPoint(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)))
      // 모자 크기는 머리카락을 뺀 머리통(얼굴 피부)으로 잰다 (똥머리처럼 위로 솟은 머리에 모자가 뜨지 않게)
      if (part === 'head' && rule?.[3] === 'skin') skull.expandByPoint(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)))
    }
    uv.needsUpdate = true
    if (part === 'head') dropFace(geo, sw, skull)
    m.geometry = geo
    m.castShadow = true
    m.receiveShadow = false
  })
  const bbox = new THREE.Box3().setFromObject(scene)
  const scale = TARGET_H / (bbox.max.y - bbox.min.y)
  const half = (a: number[]) => (Math.max(...a) - Math.min(...a)) / 2
  const hipY = bones['leg-left']!.getWorldPosition(new THREE.Vector3()).y
  const headBone = bones.head!.getWorldPosition(new THREE.Vector3())
  const armBone = bones['arm-right']!.getWorldPosition(new THREE.Vector3())
  return {
    scene,
    image: image!,
    scale,
    butt: (hipY - half(legVerts)) * scale,
    back: half(torsoZ) * scale,
    skull: skull.clone().translate(headBone.clone().negate()),
    hairTop: head.max.y - headBone.y,
    hand: new THREE.Vector3((Math.min(...handX) - armBone.x) * 0.82, 0, 0),
  }
}

export function preloadAvatars(base: string = import.meta.env.BASE_URL ?? '/'): Promise<void> {
  if (loading) return loading
  const loader = new GLTFLoader()
  loading = Promise.all(
    HAIRS.map((hair) =>
      loader
        .loadAsync(`${base}models/chars/${hair}.glb`)
        .then((g) => {
          templates.set(hair, prepare(hair, g))
        })
        .catch((e) => console.warn('[avatar] 불러오지 못함', hair, e)),
    ),
  ).then(() => {
    if (!avatarModelsReady()) return
    for (const cb of listeners) cb()
    listeners.clear()
  })
  return loading
}

// ─── 모자 (Kenney 캐릭터처럼 각진 상자에 모서리만 살짝 둥글게) ───

/**
 * 머리 뼈 기준 좌표로 모자를 만든다. 크기는 모두 머리통 상자(W 너비 · H 높이 · D 깊이)에 비례.
 * 머리통 상자는 귀까지 들어가서 너비는 귀를 뺀 만큼(0.8)으로 잡는다.
 */
function kenneyHat(look: AvatarLook, t: Template) {
  const b = t.skull
  const W = (b.max.x - b.min.x) * 0.8
  const H = b.max.y - b.min.y
  const D = b.max.z - b.min.z
  const cx = (b.min.x + b.max.x) / 2
  const cz = (b.min.z + b.max.z) / 2
  const top = b.max.y
  const front = b.max.z
  const c = look.hatColor
  const main = mat(c, { rough: 0.7 })
  const dark = mat(tint(c, -0.16), { rough: 0.7 })
  const g = new THREE.Group()
  const box = (w: number, h: number, d: number, at: [number, number, number], m: THREE.Material, rot?: [number, number, number]) =>
    g.add(part(roundBox(w, h, d, Math.min(w, h, d) * 0.22), m, at, { rot }))
  // 모자 윗면은 머리카락 꼭대기까지 덮는다 (똥머리는 머리통 기준 → 두 개가 모자 위로 귀엽게 나온다)
  const cover = look.hair === 'bun' ? top : Math.max(top, t.hairTop)
  switch (look.hat) {
    case 'cap': {
      // 둥글게 깎은 모자 몸통 + 앞으로 내민 챙 + 꼭지 단추
      const y0 = top - H * 0.26
      const y1 = cover + H * 0.05
      g.add(part(roundBox(W * 1.08, y1 - y0, D * 1.06, (y1 - y0) * 0.45), main, [cx, (y0 + y1) / 2, cz]))
      box(W * 0.86, H * 0.05, D * 0.5, [cx, y0 + H * 0.03, front + D * 0.18], dark, [0.1, 0, 0])
      box(W * 0.14, H * 0.05, W * 0.14, [cx, y1, cz], dark)
      break
    }
    case 'beanie': {
      // 니트 비니: 접은 단 · 몸통 · 위로 좁아지는 꼭대기 · 방울
      const y0 = top - H * 0.42
      const y1 = cover + H * 0.08
      g.add(part(roundBox(W * 1.1, y1 - y0, D * 1.08, W * 0.18), main, [cx, (y0 + y1) / 2, cz]))
      g.add(part(roundBox(W * 0.8, H * 0.12, D * 0.78, H * 0.05), main, [cx, y1 + H * 0.04, cz]))
      g.add(part(roundBox(W * 1.17, H * 0.16, D * 1.15, H * 0.06), dark, [cx, y0 + H * 0.06, cz]))
      // 단에 세로 골 (니트 느낌)
      for (let i = -3; i <= 3; i++) box(W * 0.035, H * 0.14, D * 0.02, [cx + i * W * 0.15, y0 + H * 0.06, cz + D * 0.58], mat(tint(c, -0.28)))
      g.add(part(roundBox(W * 0.28, W * 0.28, W * 0.28, W * 0.12), mat('#ffffff', { rough: 0.95 }), [cx, y1 + H * 0.16, cz]))
      break
    }
    case 'bear': {
      // 곰 모자: 머리 위를 덮는 몸통 + 귀 두 개 (안쪽 분홍)
      const y0 = top - H * 0.34
      const y1 = cover + H * 0.05
      g.add(part(roundBox(W * 1.1, y1 - y0, D * 1.08, (y1 - y0) * 0.4), main, [cx, (y0 + y1) / 2, cz]))
      for (const s of [-1, 1]) {
        g.add(part(roundBox(W * 0.32, W * 0.3, D * 0.24, W * 0.1), main, [cx + s * W * 0.38, y1 + W * 0.06, cz]))
        box(W * 0.17, W * 0.15, D * 0.05, [cx + s * W * 0.38, y1 + W * 0.05, cz + D * 0.13], mat('#ffc7d6'))
      }
      break
    }
    case 'pin': {
      // 앞머리 위 옆쪽에 꽂은 꽃핀 (머리카락 앞면에 붙여 정면에서 보이게): 가운데 노랑 + 꽃잎 4장
      const k = W * 0.14
      const at: [number, number, number] = [cx + W * 0.3, top - H * 0.04, Math.max(front, t.skull.max.z) + k * 0.2]
      box(k, k, k * 0.6, [at[0], at[1], at[2] + k * 0.15], mat('#fff3b0'))
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) box(k, k, k * 0.5, [at[0] + dx * k * 0.85, at[1] + dy * k * 0.85, at[2]], main)
      break
    }
    case 'ribbon': {
      // 정수리 옆 리본: 매듭 + 양쪽 고리 (머리 위에서도 잘 보이게 크게)
      const at: [number, number, number] = [cx + W * 0.2, cover + H * 0.06, cz]
      box(W * 0.16, W * 0.16, W * 0.16, at, dark)
      for (const s of [-1, 1]) box(W * 0.32, W * 0.24, W * 0.12, [at[0] + s * W * 0.22, at[1], at[2]], main, [0, 0, s * 0.35])
      break
    }
  }
  return g
}

// ─── 얼굴 (미니미 눈 설정대로 얼굴 앞면에 붙이는 납작한 조각) ───

const flat = new Map<string, THREE.ShapeGeometry>()
/** 모서리 둥근 네모 (가운데 기준) */
function pill(w: number, h: number, r = Math.min(w, h) / 2) {
  const k = `p${w.toFixed(4)},${h.toFixed(4)},${r.toFixed(4)}`
  let g = flat.get(k)
  if (!g) {
    const s = new THREE.Shape()
    const x = -w / 2
    const y = -h / 2
    s.moveTo(x + r, y)
    s.lineTo(x + w - r, y)
    s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false)
    s.lineTo(x + w, y + h - r)
    s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false)
    s.lineTo(x + r, y + h)
    s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false)
    s.lineTo(x, y + r)
    s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false)
    g = new THREE.ShapeGeometry(s, 6)
    flat.set(k, g)
  }
  return g
}
/** 굵기 있는 호 (웃는 입·웃는 눈). a0→a1 라디안, 끝은 둥글게 */
function arc(r: number, w: number, a0: number, a1: number) {
  const k = `a${r.toFixed(4)},${w.toFixed(4)},${a0.toFixed(3)},${a1.toFixed(3)}`
  let g = flat.get(k)
  if (!g) {
    const s = new THREE.Shape()
    s.absarc(0, 0, r + w / 2, a0, a1, false)
    s.absarc(r * Math.cos(a1), r * Math.sin(a1), w / 2, a1, a1 + Math.PI, false)
    s.absarc(0, 0, r - w / 2, a1, a0, true)
    s.absarc(r * Math.cos(a0), r * Math.sin(a0), w / 2, a0 + Math.PI, a0 + Math.PI * 2, false)
    g = new THREE.ShapeGeometry(s, 10)
    flat.set(k, g)
  }
  return g
}

/**
 * 머리 뼈 기준 좌표의 얼굴. 위치는 원본 Kenney 눈·입 자리 (머리통 상자 비율)에 맞췄다.
 * 눈은 세로로 긴 둥근 눈 + 하이라이트, 볼터치, 작게 웃는 입 → 순하고 귀여운 인상.
 */
function kenneyFace(look: AvatarLook, t: Template) {
  const b = t.skull
  const S = (b.max.x - b.min.x) * 0.7 // 귀를 뺀 얼굴 너비
  const H = b.max.y - b.min.y
  const cx = (b.min.x + b.max.x) / 2
  const z = b.max.z + S * 0.006
  const eyeY = b.min.y + H * 0.45
  const ex = S * 0.24
  const ink = mat('#2a2130', { rough: 0.5 })
  const white = mat('#ffffff', { rough: 0.4 })
  const blush = mat('#ff9fae', { rough: 0.9 })
  const g = new THREE.Group()
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, dz = 0) => g.add(part(geo, m, [cx + x, y, z + dz], { shadow: false }))
  const roundEye = (x: number) => {
    add(pill(S * 0.13, S * 0.19), ink, x, eyeY)
    add(pill(S * 0.05, S * 0.05), white, x + S * 0.025, eyeY + S * 0.045, S * 0.004)
  }
  const happyEye = (x: number) => add(arc(S * 0.065, S * 0.035, Math.PI * 0.15, Math.PI * 0.85), ink, x, eyeY - S * 0.03)
  switch (look.eyes) {
    case 'smile':
      happyEye(-ex)
      happyEye(ex)
      break
    case 'dot':
      for (const s of [-1, 1]) add(pill(S * 0.085, S * 0.1), ink, s * ex, eyeY)
      break
    case 'wink':
      roundEye(-ex)
      happyEye(ex)
      break
    case 'shades': {
      // 선글라스: 렌즈 두 개 + 가운데 다리 (살짝 두께 있게 띄운다)
      const lens = mat('#1d1b26', { rough: 0.25 })
      for (const s of [-1, 1]) add(pill(S * 0.3, S * 0.2, S * 0.07), lens, s * ex, eyeY, S * 0.01)
      add(pill(S * 0.2, S * 0.04), lens, 0, eyeY + S * 0.04, S * 0.01)
      for (const s of [-1, 1]) add(pill(S * 0.06, S * 0.04), white, s * ex - S * 0.07, eyeY + S * 0.04, S * 0.014)
      break
    }
    default:
      roundEye(-ex)
      roundEye(ex)
  }
  for (const s of [-1, 1]) add(pill(S * 0.15, S * 0.075), blush, s * S * 0.36, eyeY - H * 0.15)
  // 작게 웃는 입
  add(arc(S * 0.07, S * 0.032, Math.PI * 1.2, Math.PI * 1.8), ink, 0, b.min.y + H * 0.29)
  return g
}

// ─── 미니미마다 칠한 텍스처 (같은 색 조합은 같이 쓴다) ───
const skins = new Map<string, THREE.MeshStandardMaterial>()
function paintedMaterial(hair: HairId, t: Template, c: Record<Role, string>) {
  const key = `${hair}|${ROLES.map((r) => c[r]).join(',')}`
  let m = skins.get(key)
  if (m) return m
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TEX
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(t.image, 0, 0, TEX, TEX)
  ROLES.forEach((role, i) => {
    // 칸 위는 살짝 밝게, 아래는 어둡게 (원래 팔레트처럼)
    const g = ctx.createLinearGradient(0, 0, 0, CH)
    g.addColorStop(0, tint(c[role], 0.05))
    g.addColorStop(1, tint(c[role], -0.1))
    ctx.fillStyle = g
    ctx.fillRect(i * CW, 0, CW, CH)
  })
  const map = new THREE.CanvasTexture(canvas)
  map.flipY = false
  map.colorSpace = THREE.SRGBColorSpace
  map.magFilter = THREE.NearestFilter
  map.generateMipmaps = false
  map.minFilter = THREE.LinearFilter
  m = new THREE.MeshStandardMaterial({ map, roughness: 0.8 })
  skins.set(key, m)
  return m
}

/**
 * 게임 캐릭터 미니미 하나. 모델을 아직 못 불러왔으면 null (예전 미니미를 쓴다).
 */
export function buildKenneyAvatar(look: AvatarLook, outfit: number): Avatar3D | null {
  const t = templates.get(look.hair) ?? templates.get('short') ?? templates.values().next().value
  if (!t) return null
  const hair = templates.has(look.hair) ? look.hair : 'short'
  const swap = OUTFITS[outfit % OUTFITS.length] ?? {}
  const top = swap.t ?? look.topColor
  const bottom = swap.j ?? look.bottomColor
  const colors: Record<Role, string> = {
    skin: look.skin,
    skinShade: tint(look.skin, -0.06),
    skinLight: tint(look.skin, 0.03),
    hair: look.hairColor,
    hairLight: tint(look.hairColor, 0.1),
    top,
    topShade: tint(top, -0.15),
    topLight: tint(top, 0.25),
    bottom,
  }
  const material = paintedMaterial(hair, t, colors)

  const root = new THREE.Group()
  const model = SkeletonUtils.clone(t.scene)
  model.scale.setScalar(t.scale)
  root.add(model)
  const bones: Partial<Record<Bone, THREE.Bone>> = {}
  model.traverse((n) => {
    if ((n as THREE.Bone).isBone) bones[n.name as Bone] = n as THREE.Bone
    const m = n as THREE.SkinnedMesh
    if (m.isSkinnedMesh) {
      m.material = material
      m.castShadow = true
      m.receiveShadow = false
      // 뼈를 움직여 몸이 처음 자리에서 벗어나도 잘리지 않게
      m.frustumCulled = false
    }
  })
  const rootBone = bones.root!
  const legs = [bones['leg-right']!, bones['leg-left']!]
  const arms = [bones['arm-right']!, bones['arm-left']!]
  const headBone = bones.head!
  const rest = rootBone.position.clone()
  const headRest = headBone.position.clone()
  /** 팔을 T자세에서 아래로 (오른팔은 -x로 뻗어 있다) */
  const ARM_DOWN = [Math.PI / 2, -Math.PI / 2]
  const inv = 1 / t.scale

  // 얼굴: 원본 눈·입은 지웠으니 미니미 눈 설정대로 붙인다
  headBone.add(kenneyFace(look, t))

  // 모자: Kenney 머리통에 맞춰 각지게 만든 모자 (머리 뼈에 붙어 같이 움직인다)
  let hatH = 0
  if (look.hat !== 'none') {
    const h = kenneyHat(look, t)
    headBone.add(h)
    const top = new THREE.Box3().setFromObject(h).max.y
    hatH = Math.max(0, (top - t.hairTop) * t.scale)
  }

  // 오른손: 컵을 쥐여 주는 자리 (팔을 내린 각도만큼 되돌려 컵이 똑바로 선다)
  const grip = new THREE.Group()
  grip.position.copy(t.hand)
  grip.rotation.z = -ARM_DOWN[0]
  arms[0].add(grip)

  const animate: Avatar3D['animate'] = ({ walking, pose, t: time, speed = 1, hold }) => {
    const seated = pose === 'sit' || pose === 'watch' || pose === 'floor' || pose === 'bath'
    // 몸(뿌리 뼈) 위치는 m로 계산해서 모델 단위로 바꾼다
    let bx = 0
    let by = 0
    let bz = 0
    rootBone.rotation.set(0, 0, 0)
    headBone.rotation.set(0, 0, 0)
    headBone.position.copy(headRest)
    const armRot = [new THREE.Euler(0, 0, -0.1), new THREE.Euler(0, 0, 0.1)]
    for (const l of legs) l.rotation.set(0, 0, 0)

    if (walking) {
      const w = time * 9 * speed
      const s = Math.sin(w)
      legs[0].rotation.x = s * 0.55
      legs[1].rotation.x = -s * 0.55
      armRot[0].x = -s * 0.6
      armRot[1].x = s * 0.6
      by = Math.abs(Math.cos(w)) * 0.04
      rootBone.rotation.set(0.05, 0, s * 0.035)
      headBone.rotation.z = -s * 0.03
    } else if (pose === 'dance') {
      const w = time * 7
      by = Math.abs(Math.sin(w)) * 0.08
      rootBone.rotation.set(0, Math.sin(w * 0.5) * 0.5, Math.sin(w) * 0.1)
      legs[0].rotation.x = legs[1].rotation.x = -Math.abs(Math.sin(w)) * 0.2
      armRot[0].set(-2.5 + Math.sin(w) * 0.4, 0, -0.35)
      armRot[1].set(-2.5 - Math.sin(w) * 0.4, 0, 0.35)
      headBone.rotation.z = Math.sin(w) * 0.12
    } else if (pose === 'lie') {
      // 반듯이 누워 이불 속으로: 등이 바닥에 닿고 머리는 베개만큼 들린다
      rootBone.rotation.x = -Math.PI / 2
      // 캐릭터가 두툼해서 이불 위로 손이 나오지 않게 조금 더 내리고 팔은 몸 옆 매트리스 쪽으로
      by = t.back * 0.7 + Math.sin(time * 1.4) * 0.006
      headBone.rotation.x = 0.15 + Math.sin(time * 0.6) * 0.02
      armRot[0].set(0.35, 0, -0.12)
      armRot[1].set(0.35, 0, 0.12)
    } else {
      by = Math.sin(time * 2.2) * 0.006
      headBone.rotation.z = Math.sin(time * 0.9) * 0.04
      armRot[0].z = -0.1 - Math.sin(time * 2.2) * 0.02
      armRot[1].z = 0.1 + Math.sin(time * 2.2) * 0.02
    }

    if (seated) {
      // 엉덩이 바닥이 발밑 높이(0)에 오게 몸을 내리고, 다리는 앞으로 (무릎이 없어 쭉 편다)
      by = -t.butt + Math.sin(time * 2.2) * 0.004
      rootBone.rotation.set(0, 0, 0)
      legs[0].rotation.set(-Math.PI / 2 + 0.06, 0, -0.08)
      legs[1].rotation.set(-Math.PI / 2 + 0.06, 0, 0.08)
      armRot[0].set(-0.7, 0, -0.12)
      armRot[1].set(-0.7, 0, 0.12)
      if (pose === 'watch') headBone.rotation.x = -0.08
      if (pose === 'bath') {
        armRot[0].set(-0.2, 0, -0.9)
        armRot[1].set(-0.2, 0, 0.9)
        headBone.rotation.x = -0.12
      }
    }
    if (pose === 'back') {
      armRot[0].x = -1.1 + Math.sin(time * 6) * 0.15
      armRot[1].x = -1.1 - Math.sin(time * 6) * 0.15
    }
    if (pose === 'stand') armRot[0].x = armRot[1].x = -0.35

    // 컵을 들고 있으면 오른팔을 앞으로 (hold 0 = 가슴 앞, 1 = 입가로)
    if (hold !== undefined && hold !== null) {
      const k = Math.max(0, Math.min(1, hold))
      armRot[0].set(-1.0 - k * 0.9, 0, -0.18 + k * 0.32)
    }

    rootBone.position.set(rest.x + bx * inv, rest.y + by * inv, rest.z + bz * inv)
    for (let i = 0; i < 2; i++) {
      arms[i].rotation.set(armRot[i].x, armRot[i].y, ARM_DOWN[i] + armRot[i].z)
      // 누우면 팔은 이불 속 (Kenney 손이 커서 이불 위로 비죽 나오므로 숨긴다)
      arms[i].scale.setScalar(pose === 'lie' ? 0.001 : 1)
    }
  }
  animate({ walking: false, pose: null, t: 0 })

  return {
    root,
    height: TARGET_H + hatH,
    animate,
    hand: grip,
    dispose() {
      // 몸 모양·칠한 재질·모자 도형은 모두 다른 미니미와 같이 쓰는 캐시라 치울 것이 없다
    },
  }
}
