/**
 * 3D 미니미: 큰 머리 2.3등신 장난감 인형. 미니미 만들기에서 고른 머리·눈·옷·모자·색을 그대로 쓴다.
 * 발바닥이 원점, 얼굴은 +z 쪽. 키 약 1.25m.
 */
import * as THREE from 'three'
import type { AvatarLook } from '../art/avatar'
import { OUTFITS } from '../art/poses'
import type { Pose } from '../lib/interactions'
import { canvasTexture, capsule, cone, cyl, group, mat, part, roundBox, sphere, tint, torus } from './kit'

const INK = '#2b2233'
const HEAD_R = 0.3
const NECK_Y = 0.66
const HEAD_Y = NECK_Y + 0.27
const HIP_Y = 0.36
const SHOULDER_Y = 0.62

export interface Avatar3D {
  root: THREE.Group
  /** 머리 꼭대기 높이 (이름표 자리) */
  height: number
  /** 매 프레임: 걷는 중인지, 지금 자세, 시간(초) */
  animate(state: { walking: boolean; pose: Pose | null; t: number; speed?: number }): void
  dispose(): void
}

/** 반구 모양 머리카락 덮개 (뒤로 기울여 앞머리는 높게, 뒷머리는 낮게) */
function hairCap(color: string, r: number, theta: number, tilt: number) {
  const g = new THREE.SphereGeometry(r, 32, 18, 0, Math.PI * 2, 0, theta)
  const m = part(g, mat(color, { rough: 0.6 }))
  m.rotation.x = -tilt
  return m
}

function eyes(kind: AvatarLook['eyes']) {
  const g = new THREE.Group()
  const black = mat(INK, { rough: 0.25 })
  const white = mat('#ffffff', { rough: 0.3 })
  const z = HEAD_R * 0.92
  const y = -0.02
  const round = (x: number) => {
    const e = group(
      part(sphere(0.048, 16, 12), black, [0, 0, 0], { scale: [1, 1.15, 0.55], shadow: false }),
      part(sphere(0.016, 8, 6), white, [0.016, 0.022, 0.024], { shadow: false }),
    )
    e.position.set(x, y, z - 0.012)
    e.lookAt(x * 2.4, y, 2)
    return e
  }
  const arc = (x: number, up: boolean) => {
    const a = part(torus(0.04, 0.011, Math.PI), black, [x, y - 0.01, z], { shadow: false })
    a.lookAt(x * 2.4, y, 2)
    a.rotateZ(up ? 0 : Math.PI)
    return a
  }
  if (kind === 'round') g.add(round(-0.105), round(0.105))
  else if (kind === 'dot') {
    for (const x of [-0.1, 0.1]) {
      const d = part(sphere(0.026, 12, 8), black, [x, y, z + 0.004], { shadow: false })
      g.add(d)
    }
  } else if (kind === 'smile') g.add(arc(-0.105, true), arc(0.105, true))
  else if (kind === 'wink') g.add(round(-0.105), arc(0.105, true))
  else if (kind === 'shades') {
    const s = group(
      part(roundBox(0.14, 0.085, 0.03, 0.02), mat('#1d1a26', { rough: 0.15, metal: 0.3 }), [-0.09, 0, 0], { shadow: false }),
      part(roundBox(0.14, 0.085, 0.03, 0.02), mat('#1d1a26', { rough: 0.15, metal: 0.3 }), [0.09, 0, 0], { shadow: false }),
      part(roundBox(0.06, 0.016, 0.02, 0.006), mat('#1d1a26'), [0, 0.02, 0], { shadow: false }),
    )
    s.position.set(0, y + 0.005, z + 0.02)
    g.add(s)
  }
  // 볼터치 · 입
  const blush = mat('#ff8fa8', { rough: 0.9, opacity: 0.75 })
  g.add(part(sphere(0.045, 12, 8), blush, [-0.175, -0.085, z - 0.06], { scale: [1, 0.6, 0.3], shadow: false }))
  g.add(part(sphere(0.045, 12, 8), blush, [0.175, -0.085, z - 0.06], { scale: [1, 0.6, 0.3], shadow: false }))
  const mouth = part(torus(0.022, 0.008, Math.PI), mat('#c2415c'), [0, -0.105, 0.284], { shadow: false })
  mouth.rotation.z = Math.PI
  g.add(mouth)
  return g
}

