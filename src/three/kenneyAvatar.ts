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
  // 흰 재킷 · 보라 속티 · 주황 허리띠 · 어두운 바지 · 파란 장갑(→ 손)
  bob: [
    ['head', 2, 5, 'skin'],
    ['head', 3, 7, 'hair'],
    ['body', 2, 1, 'bottom'],
    ['body', 1, 1, 'skin'],
    ['body', 3, 15, 'top', ARMS],
    ['body', 3, 5, 'topLight', ['torso']],
    ['body', 3, 7, 'bottom', LEGS],
  ],
  // (원본) 초록 티 · 검은 조끼 · 살구색 반바지와 손목 밴드 · 허리띠
  short: [
    ['head', 2, 1, 'skin'],
    ['head', 3, 7, 'hair'],
    // 몸통의 피부색 칸은 멜빵끈 → 반바지 색으로 (피부색이면 살색 멜빵처럼 보인다)
    ['body', 2, 1, 'bottom', ['torso']],
    ['body', 2, 1, 'skin'],
    // 반바지와 손목 밴드는 원본에서도 같은 색
    ['body', 2, 5, 'bottom'],
    ['body', 2, 9, 'top'],
    ['body', 3, 3, 'bottom', ['torso']],
    // 조끼는 윗옷과 같은 색 (진하게 칠하면 허리 뒤에 따로 붙은 덩어리처럼 보인다)
    ['body', 3, 7, 'top', ['torso']],
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
    // 주황 허리 밴드
    ['body', 2, 1, 'bottom'],
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
/**
 * 다리 칸: 부위 칸 다음 빈칸. 다리(신발 빼고)의 UV를 이 칸 하나에 높이대로 펼쳐 둔다 (칸 위 = 엉덩이, 아래 = 발목).
 * 바지면 칸 전체를 바지 색, 반바지·치마면 위쪽만 바지 색이고 아래는 피부색으로 칠한다.
 * (팔레트 칸을 꼭짓점마다 바꾸면 삼각형 안에서 다른 칸들이 무지개처럼 번지는데, 한 칸 안의 위아래라 경계가 깔끔하다)
 */
const LEG_COL = ROLES.length
/** 반바지 끝 높이 (모델 단위, 발바닥 0 ~ 엉덩이 약 0.18) */
const SHORTS_Y = 0.105

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
  /** 얼굴 판 (모델 단위 x·y 범위) · 피부 칸 안에서 판 위·아래 끝의 명암 위치 (0 위 ~ 1 아래) */
  face: { x0: number; x1: number; y0: number; y1: number; top: number; bottom: number }
  /** 다리 칸 맨 위 높이 · 엉덩이(다리 뼈) 높이 (모델 단위) */
  legTop: number
  hipY: number
  /** 몸통 뼈 기준 몸통 상자 (모델 단위, 옷 장식 크기) */
  torso: THREE.Box3
  /** 몸통·다리 꼭짓점 (뿌리 뼈 기준 = 모델 좌표) · 몸통 뼈 위치 — 높이별 단면 크기를 잰다 */
  bodyPts: THREE.Vector3[]
  torsoAt: THREE.Vector3
}

