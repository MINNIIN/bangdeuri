/**
 * 3D 미니미: 큰 머리 2.3등신 인형. 미니미 만들기에서 고른 머리·눈·옷·모자·색을 그대로 쓴다.
 * 발바닥이 원점, 얼굴은 +z 쪽. 키 약 1.25m.
 *
 * 도형을 이어 붙인 느낌이 나지 않게:
 * - 몸통·치마·바지는 돌림판(Lathe)으로 깎은 한 덩어리, 팔다리는 끝이 가늘어지는 관절 두 마디
 * - 얼굴은 볼이 통통한 머리 위에 그린 얼굴(눈·속눈썹·눈썹·볼터치·입)을 입히고, 가끔 눈을 깜빡인다
 * - 머리카락은 가닥(끝이 가늘어지는 납작한 관)을 여러 개 얹어 한 덩어리로 합친다
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { AvatarLook } from '../art/avatar'
import { OUTFITS } from '../art/poses'
import type { Pose } from '../lib/interactions'
import { canvasTexture, cone, cyl, group, mat, part, roundBox, sphere, tint, torus } from './kit'

const INK = '#2b2233'
const HEAD_R = 0.3
const HEAD_Y = 0.93
const HIP_Y = 0.36
const SHOULDER_Y = 0.605
const THIGH = 0.15
const SHIN = 0.13
const UPPER_ARM = 0.11
const FOREARM = 0.09
/** 몸통 앞뒤 두께의 절반 (누울 때 등이 바닥에 닿는 높이) */
const BACK = 0.132
/** 앉을 때 엉덩이 바닥이 발바닥에서 얼마나 위에 있나 */
const BUTT = 0.29

export interface Avatar3D {
  root: THREE.Group
  /** 머리 꼭대기 높이 (이름표 자리) */
  height: number
  /**
   * 매 프레임: 걷는 중인지, 지금 자세, 시간(초).
   * knee: 앉을 때 무릎을 굽히는 정도 (0 = 다리를 앞으로 쭉, 1.3 = 의자처럼 아래로)
   */
  animate(state: { walking: boolean; pose: Pose | null; t: number; speed?: number; knee?: number }): void
  dispose(): void
}

// ─── 모양 (모든 미니미가 같이 쓴다) ───

const shapes = new Map<string, THREE.BufferGeometry>()
function shape<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = shapes.get(key)
  if (!g) shapes.set(key, (g = make()))
  return g as T
}

/** 위(0)에서 아래(-len)로 가늘어지는 팔다리 마디. 양 끝은 둥글다 */
const limb = (len: number, r0: number, r1: number) =>
  shape(`limb${len}:${r0}:${r1}`, () => {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2)
      pts.push(new THREE.Vector2(Math.max(1e-4, r1 * Math.cos(a)), -len + r1 * Math.sin(a)))
    }
    for (let i = 1; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2)
      pts.push(new THREE.Vector2(Math.max(1e-4, r0 * Math.cos(a)), r0 * Math.sin(a)))
    }
    return new THREE.LatheGeometry(pts, 18)
  })

/**
 * (반지름, 높이) 점들을 돌려 깎은 몸통·옷. 점은 아래에서 위 순서로 준다
 * (반대로 주면 겉면이 안쪽을 향해서 앞면이 안 그려지고 속이 비쳐 보인다).
 * pleat: 치마 주름 — 허리(top)에서 단(hem)으로 갈수록 깊어지는 물결
 */
const lathe = (key: string, pts: [number, number][], pleat?: { top: number; hem: number; n: number; amp: number }) =>
  shape(`lathe:${key}`, () => {
    const g = new THREE.LatheGeometry(
      pts.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)),
      pleat ? 72 : 28,
    )
    if (pleat) {
      const p = g.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i)
        const y = p.getY(i)
        const z = p.getZ(i)
        const r = Math.hypot(x, z)
        if (r < 1e-3) continue
        const k = THREE.MathUtils.clamp((pleat.top - y) / (pleat.top - pleat.hem), 0, 1)
        const a = Math.atan2(x, z)
        const s = 1 + Math.cos(a * pleat.n) * pleat.amp * k * k
        p.setX(i, x * s)
        p.setZ(i, z * s)
      }
    }
    g.computeVertexNormals()
    return g
  })

