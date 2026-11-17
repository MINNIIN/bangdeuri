/**
 * 방들이오락실 3D. 안: 어두운 방에 게임기 화면·네온·전구가 빛나고 깜빡인다 (tick). 골목 건물: 노란 벽 + 빨간 간판 + 입구 옆 작은 인형뽑기.
 * 누를 수 있는 것마다 보이지 않는 누름 상자에 key(arcade/…)를 붙인다.
 */
import * as THREE from 'three'
import {
  ARCADE_SHOP,
  CLAW_X,
  CLAW_Z,
  COIN,
  GACHA,
  HOCKEY,
  PRIZE,
  PUNCH,
  RACE_CAB_X,
  RACE_SEAT_X,
  RACE_Z,
  RHYTHM,
} from '../../lib/shop/arcade'
import { bakeStatic, box, cone, cyl, mat, part, roundBox, sphere, torus } from '../kit'
import type { PlaceAnims } from '../places3d'
import { type ShopArt, shopFront, shopKit, shopRoom } from './common'

const DEF = ARCADE_SHOP
const TOY = ['#ff8fb8', '#ffd94a', '#7fd0ff', '#b48cff', '#ffffff', '#ff8a3d', '#59c26b']

function interior() {
  const g = new THREE.Group()
  const owned: { dispose(): void }[] = []
  // 오락실 카펫: 어두운 남색에 알록달록 별·동그라미
  shopRoom(
    DEF,
    {
      floor: (ctx, w, h) => {
        ctx.fillStyle = '#2a2448'
        ctx.fillRect(0, 0, w, h)
        const dots: [number, number, string][] = [
          [18, 22, '#ff5ab4'],
          [80, 14, '#3fe0ff'],
          [52, 60, '#ffd94a'],
          [110, 76, '#ff5ab4'],
          [24, 98, '#3fe0ff'],
          [76, 112, '#9dff6a'],
        ]
        for (const [x, y, c] of dots) {
          ctx.fillStyle = c
          ctx.beginPath()
          ctx.arc(x, y, 5, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.strokeStyle = '#ffd94a'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(96, 34)
        ctx.lineTo(108, 46)
        ctx.moveTo(108, 34)
        ctx.lineTo(96, 46)
        ctx.moveTo(38, 70)
        ctx.lineTo(46, 82)
        ctx.stroke()
      },
      wall: '#3a2c5c',
      trim: '#ff4fa8',
      matText: '또 놀러 와요',
      matColor: '#ff4f3d',
      frame: '#2b2233',
    },
    g,
    owned,
  )
  const { tex, texMat, label, glow, hit } = shopKit(g, owned)
  const W = DEF.hw
  const D = DEF.hd
  const dark = mat('#2b2233', { rough: 0.5 })
  const chrome = mat('#c9ced6', { metal: 0.6, rough: 0.3 })
  const glass = mat('#d8f3ff', { rough: 0.05, opacity: 0.22 })
  /** 깜빡이는 것들 */
  const bulbA = glow('#fff3a8', 1.6)
  const bulbB = glow('#ff9a3d', 0.3)

  // ─── 벽 위 네온 간판 · 네온 줄 ───
  const signMat = texMat(label('방들이오락실', '#2b2233', '#ff6ad5', 512, 80, 54), { glow: 1.3 })
  g.add(part(box(3.4, 0.55, 0.05), signMat, [-1.4, 2.55, -D + 0.04], { shadow: false }))
  const neonPink = glow('#ff4fa8', 1.4)
  const neonCyan = glow('#3fe0ff', 1.4)
  g.add(part(box(W * 2 - 0.2, 0.05, 0.05), neonPink, [0, 2.92, -D + 0.08], { shadow: false }))
  g.add(part(box(0.05, 0.05, D * 2 - 0.2), neonCyan, [-W + 0.08, 2.92, 0], { shadow: false }))
  // 서쪽 벽 포스터 (가짜 게임)
  g.add(part(box(0.04, 0.8, 0.6), texMat(label('붕붕레이서', '#5aa9e6', '#ffffff', 128, 160, 26), { glow: 0.3 }), [-W + 0.03, 2.1, -2.2]))
  g.add(part(box(0.04, 0.8, 0.6), texMat(label('최고점 987', '#ffd94a', '#2b2233', 128, 160, 24), { glow: 0.3 }), [-W + 0.03, 2.1, 2.3]))

  // ─── 인형뽑기 두 대 (집게왕) ───
  const claws: THREE.Group[] = []
  const clawBodies = ['#ff5a7a', '#ff8a3d']
  for (const [i, cx] of CLAW_X.entries()) {
    const zc = CLAW_Z
    const body = mat(clawBodies[i], { rough: 0.5 })
    // 아래 몸통 · 경품 나오는 곳 · 조작판
    g.add(part(roundBox(1.0, 0.95, 0.9, 0.05), body, [cx, 0.475, zc]))
    g.add(part(box(0.32, 0.3, 0.04), dark, [cx - 0.24, 0.35, zc + 0.45]))
    g.add(part(box(0.9, 0.08, 0.22), mat('#ffffff', { rough: 0.5 }), [cx, 0.99, zc + 0.36], { rot: [0.25, 0, 0] }))
    g.add(part(cyl(0.02, 0.02, 0.12, 8), chrome, [cx - 0.15, 1.08, zc + 0.36]))
    g.add(part(sphere(0.045, 10, 8), mat('#ff3b30', { rough: 0.3 }), [cx - 0.15, 1.15, zc + 0.36]))
    g.add(part(cyl(0.05, 0.05, 0.04, 12), glow('#3fe0ff', 1.0), [cx + 0.18, 1.05, zc + 0.38]))
    // 유리 상자 + 기둥
    g.add(part(box(0.94, 0.95, 0.84), glass, [cx, 1.45, zc], { shadow: false }))
    for (const [dx, dz] of [
      [-0.47, -0.42],
      [0.47, -0.42],
      [-0.47, 0.42],
      [0.47, 0.42],
    ] as const)
      g.add(part(box(0.05, 0.95, 0.05), body, [cx + dx, 1.45, zc + dz]))
    // 인형 더미 (곰돌이: 몸 + 머리 + 귀)
    for (let k = 0; k < 7; k++) {
      const c = TOY[(k * 2 + i) % TOY.length]
      const x = cx - 0.3 + (k % 4) * 0.2 + (k > 3 ? 0.1 : 0)
      const z = zc - 0.2 + (k > 3 ? 0.25 : 0) + (k % 2) * 0.05
      const y = 1.02 + (k > 3 ? 0.06 : 0)
      const m = mat(c, { rough: 0.9 })
      g.add(part(sphere(0.09, 10, 8), m, [x, y, z], { scale: [1, 0.8, 1], shadow: false }))
      g.add(part(sphere(0.07, 10, 8), m, [x, y + 0.11, z + 0.02], { shadow: false }))
      g.add(part(sphere(0.025, 6, 4), m, [x - 0.05, y + 0.17, z + 0.02], { shadow: false }))
      g.add(part(sphere(0.025, 6, 4), m, [x + 0.05, y + 0.17, z + 0.02], { shadow: false }))
    }
    // 위 간판 + 전구
    g.add(part(roundBox(1.02, 0.36, 0.92, 0.05), body, [cx, 2.1, zc]))
    g.add(part(box(0.8, 0.22, 0.02), texMat(label('집게왕', '#2b2233', '#ffd94a', 256, 72, 44), { glow: 0.9 }), [cx, 2.1, zc + 0.465], { shadow: false }))
    for (let k = 0; k < 6; k++) g.add(part(sphere(0.03, 8, 6), k % 2 ? bulbA : bulbB, [cx - 0.42 + k * 0.168, 1.94, zc + 0.47], { shadow: false }))
    // 집게 (움직인다: 이름 붙여 굽지 않게)
    const claw = new THREE.Group()
    claw.name = 'claw'
    claw.add(part(box(0.9, 0.03, 0.03), chrome, [0, 0.27, 0], { shadow: false }))
    claw.add(part(cyl(0.012, 0.012, 0.25, 6), chrome, [0, 0.14, 0], { shadow: false }))
    claw.add(part(cyl(0.05, 0.04, 0.06, 10), mat('#ffd94a', { rough: 0.4 }), [0, 0.0, 0], { shadow: false }))
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2
      claw.add(part(box(0.018, 0.13, 0.018), chrome, [Math.cos(a) * 0.04, -0.08, Math.sin(a) * 0.04], { rot: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], shadow: false }))
    }
    claw.position.set(cx, 1.62, zc)
    claw.userData.home = cx
    g.add(claw)
    claws.push(claw)
    hit(`arcade/claw:${i}`, cx, zc + 0.05, 1.05, 2.3, 1.0)
  }

  // ─── 리듬게임 (둠칫스텝) + 앞 발판 ───
  const pads: THREE.MeshStandardMaterial[] = []
  let scr: THREE.Texture | null = null
  {
    const { x: cx, z: zc } = RHYTHM
    const body = mat('#b48cff', { rough: 0.5 })
    g.add(part(roundBox(1.2, 2.1, 0.9, 0.06), body, [cx, 1.05, zc]))
    // 화면: 떨어지는 화살표
    scr = tex(192, 160, (ctx, w, h) => {
      ctx.fillStyle = '#16122c'
      ctx.fillRect(0, 0, w, h)
      const cols = ['#ff5ab4', '#3fe0ff', '#9dff6a', '#ffd94a']
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = cols[c]
        for (let r = 0; r < 3; r++) {
          const x = 24 + c * 46
          const y = 30 + ((r * 53 + c * 29) % 120)
          ctx.beginPath()
          ctx.moveTo(x, y - 10)
          ctx.lineTo(x + 12, y + 6)
          ctx.lineTo(x - 12, y + 6)
          ctx.fill()
        }
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 14, w, 3)
    })
    scr.wrapT = THREE.RepeatWrapping
    const scrMat = texMat(scr, { glow: 1.1 })
    g.add(part(new THREE.PlaneGeometry(0.85, 0.7), scrMat, [cx, 1.45, zc + 0.455], { shadow: false, name: 'rhythmScreen' }))
    g.add(part(box(0.95, 0.06, 0.06), dark, [cx, 1.83, zc + 0.46]))
    // 스피커 둘
    for (const dx of [-0.45, 0.45]) {
      g.add(part(cyl(0.11, 0.11, 0.04, 14), dark, [cx + dx, 0.7, zc + 0.46], { rot: [Math.PI / 2, 0, 0] }))
      g.add(part(cyl(0.05, 0.05, 0.05, 10), mat('#5c5470'), [cx + dx, 0.7, zc + 0.47], { rot: [Math.PI / 2, 0, 0] }))
    }
    g.add(part(box(1.0, 0.26, 0.04), texMat(label('둠칫스텝', '#2b2233', '#9dff6a', 256, 64, 40), { glow: 1.0 }), [cx, 2.0, zc + 0.46], { shadow: false }))
    // 발판 (바닥에 붙어 있어 밟고 선다)
    const pz = zc + 0.45 + 0.75
    g.add(part(box(1.0, 0.06, 0.95), mat('#c9ced6', { metal: 0.4, rough: 0.4 }), [cx, 0.03, pz], { shadow: false }))
    const arrows: [number, number, string][] = [
      [-0.27, 0, '#ff5ab4'],
      [0.27, 0, '#3fe0ff'],
      [0, -0.27, '#9dff6a'],
      [0, 0.27, '#ffd94a'],
    ]
    for (const [dx, dz, c] of arrows) {
      const m = glow(c, 0.3)
      pads.push(m)
      g.add(part(box(0.24, 0.02, 0.24), m, [cx + dx, 0.07, pz + dz], { shadow: false }))
    }
    hit('arcade/rhythm', cx, zc + 0.05, 1.25, 2.2, 1.0)
  }

  // ─── 펀치기 (꽝꽝펀치) ───
  const bag = new THREE.Group()
  bag.name = 'bag'
  {
    const { x: cx, z: zc } = PUNCH
    const body = mat('#ff8a3d', { rough: 0.5 })
    g.add(part(roundBox(0.8, 1.9, 0.7, 0.06), body, [cx, 0.95, zc]))
    g.add(part(box(0.6, 0.3, 0.03), texMat(label('987', '#16122c', '#ff4f3d', 192, 96, 70), { glow: 1.3 }), [cx, 1.65, zc + 0.36], { shadow: false }))
    g.add(part(box(0.7, 0.2, 0.03), texMat(label('꽝꽝펀치', '#2b2233', '#ffd94a', 256, 64, 40), { glow: 0.9 }), [cx, 2.05, zc + 0.36], { shadow: false }))
    g.add(part(roundBox(0.84, 0.2, 0.3, 0.04), body, [cx, 2.05, zc + 0.2]))
    // 샌드백 (팔에 매달려 앞으로 나와 있다)
    bag.add(part(box(0.06, 0.06, 0.3), chrome, [0, 0, 0.15], { shadow: false }))
    bag.add(part(sphere(0.18, 14, 10), mat('#ff3b30', { rough: 0.35 }), [0, -0.12, 0.34], { scale: [1, 1.15, 0.85] }))
    bag.add(part(cyl(0.12, 0.12, 0.03, 14), mat('#ffffff', { rough: 0.4 }), [0, -0.12, 0.49], { rot: [Math.PI / 2, 0, 0], shadow: false }))
    bag.position.set(cx, 1.3, zc + 0.35)
    g.add(bag)
    g.add(part(box(0.5, 0.3, 0.05), dark, [cx, 0.5, zc + 0.36]))
    hit('arcade/punch', cx, zc + 0.15, 0.9, 2.1, 1.0)
  }

  // ─── 경품 진열장 (구경만) ───
  {
    const { x: cx, z: zc } = PRIZE
    // 뒤판 · 옆판 · 지붕 (앞은 트여 있어 경품이 보인다)
    const shelf = mat('#fff3d6', { rough: 0.6 })
    g.add(part(box(1.5, 1.7, 0.06), shelf, [cx, 0.85, zc - 0.245]))
    for (const dx of [-0.73, 0.73]) g.add(part(box(0.05, 1.7, 0.55), shelf, [cx + dx, 0.85, zc]))
    g.add(part(box(1.5, 0.06, 0.55), shelf, [cx, 1.69, zc]))
    g.add(part(box(1.5, 0.15, 0.55), mat('#ff8a1f', { rough: 0.6 }), [cx, 0.075, zc]))
    for (let r = 0; r < 3; r++) {
      const y = 0.4 + r * 0.5
      g.add(part(box(1.4, 0.03, 0.5), mat('#ffffff'), [cx, y, zc + 0.02]))
      for (let k = 0; k < 4; k++) {
        const c = TOY[(k + r * 3) % TOY.length]
        const x = cx - 0.5 + k * 0.33
        if ((k + r) % 2) g.add(part(roundBox(0.2, 0.24, 0.18, 0.03), mat(c, { rough: 0.5 }), [x, y + 0.14, zc + 0.05]))
        else {
          g.add(part(sphere(0.1, 10, 8), mat(c, { rough: 0.9 }), [x, y + 0.1, zc + 0.05]))
          g.add(part(sphere(0.075, 10, 8), mat(c, { rough: 0.9 }), [x, y + 0.24, zc + 0.07]))
        }
      }
    }
    g.add(part(box(0.8, 0.24, 0.03), texMat(label('경품', '#ff4f3d', '#ffffff', 192, 64, 40), { glow: 0.6 }), [cx, 1.88, zc + 0.2], { shadow: false }))
  }

  // ─── 동전교환기 ───
  {
    const { x: cx, z: zc } = COIN
    g.add(part(roundBox(0.7, 1.55, 0.5, 0.05), mat('#d9dde2', { metal: 0.4, rough: 0.35 }), [cx, 0.775, zc]))
    g.add(part(box(0.55, 0.2, 0.03), texMat(label('동전교환', '#ffd94a', '#2b2233', 192, 64, 38), { glow: 0.8 }), [cx, 1.38, zc + 0.26], { shadow: false }))
    g.add(part(box(0.3, 0.04, 0.03), glow('#59ff8a', 1.3), [cx, 1.1, zc + 0.26], { shadow: false }))
    g.add(part(box(0.32, 0.12, 0.12), dark, [cx, 0.55, zc + 0.27]))
    for (let k = 0; k < 4; k++) g.add(part(cyl(0.03, 0.03, 0.01, 10), mat('#ffcf3d', { metal: 0.7, rough: 0.3 }), [cx - 0.08 + k * 0.05, 0.6, zc + 0.29], { shadow: false }))
    hit('arcade/coin', cx, zc + 0.05, 0.75, 1.7, 0.7)
  }

  // ─── 레이싱 두 대 (붕붕레이서): 서쪽 벽 게임기 + 의자 ───
  const road = tex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#5c5f6b'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#59c26b'
    ctx.fillRect(0, 0, 18, h)
    ctx.fillRect(w - 18, 0, 18, h)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(18, 0, 5, h)
    ctx.fillRect(w - 23, 0, 5, h)
    ctx.fillStyle = '#ffd94a'
    ctx.fillRect(w / 2 - 3, 0, 6, 34)
    ctx.fillRect(w / 2 - 3, 64, 6, 34)
  })
  road.wrapT = THREE.RepeatWrapping
  const roadMat = texMat(road, { glow: 1.0 })
  for (const [i, zc] of RACE_Z.entries()) {
    const body = mat(i ? '#5aa9e6' : '#ff5a4f', { rough: 0.5 })
    const cx = RACE_CAB_X
    // 게임기 몸통 · 화면 (동쪽을 본다)
    g.add(part(roundBox(0.8, 2.0, 1.2, 0.06), body, [cx - 0.2, 1.0, zc]))
    g.add(part(new THREE.PlaneGeometry(0.95, 0.7), roadMat, [cx + 0.205, 1.45, zc], { rot: [0, Math.PI / 2, 0], shadow: false }))
    g.add(part(box(0.06, 0.08, 1.05), dark, [cx + 0.22, 1.84, zc]))
    g.add(part(box(0.03, 0.24, 1.0), texMat(label('붕붕레이서', '#2b2233', '#ffd94a', 256, 64, 34), { glow: 1.0 }), [cx + 0.21, 2.08, zc], { rot: [0, 0, 0], shadow: false }))
    // 앞으로 나온 운전대 받침 + 운전대
    g.add(part(roundBox(0.5, 0.8, 0.7, 0.05), body, [cx + 0.35, 0.4, zc]))
    g.add(part(box(0.2, 0.1, 0.5), dark, [cx + 0.55, 0.85, zc], { rot: [0, 0, -0.4] }))
    g.add(part(torus(0.16, 0.025), dark, [cx + 0.62, 0.95, zc], { rot: [0, Math.PI / 2, 0.0] }))
    g.add(part(cyl(0.03, 0.03, 0.04, 8), mat('#ff3b30'), [cx + 0.63, 0.95, zc], { rot: [0, 0, Math.PI / 2] }))
    // 의자 (등받이는 동쪽)
    const sx = RACE_SEAT_X
    g.add(part(box(0.5, 0.3, 0.5), dark, [sx, 0.15, zc]))
    g.add(part(roundBox(0.55, 0.14, 0.55, 0.05), body, [sx, 0.38, zc]))
    g.add(part(roundBox(0.14, 0.7, 0.55, 0.05), body, [sx + 0.28, 0.75, zc], { rot: [0, 0, -0.18] }))
    g.add(part(roundBox(0.1, 0.2, 0.4, 0.04), mat('#ffffff', { rough: 0.5 }), [sx + 0.32, 1.0, zc], { rot: [0, 0, -0.18], shadow: false }))
    hit(`arcade/race:${i}`, sx, zc, 0.7, 1.2, 0.7)
    hit(`arcade/race:${i}`, cx + 0.1, zc, 1.2, 2.2, 1.2)
  }

  // ─── 에어하키 (구경만) ───
  {
    const { x: cx, z: zc } = HOCKEY
    g.add(part(roundBox(1.1, 0.78, 1.8, 0.05), mat('#2b2233', { rough: 0.5 }), [cx, 0.39, zc]))
    g.add(part(box(1.0, 0.03, 1.7), glow('#3fa9ff', 0.5), [cx, 0.79, zc], { shadow: false }))
    g.add(part(box(1.0, 0.01, 0.03), mat('#ffffff'), [cx, 0.81, zc], { shadow: false }))
    for (const [dz, c] of [
      [-0.65, '#ff4f3d'],
      [0.65, '#ffd94a'],
    ] as const) {
      g.add(part(cyl(0.09, 0.09, 0.04, 14), mat(c, { rough: 0.4 }), [cx, 0.83, zc + dz]))
      g.add(part(cyl(0.035, 0.035, 0.08, 10), mat(c, { rough: 0.4 }), [cx, 0.89, zc + dz]))
    }
    g.add(part(cyl(0.05, 0.05, 0.015, 12), mat('#ff4fa8', { rough: 0.3 }), [cx + 0.15, 0.81, zc - 0.2]))
    for (const [dx, dz] of [
      [-0.5, -0.85],
      [0.5, -0.85],
      [-0.5, 0.85],
      [0.5, 0.85],
    ] as const)
      g.add(part(box(0.06, 0.06, 0.06), neonCyan, [cx + dx, 0.82, zc + dz], { shadow: false }))
  }

  // ─── 캡슐뽑기 둘 (구경만) ───
  for (const [k, dx] of [-0.35, 0.35].entries()) {
    const x = GACHA.x + dx
    const z = GACHA.z
    g.add(part(roundBox(0.55, 0.75, 0.5, 0.05), mat(k ? '#59c26b' : '#ff8fb8', { rough: 0.5 }), [x, 0.375, z]))
    g.add(part(sphere(0.24, 16, 12), glass, [x, 0.98, z], { shadow: false }))
    for (let j = 0; j < 6; j++)
      g.add(part(sphere(0.06, 8, 6), mat(TOY[(j + k * 3) % TOY.length], { rough: 0.4 }), [x - 0.1 + (j % 3) * 0.1, 0.83 + Math.floor(j / 3) * 0.1, z - 0.04 + (j % 2) * 0.08], { shadow: false }))
    g.add(part(cyl(0.06, 0.06, 0.04, 12), chrome, [x, 0.5, z + 0.26], { rot: [Math.PI / 2, 0, 0] }))
    g.add(part(cone(0.06, 0.06, 4), mat('#ffd94a'), [x, 1.26, z], { rot: [0, Math.PI / 4, 0] }))
  }

  bakeStatic(g)

  return {
    group: g,
    tick(t: number) {
      // 전구 번갈아 깜빡
      const on = Math.floor(t * 2.5) % 2 === 0
      bulbA.emissiveIntensity = on ? 1.6 : 0.3
      bulbB.emissiveIntensity = on ? 0.3 : 1.6
      // 네온: 은은히 숨 쉬다 가끔 지직
      const flick = Math.sin(t * 17) > 0.97 ? 0.4 : 1
      neonPink.emissiveIntensity = (1.2 + Math.sin(t * 1.3) * 0.3) * flick
      neonCyan.emissiveIntensity = 1.2 + Math.sin(t * 1.3 + 1.5) * 0.3
      signMat.emissiveIntensity = Math.sin(t * 11 + 2) > 0.985 ? 0.3 : 1.3
      // 집게가 유리 상자 안을 천천히 돈다
      for (const [i, c] of claws.entries()) {
        c.position.x = c.userData.home + Math.sin(t * 0.6 + i * 2) * 0.25
        c.position.z = CLAW_Z + Math.sin(t * 0.45 + i) * 0.2
        c.position.y = 1.62 - Math.max(0, Math.sin(t * 0.3 + i * 3)) ** 8 * 0.35
      }
      // 리듬게임: 화살표가 흐르고 발판이 하나씩 켜진다
      const beat = Math.floor(t * 2.4) % 4
      for (const [k, m] of pads.entries()) m.emissiveIntensity = k === beat ? 1.6 : 0.25
      // 레이싱 화면: 길이 달린다
      road.offset.y = (t * 1.2) % 1
      if (scr) scr.offset.y = -(t * 0.4) % 1
      // 샌드백이 살짝 흔들린다
      bag.rotation.x = Math.sin(t * 2.2) * 0.06
    },
    dispose() {
      for (const o of owned) o.dispose()
    },
  }
}