/** 높이 y 근처(±tol) 꼭짓점들의 단면 상자 (모델 좌표). 옷을 몸에 딱 맞게 두르려고 */
function section(t: Template, y: number, tol = 0.012) {
  const b = new THREE.Box3()
  for (const p of t.bodyPts) if (Math.abs(p.y - y) <= tol) b.expandByPoint(p)
  return b
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
 * 원본 얼굴(눈·입·안경·눈화장)을 지운다 → 미니미 눈 설정대로 faceMaterial이 얼굴 판에 새로 그린다.
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

/**
 * 얼굴 앞면 판(앞을 보는 피부 면, 꼭짓점 8개)을 두 번째 재질 묶음으로 떼고 UV를 판 전체 그림(faceMaterial)에 맞춘다.
 * 눈·입이 얼굴 면 자체에 그려지니 따로 뜨지 않는다.
 */
/**
 * 머리통 피부를 부드럽게 비춘다. 원본은 면마다 법선이 따로라(각진 음영) 얼굴 앞판과 깎인 모서리 경계가 또렷해서
 * 얼굴판이 머리에 따로 얹힌 것처럼 보인다. 같은 자리 꼭짓점이 같은 법선(둥근 상자 모양)을 갖게 해 음영을 잇는다.
 * 귀는 따로 떨어진 덩어리라 그대로 둔다 (가장 큰 피부 덩어리 = 머리통만).
 */
function softenSkin(geo: THREE.BufferGeometry, skinVerts: number[]) {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal as THREE.BufferAttribute
  const index = geo.index
  if (!index || !skinVerts.length) return
  const skin = new Set(skinVerts)
  const key = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let r = k
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(k, r)
    return r
  }
  for (const i of skin) if (!parent.has(key(i))) parent.set(key(i), key(i))
  for (let t = 0; t < index.count; t += 3) {
    const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)]
    if (!tri.every((i) => skin.has(i))) continue
    const a = find(key(tri[0]))
    for (const q of [1, 2]) {
      const b = find(key(tri[q]))
      if (a !== b) parent.set(b, a)
    }
  }
  const groups = new Map<string, number[]>()
  for (const i of skin) {
    const r = find(key(i))
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(i)
  }
  const head = [...groups.values()].sort((a, b) => b.length - a.length)[0]
  const box = new THREE.Box3()
  for (const i of head) box.expandByPoint(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)))
  const c = box.getCenter(new THREE.Vector3())
  const h = box.getSize(new THREE.Vector3()).multiplyScalar(0.5)
  // 둥근 상자 법선: 각 축 (거리/반폭)^3 → 면 가운데는 거의 정면, 모서리로 갈수록 부드럽게 꺾인다
  const n = new THREE.Vector3()
  const f = (d: number, half: number) => Math.sign(d) * Math.abs(d / half) ** 3 / half
  for (const i of head) {
    n.set(f(pos.getX(i) - c.x, h.x), f(pos.getY(i) - c.y, h.y), f(pos.getZ(i) - c.z, h.z))
    if (n.lengthSq() < 1e-12) continue
    n.normalize()
    nor.setXYZ(i, n.x, n.y, n.z)
  }
  nor.needsUpdate = true
}