/** 볼이 통통하고 이마가 넓은 얼굴형으로 구를 살짝 빚는다 */
function moldHead(g: THREE.BufferGeometry) {
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n = v.clone().normalize()
    // 볼: 눈 아래 ~ 턱 위가 가장 통통
    const cheek = Math.max(0, 1 - Math.abs(n.y + 0.38) * 2.2)
    const front = Math.max(0, n.z)
    v.x *= 1.05 + cheek * 0.07
    v.z *= 1 + cheek * front * 0.05
    v.y *= 0.96
    // 턱 끝은 살짝 앞으로 둥글게
    if (n.y < -0.6) v.z += front * 0.015
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

const headGeo = () => shape('head', () => moldHead(new THREE.SphereGeometry(HEAD_R, 40, 30)))

/** 얼굴 그림을 입히는 앞쪽 껍데기 (머리와 같은 모양으로 빚는다) */
const FACE_PHI = 1.9
const FACE_THETA0 = Math.PI / 2 - 0.62
const FACE_THETA = 1.36
const faceGeo = () =>
  shape('face', () =>
    moldHead(new THREE.SphereGeometry(HEAD_R * 1.006, 36, 28, Math.PI / 2 - FACE_PHI / 2, FACE_PHI, FACE_THETA0, FACE_THETA)),
  )

/** 머리 둘레의 점: az 앞(+z)에서 오른쪽(+x)으로 도는 각, el 적도에서 위로 */
const sph = (az: number, el: number, r: number) =>
  new THREE.Vector3(r * Math.cos(el) * Math.sin(az), r * Math.sin(el), r * Math.cos(el) * Math.cos(az))

/**
 * 머리카락 한 가닥: 곡선을 따라 끝으로 갈수록 가늘어지는 납작한 관.
 * 납작한 면이 머리(아래로 내려가면 몸 축)를 향하게 눕혀서 머리에 착 붙는다.
 */
function lock(pts: THREE.Vector3[], r0: number, r1: number, flat = 0.45, seg = 14, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= seg; i++) {
    const t = i / seg
    const p = curve.getPoint(t)
    const tan = curve.getTangent(t)
    const out = p.clone().sub(new THREE.Vector3(0, Math.min(0, p.y), 0))
    if (out.lengthSq() < 1e-6) out.set(0, 0, 1)
    out.normalize()
    const bin = new THREE.Vector3().crossVectors(tan, out)
    if (bin.lengthSq() < 1e-6) bin.set(1, 0, 0)
    bin.normalize()
    const nrm = new THREE.Vector3().crossVectors(bin, tan).normalize()
    // 뿌리 쪽은 둥글게 부풀고 끝은 뾰족
    const r = r1 + (r0 - r1) * Math.pow(1 - t, 0.9) * (t < 0.12 ? 0.75 + t * 2 : 1)
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      pos.push(p.x + (bin.x * c + nrm.x * s * flat) * r, p.y + (bin.y * c + nrm.y * s * flat) * r, p.z + (bin.z * c + nrm.z * s * flat) * r)
      const n = new THREE.Vector3()
        .addScaledVector(bin, c * flat)
        .addScaledVector(nrm, s)
        .normalize()
      nor.push(n.x, n.y, n.z)
      uv.push(j / radial, t)
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j
      const b = a + radial + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** 정수리를 덮는 바탕 (뒤로 기울여 앞은 이마가 드러나고 뒤는 목덜미까지) */
function capGeo(theta: number, tilt: number) {
  const g = new THREE.SphereGeometry(HEAD_R + 0.022, 96, 30, 0, Math.PI * 2, 0, theta)
  // 결: 정수리 가마에서 사방으로 흘러내리는 얕은 골 (매끈한 헬멧처럼 보이지 않게)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const polar = Math.acos(THREE.MathUtils.clamp(y / (HEAD_R + 0.022), -1, 1))
    const fade = THREE.MathUtils.smoothstep(polar, 0.15, 0.7)
    const s = 1 + Math.cos(Math.atan2(x, z) * 22) * 0.022 * fade
    p.setXYZ(i, x * s, y, z * s)
  }
  g.computeVertexNormals()
  g.rotateX(-tilt)
  g.scale(1.07, 0.98, 1.03)
  return g
}

const sphereAt = (r: number, at: THREE.Vector3, sc: [number, number, number] = [1, 1, 1]) => {
  const g = new THREE.SphereGeometry(r, 12, 10)
  g.scale(...sc)
  g.translate(at.x, at.y, at.z)
  return g
}

/**
 * 모자가 덮는 곳 (hat()의 돔과 같은 위치·기울기·크기). 그 안에 있는 머리카락은 모자 안쪽으로 눌러 넣어
 * 모자를 뚫고 나오지 않게 하고, 모자 아래로 빠져나오는 부분만 보이게 한다
 */
const HAT_COVER: Partial<Record<AvatarLook['hat'], { at: [number, number, number]; tilt: number; scale: [number, number, number]; r: number; theta: number }>> = {
  cap: { at: [0, 0.06, -0.01], tilt: -0.18, scale: [1.07, 1, 1.03], r: HEAD_R + 0.05, theta: Math.PI / 2 },
  beanie: { at: [0, 0.05, -0.02], tilt: -0.25, scale: [1.07, 1.12, 1.03], r: HEAD_R + 0.055, theta: Math.PI / 2 },
  bear: { at: [0, 0.02, -0.04], tilt: -0.55, scale: [1.07, 1, 1.03], r: HEAD_R + 0.065, theta: 2.1 },
}

function tuckUnderHat(g: THREE.BufferGeometry, hat: AvatarLook['hat']) {
  const c = HAT_COVER[hat]
  if (!c) return
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...c.at),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(c.tilt, 0, 0)),
    new THREE.Vector3(...c.scale),
  )
  const inv = m.clone().invert()
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  const inner = c.r - 0.018
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(inv)
    const len = v.length()
    if (len <= inner) continue
    // 모자 가장자리 바로 아래(여유 0.06)까지는 덮인 것으로 본다: 챙 끝에서 머리가 삐죽 나오지 않게
    if (Math.acos(THREE.MathUtils.clamp(v.y / len, -1, 1)) > c.theta + 0.06) continue
    v.multiplyScalar(inner / len).applyMatrix4(m)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
}