/** 골목 건물 앞 장식: 입구 옆 작은 인형뽑기 + 간판 아래 반짝이 전구 줄 */
function deco(g: THREE.Group, a: PlaceAnims) {
  const own = (color: string, rough = 0.5, opacity = 1) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, transparent: opacity < 1, opacity })
    a.owned.push(m)
    return m
  }
  const glowOwn = (color: string) => {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.4 })
    a.owned.push(m)
    return m
  }
  // 전구 줄 (간판 아래, 두 색이 번갈아 깜빡)
  const bA = glowOwn('#fff3a8')
  const bB = glowOwn('#ff8a3d')
  for (let k = 0; k < 17; k++) g.add(part(sphere(0.06, 8, 6), k % 2 ? bA : bB, [-4.5 + k * 0.5625, 2.36, 0.14], { shadow: false }))
  g.add(part(box(9.2, 0.02, 0.02), own('#2b2233'), [0, 2.4, 0.14], { shadow: false }))
  // 작은 인형뽑기 (문 동쪽)
  const x = 3.95
  const z = 0.34
  const body = own('#ff4f3d')
  g.add(part(roundBox(0.8, 0.8, 0.56, 0.05), body, [x, 0.4, z]))
  g.add(part(box(0.76, 0.72, 0.52), own('#d8f3ff', 0.05, 0.25), [x, 1.16, z], { shadow: false }))
  for (const dx of [-0.38, 0.38]) g.add(part(box(0.04, 0.72, 0.04), body, [x + dx, 1.16, z + 0.26]))
  for (let k = 0; k < 4; k++) {
    const m = own(TOY[k], 0.9)
    g.add(part(sphere(0.09, 10, 8), m, [x - 0.24 + k * 0.16, 0.9, z], { shadow: false }))
    g.add(part(sphere(0.065, 10, 8), m, [x - 0.24 + k * 0.16, 1.02, z + 0.02], { shadow: false }))
  }
  g.add(part(roundBox(0.82, 0.24, 0.58, 0.04), body, [x, 1.64, z]))
  const top = glowOwn('#ffd94a')
  g.add(part(box(0.6, 0.12, 0.02), top, [x, 1.64, z + 0.295], { shadow: false }))
  g.add(part(sphere(0.04, 8, 6), own('#ff3b30', 0.3), [x - 0.15, 0.86, z + 0.3]))
  a.tick.push((t, night) => {
    const on = Math.floor(t * 2) % 2 === 0
    const hi = night ? 1.8 : 0.7
    const lo = night ? 0.25 : 0.1
    bA.emissiveIntensity = on ? hi : lo
    bB.emissiveIntensity = on ? lo : hi
    top.emissiveIntensity = night ? 1.2 : 0.4
  })
}

export const ARCADE_ART: ShopArt = {
  interior,
  exterior: (a) =>
    shopFront(
      'arcade',
      { name: '방들이오락실', wall: '#ffd23f', signBg: '#ff4f3d', signFg: '#fff6c9', accent: '#ff8a1f', window: '#ff6ad5', deco },
      a,
    ),
}