function splitFace(geo: THREE.BufferGeometry, uv: THREE.BufferAttribute, skull: THREE.Box3, origV: number[]): Template['face'] | undefined {
  const index = geo.index
  if (!index) return undefined
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  // 피부 꼭짓점 중 앞을 보는 가장 앞쪽 면
  const isFront = (i: number) => nor.getZ(i) > 0.99 && Math.abs(pos.getZ(i) - skull.max.z) < 0.004
  const verts = new Set<number>()
  for (let i = 0; i < pos.count; i++) {
    const inSkull = pos.getX(i) >= skull.min.x && pos.getX(i) <= skull.max.x && pos.getY(i) >= skull.min.y && pos.getY(i) <= skull.max.y
    if (inSkull && isFront(i) && uv.getX(i) * TEX < ROLES.indexOf('skin') * CW + CW && uv.getX(i) * TEX >= ROLES.indexOf('skin') * CW && uv.getY(i) * TEX < CH) verts.add(i)
  }
  const rest: number[] = []
  const front: number[] = []
  for (let t = 0; t < index.count; t += 3) {
    const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)]
    ;(tri.every((i) => verts.has(i)) ? front : rest).push(...tri)
  }
  if (!front.length) return undefined
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  let top = 0
  let bottom = 1
  for (const i of front) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
    if (y < y0) {
      y0 = y
      bottom = origV[i]
    }
    if (y > y1) {
      y1 = y
      top = origV[i]
    }
  }
  for (const i of verts) uv.setXY(i, (pos.getX(i) - x0) / (x1 - x0), (y1 - pos.getY(i)) / (y1 - y0))
  geo.setIndex([...rest, ...front])
  geo.clearGroups()
  geo.addGroup(0, rest.length, 0)
  geo.addGroup(rest.length, front.length, 1)
  return { x0, x1, y0, y1, top, bottom }
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
  let face: Template['face'] = { x0: -0.12, x1: 0.12, y0: 0.34, y1: 0.62, top: 0, bottom: 1 }
  const bones: Partial<Record<Bone, THREE.Bone>> = {}
  scene.traverse((n) => {
    if ((n as THREE.Bone).isBone) bones[n.name as Bone] = n as THREE.Bone
  })
  scene.updateMatrixWorld(true)
  const hipY0 = bones['leg-left']!.getWorldPosition(new THREE.Vector3()).y
  const legTop = hipY0 + 0.03
  const torsoBox = new THREE.Box3()
  const bodyPts: THREE.Vector3[] = []
  const LEG_ROLES: (Role | undefined)[] = ['skin', 'skinShade', 'skinLight', 'bottom']
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
    /** 꼭짓점마다 원래 칸 안 세로 위치 (0 위 ~ 1 아래) */
    const origV: number[] = []
    /** 머리의 피부 꼭짓점 */
    const skinVerts: number[] = []
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i) * TEX
      const v = uv.getY(i) * TEX
      const col = Math.min(15, Math.floor(u / CW))
      const row = Math.min(3, Math.floor(v / CH))
      sw.push(row * 16 + col)
      origV.push((v - row * CH) / CH)
      const bone = boneOf(geo, m.skeleton, i)
      const rule = RULES[hair].find(([p, r, c, , only]) => p === part && r === row && c === col && (!only || only.includes(bone)))
      if (rule) {
        const role = ROLES.indexOf(rule[3])
        uv.setXY(i, (role * CW + (u - col * CW)) / TEX, (v - row * CH) / TEX)
      }
      // 다리(바지·맨다리 자리, 신발 빼고)는 다리 칸에 높이대로
      if ((bone === 'leg-left' || bone === 'leg-right') && rule && LEG_ROLES.includes(rule[3])) {
        const k = Math.min(1, Math.max(0, (legTop - pos.getY(i)) / legTop))
        uv.setXY(i, (LEG_COL * CW + CW / 2) / TEX, (k * CH) / TEX)
      }
      if (bone === 'torso') torsoBox.expandByPoint(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)))
      if (bone === 'torso' || bone === 'leg-left' || bone === 'leg-right') bodyPts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)))
      // 크기 재기 (묶인 자세 = 모델 좌표)
      if (bone === 'leg-left' || bone === 'leg-right') legVerts.push(pos.getZ(i))
      if (bone === 'torso') torsoZ.push(pos.getZ(i))
      if (bone === 'arm-right') handX.push(pos.getX(i))
      if (part === 'head') head.expandByPoint(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)))
      // 모자 크기는 머리카락을 뺀 머리통(얼굴 피부)으로 잰다 (똥머리처럼 위로 솟은 머리에 모자가 뜨지 않게)
      if (part === 'head' && rule?.[3] === 'skin') {
        skull.expandByPoint(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)))
        skinVerts.push(i)
      }
    }
    uv.needsUpdate = true
    if (part === 'head') {
      dropFace(geo, sw, skull)
      face = splitFace(geo, uv, skull, origV) ?? face
      softenSkin(geo, skinVerts)
    }
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
  const torsoBone = bones.torso!.getWorldPosition(new THREE.Vector3())
  const rootBone = bones.root!.getWorldPosition(new THREE.Vector3())
  return {
    scene,
    image: image!,
    scale,
    butt: (hipY - half(legVerts)) * scale,
    back: half(torsoZ) * scale,
    skull: skull.clone().translate(headBone.clone().negate()),
    hairTop: head.max.y - headBone.y,
    hand: new THREE.Vector3((Math.min(...handX) - armBone.x) * 0.82, 0, 0),
    face,
    legTop,
    hipY: hipY0,
    torso: torsoBox.clone().translate(torsoBone.clone().negate()),
    bodyPts: bodyPts.map((p) => p.clone().sub(rootBone)),
    torsoAt: torsoBone.clone().sub(rootBone),
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

// ─── 옷 모양 (상의 후드·줄무늬, 하의 치마·긴 치마) ───

const frustums = new Map<string, THREE.BufferGeometry>()
/** 위가 좁고 아래가 넓은 네모 치마 모양 (위 끝이 원점, 아래로 h) */
function frustum(wTop: number, dTop: number, wBot: number, dBot: number, h: number) {
  const k = [wTop, dTop, wBot, dBot, h].map((n) => n.toFixed(4)).join(',')
  let g = frustums.get(k)
  if (!g) {
    g = new THREE.BoxGeometry(1, 1, 1)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const top = p.getY(i) > 0
      p.setXYZ(i, p.getX(i) * (top ? wTop : wBot), top ? 0 : -h, p.getZ(i) * (top ? dTop : dBot))
    }
    g.computeVertexNormals()
    frustums.set(k, g)
  }
  return g
}