/** 머리 모양 하나 = 바탕색 덩어리 + 밝은 앞머리 덩어리 (각각 하나로 합친다) */
const hairCache = new Map<string, { base: THREE.BufferGeometry | null; hi: THREE.BufferGeometry | null }>()
function hairGeos(style: AvatarLook['hair'], hat: AvatarLook['hat']) {
  const hatOn = hat in HAT_COVER
  const key = `${style}:${hat}`
  const hit = hairCache.get(key)
  if (hit) return hit
  {
    const base: THREE.BufferGeometry[] = []
    const hi: THREE.BufferGeometry[] = []
    const add = (to: THREE.BufferGeometry[], g: THREE.BufferGeometry) => {
      const x = g.index ? g.toNonIndexed() : g
      for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') x.deleteAttribute(k)
      to.push(x)
    }

    // 앞머리: 정수리에서 이마로 쓸어내린 가닥 7개 (모자를 쓰면 챙 아래에서 시작)
    const bangs = (len = 1) => {
      for (let k = -3; k <= 3; k++) {
        const az = k * 0.25
        const side = Math.abs(k)
        const pts = hatOn
          ? [sph(az * 0.9, 0.66, 0.29), sph(az, 0.46, 0.33), sph(az * 1.06, 0.3 - side * 0.02, 0.332), sph(az * 1.1, 0.2 + side * 0.03 - (len - 1) * 0.2, 0.32)]
          : [sph(az * 0.4, 1.15, 0.27), sph(az * 0.9, 0.8, 0.33), sph(az * 1.04, 0.48, 0.334), sph(az * 1.12, 0.21 + side * 0.035 - (len - 1) * 0.2, 0.321)]
        add(side % 2 ? base : hi, lock(pts, 0.1, 0.01, 0.3))
      }
    }
    // 귀 앞으로 내려오는 옆머리
    const sideburns = (low: number) => {
      for (const s of [-1, 1])
        add(base, lock([sph(s * 1.12, hatOn ? 0.55 : 0.85, 0.29), sph(s * 1.28, 0.3, 0.334), sph(s * 1.33, -0.05, 0.334), sph(s * 1.3, low, 0.32)], 0.085, 0.012, 0.32))
    }
    // 뒤통수를 덮으며 목덜미로 내려오는 짧은 가닥 (짧은 머리)
    const nape = (low: number) => {
      for (let a = 1.5; a <= Math.PI + 0.01; a += 0.27)
        for (const s of a > Math.PI - 0.05 ? [1] : [-1, 1]) {
          const az = s * a
          add(base, lock([sph(az, hatOn ? 0.55 : 0.95, 0.3), sph(az, 0.35, 0.335), sph(az, -0.1, 0.338), sph(az * 0.98, low, 0.31)], 0.1, 0.02, 0.32))
        }
    }
    // 목덜미에서 정수리 뒤 똥머리로 빗어 올린 가닥
    const upsweep = (to: THREE.Vector3) => {
      for (let a = 1.4; a <= Math.PI + 0.01; a += 0.3)
        for (const s of a > Math.PI - 0.05 ? [1] : [-1, 1]) {
          const az = s * a
          add(base, lock([sph(az, -0.45, 0.31), sph(az, -0.05, 0.338), sph(az, 0.45, 0.335), to.clone().add(sph(az, 0, 0.05))], 0.09, 0.03, 0.32))
        }
    }
    // 머리 둘레를 감싸며 내려오는 가닥 (단발·긴 머리)
    const ring = (from: number, end: (az: number) => THREE.Vector3[], step = 0.26) => {
      const n = Math.round((Math.PI - from) / step)
      for (let i = 0; i <= n; i++) {
        const az = from + ((Math.PI - from) * i) / n
        for (const s of i === n ? [1] : [-1, 1]) {
          const a = s * az
          const pts = [sph(a, hatOn ? 0.5 : 0.9, 0.28), sph(a, 0.3, 0.338), ...end(a)]
          add(i % 3 === 1 ? hi : base, lock(pts, 0.12, 0.03, 0.3))
        }
      }
    }

    switch (style) {
      case 'short': {
        add(base, capGeo(1.78, 0.45))
        bangs()
        sideburns(-0.22)
        // 정수리에 삐친 머리 한 가닥
        if (!hatOn)
          add(
            hi,
            lock([new THREE.Vector3(0, 0.29, 0.02), new THREE.Vector3(0.015, 0.39, 0.05), new THREE.Vector3(0.05, 0.44, 0.12), new THREE.Vector3(0.1, 0.42, 0.18)], 0.03, 0.006, 0.6),
          )
        // 뒤통수를 결 따라 덮고, 끝은 살짝 뻗치게
        nape(-0.45)
        for (const a of [-2.55, -2.85, 3.14, 2.85, 2.55]) add(base, lock([sph(a, 0.3, 0.3), sph(a, -0.3, 0.335), sph(a * 1.01, -0.58, 0.335)], 0.09, 0.015, 0.32))
        break
      }
      case 'bob': {
        add(base, capGeo(2.05, 0.5))
        bangs()
        // 턱선에서 안으로 말린다
        ring(1.0, (a) => [sph(a, -0.3, 0.355), sph(a, -0.62, 0.34), sph(a * 0.96, -0.7, 0.29)])
        break
      }
      case 'long': {
        add(base, capGeo(2.05, 0.5))
        bangs()
        // 앞쪽(얼굴 옆)은 어깨 아래까지, 뒤로 갈수록 길어져 등 가운데까지. 끝은 살짝 안으로
        ring(
          1.0,
          (a) => {
            const back = THREE.MathUtils.smoothstep(Math.abs(a), 1.2, 2.6)
            const o = sph(a, 0, 1)
            const r = 0.3 + back * 0.03
            const low = -0.42 - back * 0.16
            return [
              sph(a, -0.35, 0.355),
              new THREE.Vector3(o.x * r, low + 0.14, o.z * r),
              new THREE.Vector3(o.x * (r - 0.03), low, o.z * (r - 0.035)),
            ]
          },
          0.17,
        )
        break
      }
      case 'bun': {
        add(base, capGeo(1.95, 0.45))
        bangs()
        sideburns(-0.3)
        if (!hatOn) {
          // 정수리 뒤로 묶어 올린 똥머리 (감아 올린 가닥 + 동그란 덩이)
          add(base, sphereAt(0.125, new THREE.Vector3(0, 0.33, -0.1), [1, 0.92, 1]))
          upsweep(new THREE.Vector3(0, 0.3, -0.1))
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2
            add(hi, lock([new THREE.Vector3(0, 0.25, -0.06), new THREE.Vector3(Math.sin(a) * 0.1, 0.3, -0.1 + Math.cos(a) * 0.1), new THREE.Vector3(Math.sin(a + 1.2) * 0.11, 0.39, -0.1 + Math.cos(a + 1.2) * 0.11)], 0.04, 0.01, 0.6, 10, 8))
          }
        }
        break
      }
      case 'curly': {
        add(base, capGeo(1.92, 0.45))
        // 피보나치로 고르게 뿌린 곱슬 덩이
        const n = 110
        for (let i = 0; i < n; i++) {
          const y = 1 - (i / (n - 1)) * 1.5
          const rr = Math.sqrt(Math.max(0, 1 - y * y))
          const a = i * 2.39996
          const d = new THREE.Vector3(Math.sin(a) * rr, y, Math.cos(a) * rr)
          // 얼굴은 비워 둔다
          if (d.z > 0.38 && d.y < 0.45) continue
          // 모자를 쓰면 챙 아래로만 (모자 안쪽은 어차피 안 보인다)
          if (hatOn && d.y > -0.05) continue
          // 크기·높이를 조금씩 달리해 구슬을 붙인 것처럼 보이지 않게
          const k = Math.sin(i * 12.9898) * 0.5 + 0.5
          const r = 0.058 + k * 0.03
          add(i % 4 ? base : hi, sphereAt(r, d.multiplyScalar(HEAD_R + 0.025 + k * 0.025), [1, 0.9, 1]))
        }
        // 이마 위 곱슬 앞머리
        for (let k = -3; k <= 3; k++) add(k % 2 ? base : hi, sphereAt(0.06 + (k % 2 ? 0.008 : 0), sph(k * 0.22, hatOn ? 0.3 : 0.52, hatOn ? 0.315 : 0.33)))
        break
      }
    }
    const merge = (list: THREE.BufferGeometry[]) => {
      if (!list.length) return null
      const g = mergeGeometries(list)
      for (const x of list) x.dispose()
      return g
    }
    const made = { base: merge(base), hi: merge(hi) }
    if (made.base) tuckUnderHat(made.base, hat)
    if (made.hi) tuckUnderHat(made.hi, hat)
    hairCache.set(key, made)
    return made
  }
}