function hair(look: AvatarLook, hatOn: boolean) {
  const c = look.hairColor
  const hi = tint(c, 0.08)
  const g = new THREE.Group()
  const m = mat(c, { rough: 0.6 })
  const bangs = () => {
    // 앞머리: 이마를 덮는 납작한 덩어리 세 개
    for (const [x, s] of [
      [-0.13, 0.11],
      [0, 0.12],
      [0.13, 0.11],
    ] as const)
      g.add(part(sphere(s, 16, 10), mat(hi, { rough: 0.6 }), [x, 0.17, 0.2], { scale: [1.1, 0.7, 0.55] }))
  }
  switch (look.hair) {
    case 'short':
      g.add(hairCap(c, HEAD_R + 0.025, 1.75, 0.45))
      bangs()
      break
    case 'bob':
      g.add(hairCap(c, HEAD_R + 0.03, 2.05, 0.5))
      bangs()
      g.add(part(sphere(0.13, 16, 12), m, [-0.27, -0.08, 0.02], { scale: [0.65, 1.35, 1] }))
      g.add(part(sphere(0.13, 16, 12), m, [0.27, -0.08, 0.02], { scale: [0.65, 1.35, 1] }))
      break
    case 'long':
      g.add(hairCap(c, HEAD_R + 0.03, 2.05, 0.5))
      bangs()
      g.add(part(roundBox(0.52, 0.62, 0.16, 0.08), m, [0, -0.3, -0.18]))
      g.add(part(capsule(0.07, 0.42), m, [-0.27, -0.24, 0.02]))
      g.add(part(capsule(0.07, 0.42), m, [0.27, -0.24, 0.02]))
      break
    case 'bun':
      g.add(hairCap(c, HEAD_R + 0.025, 1.95, 0.45))
      bangs()
      if (!hatOn) {
        g.add(part(sphere(0.12, 18, 14), m, [0, 0.33, -0.08]))
        g.add(part(torus(0.1, 0.02), mat(tint(c, -0.15)), [0, 0.27, -0.06], { rot: [Math.PI / 2 + 0.3, 0, 0] }))
      }
      break
    case 'curly': {
      g.add(hairCap(c, HEAD_R + 0.02, 1.9, 0.45))
      const n = 16
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const ring = i % 2 ? 0.75 : 1.05
        const y = 0.12 + Math.cos(ring) * 0.2
        const rr = Math.sin(ring) * (HEAD_R + 0.04)
        const z = Math.cos(a) * rr
        if (z > 0.18 && y < 0.2) continue
        // 모자를 쓰면 정수리 쪽 곱슬은 모자 속에 숨긴다
        if (hatOn && y > 0.08) continue
        g.add(part(sphere(0.095, 12, 10), i % 3 ? m : mat(hi, { rough: 0.6 }), [Math.sin(a) * rr, y, z - 0.02]))
      }
      if (!hatOn) {
        g.add(part(sphere(0.1, 12, 10), m, [0, 0.3, 0]))
        for (const x of [-0.2, -0.07, 0.07, 0.2]) g.add(part(sphere(0.085, 12, 10), m, [x, 0.2, 0.2]))
      }
      break
    }
  }
  return g
}

function hat(look: AvatarLook) {
  const c = look.hatColor
  const g = new THREE.Group()
  const m = mat(c, { rough: 0.7 })
  const dark = mat(tint(c, -0.18), { rough: 0.7 })
  switch (look.hat) {
    case 'cap': {
      const dome = new THREE.SphereGeometry(HEAD_R + 0.045, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)
      g.add(part(dome, m, [0, 0.06, -0.01], { rot: [-0.18, 0, 0] }))
      g.add(part(cyl(0.2, 0.2, 0.025, 24), dark, [0, 0.07, 0.27], { scale: [1, 1, 0.75], rot: [0.12, 0, 0] }))
      g.add(part(sphere(0.03), dark, [0, HEAD_R + 0.1, -0.06]))
      break
    }
    case 'beanie': {
      const dome = new THREE.SphereGeometry(HEAD_R + 0.05, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)
      g.add(part(dome, m, [0, 0.05, -0.02], { rot: [-0.25, 0, 0], scale: [1, 1.12, 1] }))
      g.add(part(torus(HEAD_R + 0.04, 0.05), dark, [0, 0.08, -0.01], { rot: [Math.PI / 2 - 0.25, 0, 0] }))
      g.add(part(sphere(0.08, 14, 10), mat('#ffffff'), [0, HEAD_R + 0.17, -0.1]))
      break
    }
    case 'bear': {
      const dome = new THREE.SphereGeometry(HEAD_R + 0.06, 28, 16, 0, Math.PI * 2, 0, 2.1)
      g.add(part(dome, m, [0, 0.02, -0.04], { rot: [-0.55, 0, 0] }))
      for (const x of [-0.22, 0.22]) {
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
      star.position.set(0.2, 0.2, 0.2)
      g.add(star)
      break
    }
    case 'ribbon': {
      const bow = group(
        part(cone(0.09, 0.16, 16), m, [-0.09, 0, 0], { rot: [0, 0, -Math.PI / 2], scale: [1, 1, 0.55] }),
        part(cone(0.09, 0.16, 16), m, [0.09, 0, 0], { rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.55] }),
        part(sphere(0.045), dark),
      )
      bow.position.set(0.12, 0.27, 0.06)
      bow.rotation.z = -0.35
      g.add(bow)
      break
    }
  }
  return g
}