/**
 * 상의 장식은 몸통 뼈에, 치마는 뿌리 뼈(엉덩이 높이)에 붙인다. 크기는 모두 원본 몸통 상자에 맞춘다.
 * 치마는 앉으면 짧게 줄이도록 돌려준다.
 */
function kenneyOutfit(look: AvatarLook, t: Template, top: string, bottom: string, torsoBone: THREE.Bone, rootBone: THREE.Bone) {
  const b = t.torso
  const W = b.max.x - b.min.x
  const D = b.max.z - b.min.z
  const H = b.max.y - b.min.y
  const cx = (b.min.x + b.max.x) / 2
  const g = new THREE.Group()
  if (look.top === 'hoodie') {
    // 등 뒤로 넘긴 모자 + 배 주머니 + 끈 두 가닥
    const shade = mat(tint(top, -0.08), { rough: 0.85 })
    g.add(part(roundBox(W * 0.78, H * 0.3, D * 0.42, H * 0.1), mat(top, { rough: 0.85 }), [cx, b.max.y - H * 0.12, b.min.z - D * 0.08]))
    g.add(part(roundBox(W * 0.6, H * 0.22, D * 0.06, H * 0.05), shade, [cx, b.min.y + H * 0.36, b.max.z + D * 0.01], { shadow: false }))
    for (const s of [-1, 1]) g.add(part(roundBox(W * 0.05, H * 0.2, D * 0.05, W * 0.02), mat('#fbf7ef'), [cx + s * W * 0.14, b.max.y - H * 0.25, b.max.z + D * 0.02], { shadow: false }))
  }
  torsoBone.add(g)

  if (look.bottom !== 'skirt' && look.bottom !== 'dress') return null
  // 치마: 엉덩이 조금 위에서 시작해 무릎(치마) · 발목 위(긴 치마)까지, 밑단은 조금 진하게
  // 허리 단면(엉덩이 높이 몸통·다리)에 딱 맞춘다
  const y0 = t.hipY + 0.012
  const r = section(t, t.hipY, 0.02)
  const w = r.max.x - r.min.x + 0.008
  const d = r.max.z - r.min.z + 0.008
  const len = look.bottom === 'dress' ? y0 - 0.045 : y0 - 0.095
  const skirt = new THREE.Group()
  skirt.position.set((r.min.x + r.max.x) / 2, y0, (r.min.z + r.max.z) / 2)
  const flare = look.bottom === 'dress' ? 1.22 : 1.18
  skirt.add(part(frustum(w, d, w * flare, d * flare, len), mat(bottom, { rough: 0.85 }), [0, 0, 0]))
  const hem = len * 0.16
  skirt.add(part(frustum(w * flare * 1.01, d * flare * 1.01, w * flare * 1.03, d * flare * 1.03, hem), mat(tint(bottom, -0.12), { rough: 0.85 }), [0, -len + hem * 0.95, 0]))
  rootBone.add(skirt)
  return skirt
}