// ─── 얼굴 그림 ───

const FACE_W = 512
const FACE_K = FACE_W / FACE_PHI
const FACE_H = Math.round(FACE_THETA * FACE_K)
/** 얼굴 각도(좌우 ax, 아래로 ay; 적도·정면이 0) → 그림 좌표 */
const fx = (ax: number) => FACE_W / 2 + ax * FACE_K
const fy = (ay: number) => (ay + (Math.PI / 2 - FACE_THETA0)) * FACE_K
const EYE_X = 0.39
const EYE_Y = 0.11

function drawFace(look: AvatarLook, closed: boolean) {
  return canvasTexture(FACE_W, FACE_H, (ctx) => {
    ctx.clearRect(0, 0, FACE_W, FACE_H)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const shades = look.eyes === 'shades'

    // 볼터치
    for (const s of [-1, 1]) {
      const cx = fx(s * 0.6)
      const cy = fy(0.3)
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 44)
      g.addColorStop(0, 'rgba(255,128,160,0.55)')
      g.addColorStop(1, 'rgba(255,128,160,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(cx, cy, 46, 30, 0, 0, Math.PI * 2)
      ctx.fill()
      // 볼 위 반짝이 세 줄
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 3
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath()
        ctx.moveTo(cx + i * 9 - 3, cy - 4)
        ctx.lineTo(cx + i * 9 + 2, cy + 4)
        ctx.stroke()
      }
    }

    // 눈썹 (머리색보다 조금 진하게)
    if (!shades) {
      ctx.strokeStyle = tint(look.hairColor, -0.12)
      ctx.lineWidth = 7
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(fx(s * (EYE_X - 0.09)), fy(-0.15))
        ctx.quadraticCurveTo(fx(s * EYE_X), fy(-0.2), fx(s * (EYE_X + 0.1)), fy(-0.16))
        ctx.stroke()
      }
    }

    const W = 0.24 * FACE_K
    const H = 0.32 * FACE_K
    const open = (s: number) => {
      const cx = fx(s * EYE_X)
      const cy = fy(EYE_Y)
      // 흰자 살짝
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.ellipse(cx, cy + 2, W / 2 + 4, H / 2 + 2, 0, 0, Math.PI * 2)
      ctx.fill()
      // 눈동자: 위는 진하고 아래로 갈수록 맑게
      const g = ctx.createLinearGradient(0, cy - H / 2, 0, cy + H / 2)
      g.addColorStop(0, '#21182b')
      g.addColorStop(0.55, '#3b2c55')
      g.addColorStop(1, '#8a6cc4')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(cx, cy + 3, W / 2, H / 2, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#150f1c'
      ctx.beginPath()
      ctx.ellipse(cx, cy, W * 0.26, H * 0.3, 0, 0, Math.PI * 2)
      ctx.fill()
      // 아래쪽 빛
      ctx.fillStyle = 'rgba(205,180,255,0.55)'
      ctx.beginPath()
      ctx.ellipse(cx, cy + H * 0.3, W * 0.3, H * 0.12, 0, 0, Math.PI * 2)
      ctx.fill()
      // 반짝 (큰 것 + 작은 것)
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.ellipse(cx + W * 0.16 * s, cy - H * 0.17, W * 0.2, H * 0.15, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx - W * 0.17 * s, cy + H * 0.2, W * 0.08, 0, Math.PI * 2)
      ctx.fill()
      // 윗눈썹(속눈썹 선) + 바깥 꼬리
      ctx.strokeStyle = INK
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.ellipse(cx, cy + 4, W / 2 + 4, H / 2 + 3, 0, Math.PI * 1.08, Math.PI * 1.92)
      ctx.stroke()
      ctx.lineWidth = 6
      ctx.beginPath()
      const ox = cx + s * (W / 2 + 2)
      ctx.moveTo(ox, cy - H * 0.22)
      ctx.lineTo(ox + s * 10, cy - H * 0.36)
      ctx.stroke()
    }
    const arc = (s: number, up: boolean) => {
      const cx = fx(s * EYE_X)
      const cy = fy(EYE_Y + 0.03)
      ctx.strokeStyle = INK
      ctx.lineWidth = 8
      ctx.beginPath()
      if (up) {
        // ^ 웃는 눈
        ctx.moveTo(cx - W / 2, cy + 8)
        ctx.quadraticCurveTo(cx, cy - H * 0.45, cx + W / 2, cy + 8)
      } else {
        // 감은 눈 (속눈썹이 아래로)
        ctx.moveTo(cx - W / 2, cy - 2)
        ctx.quadraticCurveTo(cx, cy + H * 0.3, cx + W / 2, cy - 2)
        ctx.lineWidth = 5
        ctx.moveTo(cx + s * (W / 2), cy - 2)
        ctx.lineTo(cx + s * (W / 2 + 9), cy - 8)
      }
      ctx.stroke()
    }
    const dot = (s: number) => {
      const cx = fx(s * EYE_X)
      const cy = fy(EYE_Y)
      ctx.fillStyle = INK
      ctx.beginPath()
      ctx.ellipse(cx, cy, W * 0.2, H * 0.22, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(cx + W * 0.06, cy - H * 0.08, W * 0.06, 0, Math.PI * 2)
      ctx.fill()
    }

    if (!shades) {
      if (closed) {
        if (look.eyes === 'smile' || look.eyes === 'wink') {
          arc(-1, look.eyes === 'smile')
          arc(1, true)
        } else {
          arc(-1, false)
          arc(1, false)
        }
      } else if (look.eyes === 'round') {
        open(-1)
        open(1)
      } else if (look.eyes === 'dot') {
        dot(-1)
        dot(1)
      } else if (look.eyes === 'smile') {
        arc(-1, true)
        arc(1, true)
      } else if (look.eyes === 'wink') {
        open(-1)
        arc(1, true)
      }
    }

    // 입: 작은 고양이 입
    const mx = fx(0)
    const my = fy(0.36)
    ctx.strokeStyle = '#a63a57'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(mx - 16, my - 3)
    ctx.quadraticCurveTo(mx - 8, my + 7, mx, my)
    ctx.quadraticCurveTo(mx + 8, my + 7, mx + 16, my - 3)
    ctx.stroke()
  })
}