function stripeTexture(base: string) {
  return canvasTexture(
    64,
    64,
    (ctx) => {
      ctx.fillStyle = base
      ctx.fillRect(0, 0, 64, 64)
      ctx.fillStyle = '#ffffff'
      for (let y = 4; y < 64; y += 16) ctx.fillRect(0, y, 64, 7)
    },
    [1, 1],
  )
}

/** 겉모습 + 옷장 옷 번호로 3D 미니미를 만든다 */
export function buildAvatar3D(look: AvatarLook, outfit = 0): Avatar3D {
  const swap = OUTFITS[outfit % OUTFITS.length] ?? {}
  const topColor = swap.t ?? look.topColor
  const bottomColor = swap.j ?? look.bottomColor
  const skin = mat(look.skin, { rough: 0.55 })
  const topMat =
    look.top === 'stripe'
      ? new THREE.MeshStandardMaterial({ map: stripeTexture(topColor), roughness: 0.8 })
      : mat(topColor, { rough: 0.85 })
  const topDark = mat(tint(topColor, -0.12), { rough: 0.85 })
  const bottomMat = mat(bottomColor, { rough: 0.85 })
  const shoe = mat('#3a3346', { rough: 0.5 })

  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  // 다리 (엉덩이에서 돌아간다)
  const bareLegs = look.bottom === 'skirt' || look.bottom === 'dress'
  const legs: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const leg = new THREE.Group()
    leg.position.set(side * 0.085, HIP_Y, 0)
    const upper = look.bottom === 'shorts' ? bottomMat : bareLegs ? skin : bottomMat
    leg.add(part(capsule(0.065, 0.16), upper, [0, -0.13, 0]))
    if (look.bottom === 'shorts') leg.add(part(capsule(0.058, 0.08), skin, [0, -0.22, 0]))
    leg.add(part(roundBox(0.13, 0.08, 0.19, 0.035), shoe, [0, -HIP_Y + 0.04, 0.025]))
    body.add(leg)
    legs.push(leg)
  }

  // 몸통
  const torsoGroup = new THREE.Group()
  torsoGroup.add(part(roundBox(0.38, 0.32, 0.26, 0.11), topMat, [0, 0.5, 0]))
  if (look.bottom === 'pants' || look.bottom === 'shorts') torsoGroup.add(part(roundBox(0.36, 0.1, 0.25, 0.05), bottomMat, [0, HIP_Y + 0.02, 0]))
  if (look.bottom === 'skirt') torsoGroup.add(part(cyl(0.17, 0.27, 0.2, 24), bottomMat, [0, HIP_Y - 0.03, 0]))
  if (look.bottom === 'dress') torsoGroup.add(part(cyl(0.17, 0.3, 0.32, 24), bottomMat, [0, HIP_Y + 0.03, 0]))
  if (look.top === 'hoodie') {
    torsoGroup.add(part(torus(0.15, 0.05), topDark, [0, NECK_Y - 0.02, -0.04], { rot: [Math.PI / 2 + 0.25, 0, 0] }))
    torsoGroup.add(part(roundBox(0.2, 0.08, 0.04, 0.02), topDark, [0, 0.44, 0.13]))
    torsoGroup.add(part(cyl(0.008, 0.008, 0.12, 6), mat('#ffffff'), [-0.04, 0.58, 0.135]))
    torsoGroup.add(part(cyl(0.008, 0.008, 0.12, 6), mat('#ffffff'), [0.04, 0.58, 0.135]))
  }
  body.add(torsoGroup)

  // 팔 (어깨에서 돌아간다)
  const arms: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const arm = new THREE.Group()
    arm.position.set(side * 0.215, SHOULDER_Y, 0)
    arm.rotation.z = side * 0.12
    arm.add(part(capsule(0.055, 0.14), topMat, [0, -0.1, 0]))
    arm.add(part(sphere(0.058, 14, 10), skin, [0, -0.22, 0]))
    body.add(arm)
    arms.push(arm)
  }

  // 머리
  const head = new THREE.Group()
  head.position.y = HEAD_Y
  head.add(part(sphere(HEAD_R, 32, 24), skin, [0, 0, 0], { scale: [1.04, 0.98, 1] }))
  // 귀
  head.add(part(sphere(0.055, 12, 10), skin, [-HEAD_R * 1.01, -0.03, 0], { scale: [0.6, 1, 1] }))
  head.add(part(sphere(0.055, 12, 10), skin, [HEAD_R * 1.01, -0.03, 0], { scale: [0.6, 1, 1] }))
  const hatOn = look.hat === 'cap' || look.hat === 'beanie' || look.hat === 'bear'
  head.add(eyes(look.eyes))
  head.add(hair(look, hatOn))
  if (look.hat !== 'none') head.add(hat(look))
  body.add(head)

  root.traverse((n) => {
    if ((n as THREE.Mesh).isMesh) {
      n.castShadow = true
      n.receiveShadow = false
    }
  })

  const height = HEAD_Y + HEAD_R + (look.hat === 'beanie' ? 0.2 : look.hat === 'bear' ? 0.16 : look.hair === 'bun' ? 0.12 : 0.06)

  const animate: Avatar3D['animate'] = ({ walking, pose, t, speed = 1 }) => {
    const sitting = pose === 'sit' || pose === 'watch' || pose === 'floor' || pose === 'bath'
    let swing = 0
    let bob = 0
    body.position.set(0, 0, 0)
    body.rotation.set(0, 0, 0)
    head.rotation.set(0, 0, 0)
    if (walking) {
      const w = t * 9 * speed
      swing = Math.sin(w) * 0.65
      bob = Math.abs(Math.cos(w)) * 0.045
      body.rotation.z = Math.sin(w) * 0.04
    } else if (pose === 'dance') {
      const w = t * 7
      bob = Math.abs(Math.sin(w)) * 0.09
      body.rotation.y = Math.sin(w * 0.5) * 0.5
      body.rotation.z = Math.sin(w) * 0.12
      arms[0].rotation.x = -2.4 + Math.sin(w) * 0.5
      arms[1].rotation.x = -2.4 - Math.sin(w) * 0.5
    } else {
      // 숨쉬기
      bob = Math.sin(t * 2.2) * 0.008
      head.rotation.z = Math.sin(t * 0.9) * 0.04
    }
    body.position.y = bob
    legs[0].rotation.set(swing, 0, 0)
    legs[1].rotation.set(-swing, 0, 0)
    if (pose !== 'dance') {
      arms[0].rotation.x = -swing * 0.8
      arms[1].rotation.x = swing * 0.8
    }
    if (sitting) {
      // 앉으면 다리를 앞으로 뻗고 몸을 엉덩이 높이만큼 내린다
      legs[0].rotation.x = -Math.PI / 2
      legs[1].rotation.x = -Math.PI / 2
      body.position.y = -HIP_Y + 0.06
      arms[0].rotation.x = -0.5
      arms[1].rotation.x = -0.5
      if (pose === 'watch') head.rotation.x = -0.08
    }
    if (pose === 'lie') {
      legs[0].rotation.x = 0
      legs[1].rotation.x = 0
      arms[0].rotation.x = 0
      arms[1].rotation.x = 0
    }
    if (pose === 'back' || pose === 'stand') {
      // 쓰는 동안 손을 앞으로
      if (pose === 'back') {
        arms[0].rotation.x = -1 + Math.sin(t * 6) * 0.15
        arms[1].rotation.x = -1 - Math.sin(t * 6) * 0.15
      }
    }
  }

  return {
    root,
    height,
    animate,
    dispose() {
      if (look.top === 'stripe') {
        ;(topMat as THREE.MeshStandardMaterial).map?.dispose()
        topMat.dispose()
      }
      root.traverse((n) => {
        const m = n as THREE.Mesh
        // 머리카락 덮개만 따로 만든 모양이다 (나머지는 캐시)
        if (m.isMesh && m.geometry.type === 'SphereGeometry' && (m.geometry as THREE.SphereGeometry).parameters.thetaLength < Math.PI)
          m.geometry.dispose()
      })
    },
  }
}