// ─── 얼굴 (얼굴 앞면 판에 미니미 눈 설정대로 그린 그림) ───

const faces = new Map<string, THREE.MeshStandardMaterial>()
/**
 * 얼굴 판 재질. 캔버스 좌표를 모델 단위(위가 +y)로 맞춰 두고, 원본 Kenney 눈·입 자리에 그린다.
 * 바탕은 피부 칸과 같은 위아래 명암 → 얼굴 둘레 피부와 이어진다.
 */
function faceMaterial(look: AvatarLook, t: Template, skin: string) {
  const key = `${look.eyes}|${skin}|${t.face.x0.toFixed(3)}`
  let m = faces.get(key)
  if (m) return m
  const f = t.face
  const fw = f.x1 - f.x0
  const fh = f.y1 - f.y0
  const k = 256 / fw
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = Math.round(fh * k)
  const ctx = canvas.getContext('2d')!
  // 피부 칸 명암 (칸 위 tint +0.05 → 아래 -0.1)을 얼굴 판이 걸친 만큼만
  const a = new THREE.Color(tint(skin, 0.05))
  const b = new THREE.Color(tint(skin, -0.1))
  const at = (q: number) => `#${a.clone().lerp(b, q).getHexString()}`
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height)
  g.addColorStop(0, at(f.top))
  g.addColorStop(1, at(f.bottom))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  // 여기부터 모델 단위, 얼굴 가운데 x=0, 위가 +y
  const cx = (f.x0 + f.x1) / 2
  ctx.setTransform(k, 0, 0, -k, (cx - f.x0) * k, f.y1 * k)
  const ink = '#2a2130'
  const eyeY = 0.48
  const ex = 0.072
  const rr = (x: number, y: number, w: number, h: number, r: number, color: string) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y - h / 2, w, h, r)
    ctx.fill()
  }
  const stroke = (x: number, y: number, r: number, a0: number, a1: number, w: number) => {
    ctx.strokeStyle = ink
    ctx.lineWidth = w
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(x, y, r, a0, a1)
    ctx.stroke()
  }
  const roundEye = (x: number) => {
    rr(x, eyeY, 0.04, 0.058, 0.02, ink)
    rr(x + 0.008, eyeY + 0.014, 0.016, 0.016, 0.008, '#ffffff')
  }
  const happyEye = (x: number) => stroke(x, eyeY - 0.012, 0.02, Math.PI * 0.15, Math.PI * 0.85, 0.011)
  // 볼터치
  ctx.fillStyle = 'rgba(255, 120, 140, 0.45)'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(s * 0.088, 0.432, 0.022, 0.012, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  switch (look.eyes) {
    case 'smile':
      happyEye(-ex)
      happyEye(ex)
      break
    case 'dot':
      for (const s of [-1, 1]) rr(s * ex, eyeY, 0.026, 0.03, 0.013, ink)
      break
    case 'wink':
      roundEye(-ex)
      happyEye(ex)
      break
    case 'shades':
      for (const s of [-1, 1]) {
        rr(s * ex, eyeY, 0.09, 0.056, 0.02, '#1d1b26')
        rr(s * ex - 0.022, eyeY + 0.013, 0.02, 0.012, 0.006, 'rgba(255,255,255,0.7)')
      }
      rr(0, eyeY + 0.012, 0.06, 0.012, 0.006, '#1d1b26')
      break
    default:
      roundEye(-ex)
      roundEye(ex)
  }
  // 작게 웃는 입
  stroke(0, 0.43, 0.022, Math.PI * 1.2, Math.PI * 1.8, 0.009)
  const map = new THREE.CanvasTexture(canvas)
  map.flipY = false
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  m = new THREE.MeshStandardMaterial({ map, roughness: 0.8 })
  faces.set(key, m)
  return m
}