// ─── 모자 ───

function hat(look: AvatarLook) {
  const c = look.hatColor
  const g = new THREE.Group()
  const m = mat(c, { rough: 0.7 })
  const dark = mat(tint(c, -0.18), { rough: 0.7 })
  const dome = (r: number, theta = Math.PI / 2) => shape(`dome${r}:${theta}`, () => new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, theta))
  switch (look.hat) {
    case 'cap': {
      g.add(part(dome(HEAD_R + 0.05), m, [0, 0.06, -0.01], { rot: [-0.18, 0, 0], scale: [1.07, 1, 1.03] }))
      g.add(part(cyl(0.21, 0.21, 0.025, 28), dark, [0, 0.075, 0.28], { scale: [1, 1, 0.75], rot: [0.14, 0, 0] }))
      g.add(part(sphere(0.03), dark, [0, HEAD_R + 0.1, -0.06]))
      break
    }
    case 'beanie': {
      g.add(part(dome(HEAD_R + 0.055), m, [0, 0.05, -0.02], { rot: [-0.25, 0, 0], scale: [1.07, 1.12, 1.03] }))
      g.add(part(torus(HEAD_R + 0.045, 0.05), dark, [0, 0.11, -0.02], { rot: [Math.PI / 2 - 0.25, 0, 0], scale: [1.07, 1.03, 1] }))
      g.add(part(sphere(0.08, 16, 12), mat('#ffffff', { rough: 0.95 }), [0, HEAD_R + 0.17, -0.1]))
      break
    }
    case 'bear': {
      g.add(part(dome(HEAD_R + 0.065, 2.1), m, [0, 0.02, -0.04], { rot: [-0.55, 0, 0], scale: [1.07, 1, 1.03] }))
      for (const x of [-0.23, 0.23]) {
        g.add(part(sphere(0.1, 16, 12), m, [x, HEAD_R + 0.06, -0.04]))
        g.add(part(sphere(0.055, 12, 10), mat('#ffc7d6'), [x, HEAD_R + 0.06, 0.03], { scale: [1, 1, 0.5] }))
      }
      break
    }
    case 'pin': {
      const star = new THREE.Group()
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        star.add(part(sphere(0.035, 10, 8), m, [Math.sin(a) * 0.04, Math.cos(a) * 0.04, 0]))
      }
      star.add(part(sphere(0.03, 10, 8), mat('#fff3a8'), [0, 0, 0.02]))
      star.position.set(0.22, 0.2, 0.22)
      g.add(star)
      break
    }
    case 'ribbon': {
      const bow = group(
        part(cone(0.09, 0.16, 16), m, [-0.09, 0, 0], { rot: [0, 0, -Math.PI / 2], scale: [1, 1, 0.55] }),
        part(cone(0.09, 0.16, 16), m, [0.09, 0, 0], { rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.55] }),
        part(sphere(0.045), dark),
      )
      bow.position.set(0.13, 0.29, 0.07)
      bow.rotation.z = -0.35
      g.add(bow)
      break
    }
  }
  return g
}

