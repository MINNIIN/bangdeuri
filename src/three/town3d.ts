/**
 * 골목 3D: 잔디 · 차도 · 인도 · 친구들 집(마당·울타리·대문·우편함) · 공원.
 * 집 겉모습은 그 방 테마 색을 따르고, 대문 위에 "OO네" 문패가 붙는다.
 */
import * as THREE from 'three'
import type { Room } from '../lib/types'
import {
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
import { bakeStatic, box, canvasTexture, capsule, cone, cyl, group, mat, part, roundBox, sphere, tint } from './kit'

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

function swing() {
  const frame = mat('#ff7f2a')
  const g = group(
    part(cyl(0.06, 0.06, 2.6, 10), frame, [0, 2.2, 0], { rot: [0, 0, Math.PI / 2] }),
    ...[-1.25, 1.25].flatMap((x) => [
      part(cyl(0.05, 0.05, 2.4, 8), frame, [x, 1.1, 0.45], { rot: [0.35, 0, 0] }),
      part(cyl(0.05, 0.05, 2.4, 8), frame, [x, 1.1, -0.45], { rot: [-0.35, 0, 0] }),
    ]),
  )
  for (const x of [-0.55, 0.55]) {
    g.add(part(cyl(0.01, 0.01, 1.6, 4), mat('#c9cbd6'), [x - 0.2, 1.4, 0]))
    g.add(part(cyl(0.01, 0.01, 1.6, 4), mat('#c9cbd6'), [x + 0.2, 1.4, 0]))
    g.add(part(roundBox(0.5, 0.05, 0.25, 0.02), mat('#7fc8ff'), [x, 0.6, 0]))
  }
  return g
}

function slide() {
  return group(
    part(roundBox(0.9, 1.4, 0.9, 0.05), mat('#ffd94a'), [0, 0.7, -0.9]),
    part(roundBox(0.8, 0.06, 2.4, 0.03), mat('#59c26b', { rough: 0.4 }), [0, 0.72, 0.5], { rot: [0.55, 0, 0] }),
    ...[0.3, 0.6, 0.9, 1.2].map((y, i) => part(box(0.7, 0.05, 0.15), mat('#ff7f2a'), [0, y, -1.4 - i * 0.02])),
  )
}

function buildProp(p: Prop, i: number, heads: THREE.Vector3[], lampMat: THREE.MeshStandardMaterial) {
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
      o = swing()
      break
    case 'slide':
      o = slide()
      break
  }
  o.position.set(p.x, 0, p.z)
  o.rotation.y = p.rot ?? 0
  return o
}

export function buildTown3D(map: TownMap, rooms: Map<string, Room>): Town3D {
  const g = new THREE.Group()
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
  for (let k = -4; k <= 4; k++) g.add(part(box(0.45, 0.012, 2.6), mat('#ffffff', { rough: 0.6 }), [k * 0.8 + 0, 0.01, 0], { shadow: false }))

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
        fg.add(part(roundBox(0.1, 0.75, 0.06, 0.03), pickets, [x0 + (x1 - x0) * t, 0.375, z0 + (z1 - z0) * t]))
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
  map.props.forEach((p, i) => g.add(buildProp(p, i, heads, lampMat)))
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