// ─── 미니미마다 칠한 텍스처 (같은 색 조합은 같이 쓴다) ───
const skins = new Map<string, THREE.MeshStandardMaterial>()
function paintedMaterial(hair: HairId, t: Template, c: Record<Role, string>, bareLegs: boolean, stripes: boolean) {
  const key = `${hair}|${ROLES.map((r) => c[r]).join(',')}|${bareLegs}|${stripes}`
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
  // 다리 칸: 바지는 끝까지, 맨다리면 반바지 끝(SHORTS_Y)부터 피부색
  const split = bareLegs ? Math.round(((t.legTop - SHORTS_Y) / t.legTop) * CH) : CH
  const band = (y0: number, y1: number, color: string) => {
    if (y1 <= y0) return
    const g = ctx.createLinearGradient(0, y0, 0, y1)
    g.addColorStop(0, tint(color, 0.03))
    g.addColorStop(1, tint(color, -0.08))
    ctx.fillStyle = g
    ctx.fillRect(LEG_COL * CW, y0, CW, y1 - y0)
  }
  band(0, split, c.bottom)
  band(split, CH, c.skin)
  // 줄무늬 윗옷: 윗옷 칸에 가로 흰 줄 (칸 안 위아래 = 옷의 위아래)
  if (stripes) {
    ctx.fillStyle = '#fbf7ef'
    for (const f of [0.3, 0.55, 0.8]) ctx.fillRect(ROLES.indexOf('top') * CW, Math.round(f * CH), CW, Math.round(CH * 0.1))
  }
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
  const material = paintedMaterial(hair, t, colors, look.bottom !== 'pants', look.top === 'stripe')
  const face = faceMaterial(look, t, colors.skin)

  const root = new THREE.Group()
  const model = SkeletonUtils.clone(t.scene)
  model.scale.setScalar(t.scale)
  root.add(model)
  const bones: Partial<Record<Bone, THREE.Bone>> = {}
  model.traverse((n) => {
    if ((n as THREE.Bone).isBone) bones[n.name as Bone] = n as THREE.Bone
    const m = n as THREE.SkinnedMesh
    if (m.isSkinnedMesh) {
      // 머리는 [팔레트, 얼굴 판 그림] 두 재질 (prepare에서 얼굴 판 삼각형만 두 번째 묶음으로)
      m.material = m.geometry.groups.length ? [material, face] : material
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

  // 모자: Kenney 머리통에 맞춰 각지게 만든 모자 (머리 뼈에 붙어 같이 움직인다)
  let hatH = 0
  if (look.hat !== 'none') {
    const h = kenneyHat(look, t)
    // 머리 뼈에 붙이기 전에 잰다 (모자 좌표 = 머리 뼈 기준 모델 단위). 붙인 뒤 재면 부모 변환이 덜 반영된 값이 나온다
    h.updateMatrixWorld(true)
    const top = new THREE.Box3().setFromObject(h).max.y
    headBone.add(h)
    hatH = Math.max(0, (top - t.hairTop) * t.scale)
  }

  // 옷 모양 (후드·줄무늬·치마)
  const skirt = kenneyOutfit(look, t, top, bottom, bones.torso!, rootBone)

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
    // 앉으면 치마는 엉덩이 둘레에 짧게 퍼진다 (통째로 앞으로 접으면 다리 위에 상자가 얹힌 것처럼 보인다)
    // 걸을 땐 그대로 두고 다리가 치마 안에서 움직인다
    if (skirt) skirt.scale.y = seated ? 0.3 : 1

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