function stripeTexture(base: string) {
  return canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, 64, 64)
    ctx.fillStyle = '#ffffff'
    for (let y = 4; y < 64; y += 16) ctx.fillRect(0, y, 64, 7)
  })
}

/** 겉모습 + 옷장 옷 번호로 3D 미니미를 만든다 */
export function buildAvatar3D(look: AvatarLook, outfit = 0): Avatar3D {
  const swap = OUTFITS[outfit % OUTFITS.length] ?? {}
  const topColor = swap.t ?? look.topColor
  const bottomColor = swap.j ?? look.bottomColor
  const skin = mat(look.skin, { rough: 0.5 })
  const skinShade = mat(tint(look.skin, -0.04), { rough: 0.5 })
  const stripeTex = look.top === 'stripe' ? stripeTexture(topColor) : null
  if (stripeTex) {
    stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping
    stripeTex.repeat.set(1, 2)
  }
  const topMat = stripeTex ? new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.85 }) : mat(topColor, { rough: 0.88 })
  const topDark = mat(tint(topColor, -0.12), { rough: 0.88 })
  const bottomMat = mat(bottomColor, { rough: 0.85 })
  const bottomDark = mat(tint(bottomColor, -0.1), { rough: 0.85 })
  const shoeMat = mat('#4a3f5c', { rough: 0.45 })
  const soleMat = mat('#f6f1ea', { rough: 0.7 })
  const sockMat = mat('#ffffff', { rough: 0.9 })
  const longSleeve = look.top !== 'tee'
  const bareLegs = look.bottom === 'skirt' || look.bottom === 'dress'

  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  // ─── 다리: 엉덩이 → 무릎 → 발목 ───
  const legs: THREE.Group[] = []
  const knees: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const leg = new THREE.Group()
    leg.position.set(side * 0.085, HIP_Y, 0)
    const thighMat = look.bottom === 'pants' || look.bottom === 'shorts' ? bottomMat : skin
    leg.add(part(limb(THIGH, 0.068, 0.058), thighMat, [0, 0, 0]))
    if (look.bottom === 'shorts') leg.add(part(limb(0.085, 0.076, 0.07), bottomMat, [0, 0, 0]))
    const knee = new THREE.Group()
    knee.position.y = -THIGH
    const shinMat = look.bottom === 'pants' ? bottomMat : bareLegs ? sockMat : skin
    knee.add(part(limb(SHIN, 0.056, 0.048), shinMat, [0, 0, 0]))
    if (look.bottom === 'pants') knee.add(part(torus(0.052, 0.012), bottomDark, [0, -SHIN + 0.025, 0], { rot: [Math.PI / 2, 0, 0] }))
    if (bareLegs) knee.add(part(torus(0.056, 0.01), sockMat, [0, -0.02, 0], { rot: [Math.PI / 2, 0, 0] }))
    // 신발: 둥근 앞코 + 밝은 밑창
    const foot = new THREE.Group()
    foot.position.y = -SHIN - 0.01
    foot.add(part(roundBox(0.112, 0.07, 0.185, 0.034), shoeMat, [0, -0.028, 0.035]))
    foot.add(part(roundBox(0.118, 0.03, 0.19, 0.014), soleMat, [0, -0.058, 0.035]))
    foot.add(part(cyl(0.05, 0.054, 0.035, 16), shoeMat, [0, -0.005, 0.0]))
    knee.add(foot)
    leg.add(knee)
    body.add(leg)
    legs.push(leg)
    knees.push(knee)
  }

  // ─── 몸통: 돌려 깎은 한 덩어리 (앞뒤로 살짝 납작) ───
  const torso = new THREE.Group()
  torso.scale.z = 0.8
  // 엉덩이·허리 (바지·반바지 색, 치마·원피스는 그 아래 속바지 색)
  torso.add(
    part(
      lathe('hips', [
        [0, 0.29],
        [0.1, 0.293],
        [0.152, 0.315],
        [0.168, 0.36],
        [0.166, 0.42],
        [0.16, 0.45],
        [0, 0.455],
      ]),
      bottomMat,
      [0, 0, 0],
    ),
  )
  // 윗옷: 어깨는 둥글게, 아랫단은 바지 위로 살짝 덮는다
  torso.add(
    part(
      lathe('shirt', [
        [0, 0.4],
        [0.165, 0.401],
        [0.179, 0.41],
        [0.178, 0.43],
        [0.168, 0.48],
        [0.163, 0.53],
        [0.165, 0.575],
        [0.152, 0.62],
        [0.12, 0.652],
        [0.075, 0.668],
        [0, 0.672],
      ]),
      topMat,
    ),
  )
  if (look.bottom === 'skirt')
    torso.add(
      part(
        lathe(
          'skirt',
          [
            [0, 0.275],
            [0.236, 0.262],
            [0.262, 0.254],
            [0.268, 0.268],
            [0.236, 0.33],
            [0.196, 0.4],
            [0.176, 0.432],
            [0.168, 0.448],
            [0, 0.452],
          ],
          { top: 0.43, hem: 0.26, n: 14, amp: 0.045 },
        ),
        bottomMat,
      ),
    )
  if (look.bottom === 'dress')
    torso.add(
      part(
        // 윗몸은 셔츠보다 살짝 크게 덮고(어깨선 아래까지), 허리에서 퍼진다
        lathe(
          'dress',
          [
            [0, 0.25],
            [0.24, 0.24],
            [0.275, 0.232],
            [0.282, 0.248],
            [0.236, 0.33],
            [0.2, 0.4],
            [0.186, 0.44],
            [0.184, 0.47],
            [0.176, 0.52],
            [0.172, 0.565],
            [0.164, 0.592],
            [0.14, 0.606],
            [0, 0.61],
          ],
          { top: 0.44, hem: 0.24, n: 12, amp: 0.04 },
        ),
        bottomMat,
      ),
    )
  if (look.bottom === 'pants' || look.bottom === 'shorts') {
    // 허리 밴드 · 단추
    torso.add(part(torus(0.168, 0.012), bottomDark, [0, 0.446, 0], { rot: [Math.PI / 2, 0, 0] }))
  }
  if (look.top === 'hoodie') {
    // 등 뒤 모자 · 앞주머니 · 끈 · 밑단
    torso.add(part(sphere(0.13, 20, 14), topDark, [0, 0.635, -0.11], { scale: [1.25, 0.72, 0.8] }))
    torso.add(part(roundBox(0.2, 0.09, 0.02, 0.01), topDark, [0, 0.475, 0.163]))
    for (const x of [-0.035, 0.035]) {
      torso.add(part(cyl(0.006, 0.006, 0.1, 6), mat('#ffffff'), [x, 0.6, 0.183]))
      torso.add(part(sphere(0.011, 8, 6), mat('#ffffff'), [x, 0.55, 0.183]))
    }
    torso.add(part(torus(0.172, 0.016), topDark, [0, 0.415, 0], { rot: [Math.PI / 2, 0, 0] }))
  } else {
    // 동그란 깃
    torso.add(part(torus(0.078, 0.016), topDark, [0, 0.66, 0.005], { rot: [Math.PI / 2 - 0.2, 0, 0] }))
  }
  body.add(torso)
  // 목
  body.add(part(cyl(0.048, 0.056, 0.09, 16), skinShade, [0, 0.68, 0]))

  // ─── 팔: 어깨 → 팔꿈치 → 손 ───
  const arms: THREE.Group[] = []
  const elbows: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const arm = new THREE.Group()
    arm.position.set(side * 0.165, SHOULDER_Y, 0)
    arm.add(part(limb(UPPER_ARM, 0.05, 0.044), longSleeve ? topMat : skin))
    if (!longSleeve) arm.add(part(limb(0.07, 0.062, 0.058), topMat, [0, 0.005, 0]))
    const elbow = new THREE.Group()
    elbow.position.y = -UPPER_ARM
    elbow.add(part(limb(FOREARM, 0.043, 0.037), longSleeve ? topMat : skin))
    if (longSleeve) elbow.add(part(torus(0.04, 0.012), topDark, [0, -FOREARM + 0.01, 0], { rot: [Math.PI / 2, 0, 0] }))
    // 손: 벙어리장갑 모양 + 엄지
    const hand = new THREE.Group()
    hand.position.y = -FOREARM - 0.035
    hand.add(part(sphere(0.046, 16, 12), skin, [0, 0, 0], { scale: [0.82, 1.05, 0.72] }))
    hand.add(part(sphere(0.019, 10, 8), skin, [-side * 0.012, 0.012, 0.03]))
    elbow.add(hand)
    arm.add(elbow)
    body.add(arm)
    arms.push(arm)
    elbows.push(elbow)
  }

  // ─── 머리 ───
  const head = new THREE.Group()
  head.position.y = HEAD_Y
  head.add(part(headGeo(), skin))
  // 귀
  for (const s of [-1, 1]) head.add(part(sphere(0.052, 14, 10), skin, [s * HEAD_R * 1.08, -0.04, -0.01], { scale: [0.55, 1, 0.9] }))
  // 코: 아주 작게
  head.add(part(sphere(0.016, 10, 8), skinShade, [0, -0.085, 0.296], { scale: [1.2, 0.85, 0.7] }))
  // 얼굴 그림 (뜬 눈 · 감은 눈 두 장을 번갈아)
  const faceOpen = drawFace(look, false)
  const faceClosed = drawFace(look, true)
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceOpen,
    transparent: true,
    roughness: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  })
  head.add(part(faceGeo(), faceMat, [0, 0, 0], { shadow: false }))
  if (look.eyes === 'shades') {
    const lens = mat('#1d1a26', { rough: 0.12, metal: 0.4 })
    const s = group(
      part(roundBox(0.15, 0.09, 0.03, 0.025), lens, [-0.105, 0, 0], { shadow: false, rot: [0, -0.25, 0] }),
      part(roundBox(0.15, 0.09, 0.03, 0.025), lens, [0.105, 0, 0], { shadow: false, rot: [0, 0.25, 0] }),
      part(roundBox(0.06, 0.016, 0.02, 0.006), lens, [0, 0.02, 0.01], { shadow: false }),
    )
    s.position.set(0, -0.02, HEAD_R * 1.0)
    head.add(s)
  }
  const hatOn = look.hat === 'cap' || look.hat === 'beanie' || look.hat === 'bear'
  const hg = hairGeos(look.hair, look.hat)
  if (hg.base) head.add(part(hg.base, mat(look.hairColor, { rough: 0.48 })))
  if (hg.hi) head.add(part(hg.hi, mat(tint(look.hairColor, 0.04), { rough: 0.44 })))
  if (look.hat !== 'none') head.add(hat(look))
  body.add(head)

  root.traverse((n) => {
    if ((n as THREE.Mesh).isMesh && n.castShadow) n.receiveShadow = false
  })

  const height =
    HEAD_Y +
    HEAD_R +
    (look.hat === 'beanie' ? 0.2 : look.hat === 'bear' ? 0.16 : look.hair === 'bun' && !hatOn ? 0.15 : look.hair === 'short' && !hatOn ? 0.14 : 0.05)

  // 깜빡임 박자는 미니미마다 조금씩 다르게
  const seed = (look.hairColor.charCodeAt(2) + look.skin.charCodeAt(3)) % 17
  let shut = false

  const animate: Avatar3D['animate'] = ({ walking, pose, t, speed = 1, knee }) => {
    const seated = pose === 'sit' || pose === 'watch' || pose === 'floor' || pose === 'bath'
    body.position.set(0, 0, 0)
    body.rotation.set(0, 0, 0)
    head.position.set(0, HEAD_Y, 0)
    head.rotation.set(0, 0, 0)
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1
      legs[i].rotation.set(0, 0, 0)
      knees[i].rotation.set(0, 0, 0)
      arms[i].rotation.set(0, 0, side * 0.1)
      elbows[i].rotation.set(-0.12, 0, 0)
    }

    if (walking) {
      const w = t * 9 * speed
      const s = Math.sin(w)
      legs[0].rotation.x = s * 0.55
      legs[1].rotation.x = -s * 0.55
      // 뒤로 차는 다리만 무릎이 접힌다
      knees[0].rotation.x = Math.max(0, Math.sin(w + 1.3)) * 0.75
      knees[1].rotation.x = Math.max(0, -Math.sin(w + 1.3)) * 0.75
      arms[0].rotation.x = -s * 0.6
      arms[1].rotation.x = s * 0.6
      elbows[0].rotation.x = -0.3 - Math.max(0, -s) * 0.4
      elbows[1].rotation.x = -0.3 - Math.max(0, s) * 0.4
      body.position.y = Math.abs(Math.cos(w)) * 0.04
      body.rotation.z = s * 0.035
      body.rotation.x = 0.05
      head.rotation.z = -s * 0.03
    } else if (pose === 'dance') {
      const w = t * 7
      body.position.y = Math.abs(Math.sin(w)) * 0.08
      body.rotation.y = Math.sin(w * 0.5) * 0.5
      body.rotation.z = Math.sin(w) * 0.1
      knees[0].rotation.x = knees[1].rotation.x = Math.abs(Math.sin(w)) * 0.35
      legs[0].rotation.x = legs[1].rotation.x = -Math.abs(Math.sin(w)) * 0.2
      arms[0].rotation.set(-2.5 + Math.sin(w) * 0.4, 0, -0.35)
      arms[1].rotation.set(-2.5 - Math.sin(w) * 0.4, 0, 0.35)
      elbows[0].rotation.x = elbows[1].rotation.x = -0.6
      head.rotation.z = Math.sin(w) * 0.12
    } else if (pose === 'lie') {
      // 반듯이 누워 이불 속으로: 등이 바닥(발밑 높이)에 닿고, 머리는 베개만큼 들린다
      body.rotation.x = -Math.PI / 2
      body.position.y = BACK
      head.position.z = 0.28
      head.rotation.x = 0.15
      arms[0].rotation.z = -0.18
      arms[1].rotation.z = 0.18
      elbows[0].rotation.x = elbows[1].rotation.x = -0.2
      head.rotation.z = Math.sin(t * 0.6) * 0.04
      body.position.y += Math.sin(t * 1.4) * 0.006
    } else {
      // 숨쉬기
      body.position.y = Math.sin(t * 2.2) * 0.006
      head.rotation.z = Math.sin(t * 0.9) * 0.04
      arms[0].rotation.z = -0.1 - Math.sin(t * 2.2) * 0.02
      arms[1].rotation.z = 0.1 + Math.sin(t * 2.2) * 0.02
    }

    if (seated) {
      // 엉덩이 바닥이 발밑 높이(0)에 오도록 몸을 내린다. 허벅지는 앞으로, 무릎은 자리에 맞게
      const k = pose === 'sit' ? (knee ?? 1.2) : pose === 'bath' ? 0.55 : 0.4
      body.position.y = -BUTT + Math.sin(t * 2.2) * 0.004
      body.rotation.x = 0
      legs[0].rotation.set(-Math.PI / 2 + 0.06, 0, -0.08)
      legs[1].rotation.set(-Math.PI / 2 + 0.06, 0, 0.08)
      knees[0].rotation.x = knees[1].rotation.x = k
      // 손은 무릎 위에
      arms[0].rotation.set(-0.55, 0, -0.12)
      arms[1].rotation.set(-0.55, 0, 0.12)
      elbows[0].rotation.x = elbows[1].rotation.x = -0.55
      if (pose === 'watch') head.rotation.x = -0.08
      if (pose === 'bath') {
        // 욕조 가장자리에 팔을 걸친다
        arms[0].rotation.set(-0.2, 0, -0.9)
        arms[1].rotation.set(-0.2, 0, 0.9)
        elbows[0].rotation.x = elbows[1].rotation.x = -0.3
        head.rotation.x = -0.12
      }
    }
    if (pose === 'back') {
      // 쓰는 동안 손을 앞으로
      arms[0].rotation.x = -1 + Math.sin(t * 6) * 0.15
      arms[1].rotation.x = -1 - Math.sin(t * 6) * 0.15
      elbows[0].rotation.x = elbows[1].rotation.x = -0.6
    }
    if (pose === 'stand') {
      arms[0].rotation.x = arms[1].rotation.x = -0.25
      elbows[0].rotation.x = elbows[1].rotation.x = -0.7
    }

    // 깜빡: 3~5초마다 0.12초, 잘 때는 계속 감는다
    const period = 3.4 + (seed % 5) * 0.35
    const closed = pose === 'lie' || (t + seed) % period < 0.12
    if (closed !== shut) {
      shut = closed
      faceMat.map = closed ? faceClosed : faceOpen
    }
  }

  return {
    root,
    height,
    animate,
    dispose() {
      faceOpen.dispose()
      faceClosed.dispose()
      faceMat.dispose()
      if (stripeTex) {
        stripeTex.dispose()
        topMat.dispose()
      }
    },
  }
}
