/**
 * 집 안 3D: 투룸 + 화장실. 뒤 벽 두 면은 방 주인이 꾸민 벽지를 그대로 입히고(높게),
 * 앞쪽 벽은 낮게 잘라 디오라마처럼 안을 들여다본다. 칸막이벽은 허리 높이.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import * as THREE from 'three'
import { type Decor, emptyArt, FLOOR_SIDE, type FloorDecor, WALL_H, WALL_W, type WallDecor } from '../art/decor'
import { FIXTURES, PARTITIONS, ROOM_FLOORS, solidSegments, type UV } from '../lib/home'
import { HOUSE_EXIT, HOUSE_SIZE, uvToHouse } from '../lib/town'
import { FloorSurface, WallSurface } from '../components/Surfaces'
import { buildItem3D } from './furniture3d'
import { box, group, mat, part, roundBox, svgTexture, tint } from './kit'

const S = HOUSE_SIZE
const H = S / 2
export const WALL_HEIGHT = 3.3
const LOW_WALL = 0.42
const PART_H = 1.05
const THICK = 0.16

const BEDROOM_FLOOR: FloorDecor = { color: '#d9a46c', pattern: 'planks' }
const KITCHEN_FLOOR: FloorDecor = { color: '#f4efe6', pattern: 'checker' }
const BATH_FLOOR: FloorDecor = { color: '#e2f1fa', pattern: 'tiles' }

/** 가구가 바라보는 쪽 (y축 회전). 0이면 +z(앞), π/2면 +x */
const FACE: Record<string, number> = {
  'fx-tv': Math.PI / 2,
  'fx-sofa': Math.PI / 2,
  'fx-lowtable': Math.PI / 2,
  'fx-lamp': Math.PI / 2,
  'fx-turntable': 0,
  'fx-calendar': 0,
  'fx-bed': 0,
  'fx-wardrobe': 0,
  'fx-alarm': 0,
  'fx-desk': Math.PI / 2,
  'fx-chair': -Math.PI / 2,
  'fx-bookshelf': Math.PI / 2,
  'fx-beanbag': Math.PI * 0.75,
  'fx-fridge': 0,
  'fx-counter': 0,
  'fx-washer': 0,
  'fx-toilet': -Math.PI / 2,
  'fx-basin': -Math.PI / 2,
  'fx-bathtub': 0,
}

/** 가구 자리 미세 조정 (벽에 붙게) */
const NUDGE: Record<string, [number, number]> = {
  'fx-tv': [-0.15, 0],
  'fx-sofa': [0.1, 0],
  'fx-bed': [0, 0.3],
  'fx-desk': [0.05, 0],
  'fx-chair': [0.3, 0],
  'fx-bookshelf': [-0.05, 0],
  'fx-wardrobe': [-0.1, -0.05],
  'fx-bathtub': [-0.1, 0.05],
}

export const fixtureFacing = (id: string) => FACE[id] ?? Math.PI / 4
export function fixtureWorld(f: { id: string; u: number; v: number }) {
  const p = uvToHouse(f)
  const n = NUDGE[f.id] ?? [0, 0]
  return { x: p.x + n[0], z: p.z + n[1] }
}

function wallSvg(wall: WallDecor, id: string) {
  return renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${WALL_W} ${WALL_H}`} width={WALL_W * 4} height={WALL_H * 4} shapeRendering="crispEdges">
      <WallSurface id={id} wall={wall} />
    </svg>,
  )
}

function floorSvg(floor: FloorDecor, id: string, w = FLOOR_SIDE, h = FLOOR_SIDE) {
  return renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${w} ${h}`} width={w * 4} height={h * 4} shapeRendering="crispEdges">
      <FloorSurface id={id} floor={floor} w={w} h={h} />
    </svg>,
  )
}

const roomWall = (base: WallDecor, stickers: WallDecor['stickers']): WallDecor => ({
  color: base.color,
  pattern: base.pattern,
  art: emptyArt(),
  stickers,
})

export interface House3D {
  group: THREE.Group
  /** 누를 수 있는 가구 (key → 메시 묶음) */
  fixtures: Map<string, THREE.Group>
  /** 현관문 (누르면 밖으로) */
  exit: THREE.Object3D
  dispose(): void
}

/** 벽 한 장 (텍스처를 아래쪽 기준으로 높이에 맞게 잘라 붙인다) */
function texturedWall(tex: THREE.Texture, len: number, color: string) {
  // 벽지 그림 비율(160:115)을 지키고 위쪽은 잘라 낸다
  const fullH = (len * WALL_H) / WALL_W
  tex.repeat.set(1, Math.min(1, WALL_HEIGHT / fullH))
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 })
  const side = mat(tint(color, -0.12), { rough: 0.9 })
  const top = mat(tint(color, 0.04), { rough: 0.9 })
  // BoxGeometry 면 순서: +x -x +y -y +z -z
  const m = new THREE.Mesh(box(len, WALL_HEIGHT, THICK), [side, side, top, side, face, side])
  m.receiveShadow = true
  m.castShadow = false
  return m
}

export function buildHouse3D(decor: Decor, onTexture?: () => void): House3D {
  const g = new THREE.Group()
  const textures: THREE.Texture[] = []
  const owned: THREE.Material[] = []
  const tex = (svg: string, w: number, h: number) => {
    const t = svgTexture(svg, w, h, onTexture)
    textures.push(t)
    return t
  }

  // ─── 바닥 ───
  const living = tex(floorSvg(decor.floor, 'f3-living', FLOOR_SIDE * 2, FLOOR_SIDE * 2), 1024, 1024)
  const floorMat = new THREE.MeshStandardMaterial({ map: living, roughness: 0.85 })
  owned.push(floorMat)
  const slab = new THREE.Mesh(box(S + THICK * 2, 0.3, S + THICK * 2), [
    mat(tint(decor.floor.color, -0.3)),
    mat(tint(decor.floor.color, -0.3)),
    floorMat,
    mat(tint(decor.floor.color, -0.4)),
    mat(tint(decor.floor.color, -0.25)),
    mat(tint(decor.floor.color, -0.3)),
  ])
  slab.position.y = -0.15
  slab.receiveShadow = true
  g.add(slab)
  const zoneFloor = (r: { u0: number; v0: number; u1: number; v1: number }, floor: FloorDecor, id: string) => {
    const w = (r.u1 - r.u0) * S
    const d = (r.v1 - r.v0) * S
    const t = tex(floorSvg(floor, id, FLOOR_SIDE * (r.u1 - r.u0) * 2, FLOOR_SIDE * (r.v1 - r.v0) * 2), 512, Math.round((512 * d) / w))
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: floor.pattern === 'tiles' ? 0.4 : 0.8 })
    owned.push(m)
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m)
    mesh.rotation.x = -Math.PI / 2
    const c = uvToHouse({ u: (r.u0 + r.u1) / 2, v: (r.v0 + r.v1) / 2 })
    mesh.position.set(c.x, 0.004, c.z)
    mesh.receiveShadow = true
    g.add(mesh)
  }
  zoneFloor(ROOM_FLOORS.bedroom, BEDROOM_FLOOR, 'f3-bed')
  zoneFloor(ROOM_FLOORS.study, decor.floor.pattern === 'rug' ? { ...decor.floor, pattern: 'plain' } : decor.floor, 'f3-study')
  zoneFloor(ROOM_FLOORS.kitchen, KITCHEN_FLOOR, 'f3-kitchen')
  zoneFloor(ROOM_FLOORS.bath, BATH_FLOOR, 'f3-bath')

  // ─── 뒤 벽 (꾸민 벽지) ───
  const [wallL, wallR] = decor.walls
  const studyWall = roomWall(wallL, [
    { id: 'poster', x: 48, y: 26 },
    { id: 'clock', x: 112, y: 20 },
  ])
  const bedroomWall = roomWall(wallR, [{ id: 'window', x: 62, y: 20 }])
  // 서쪽 벽 (x = -H): 화면에서 왼쪽 뒤. 앞면이 +x를 본다
  const west = [
    { wall: wallL, z0: -H, z1: 0, id: 'w3-livingL' },
    { wall: studyWall, z0: 0, z1: H, id: 'w3-study' },
  ]
  for (const w of west) {
    const len = w.z1 - w.z0
    const m = texturedWall(tex(wallSvg(w.wall, w.id), 640, 460), len, w.wall.color)
    // 왼쪽 벽은 텍스처 왼쪽 = 뒤(북쪽)가 되게
    m.rotation.y = Math.PI / 2
    m.position.set(-H - THICK / 2, WALL_HEIGHT / 2, (w.z0 + w.z1) / 2)
    g.add(m)
  }
  const north = [
    { wall: wallR, x0: -H, x1: 0, id: 'w3-livingR' },
    { wall: bedroomWall, x0: 0, x1: H, id: 'w3-bedroom' },
  ]
  for (const w of north) {
    const m = texturedWall(tex(wallSvg(w.wall, w.id), 640, 460), w.x1 - w.x0, w.wall.color)
    m.position.set((w.x0 + w.x1) / 2, WALL_HEIGHT / 2, -H - THICK / 2)
    g.add(m)
  }
  // 모서리 기둥
  g.add(part(box(THICK, WALL_HEIGHT, THICK), mat(tint(wallL.color, -0.15)), [-H - THICK / 2, WALL_HEIGHT / 2, -H - THICK / 2]))

  // ─── 앞쪽 낮은 벽 (동·남) + 현관문 자리 ───
  const lowColor = tint(wallR.color, -0.05)
  const lowMat = mat(lowColor, { rough: 0.9 })
  const capMat = mat(tint(lowColor, 0.08))
  const lowWall = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0)
    if (len < 0.05) return
    const wgrp = group(part(box(len, LOW_WALL, THICK), lowMat, [0, LOW_WALL / 2, 0]), part(box(len + 0.02, 0.05, THICK + 0.04), capMat, [0, LOW_WALL + 0.025, 0]))
    wgrp.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2)
    wgrp.rotation.y = -Math.atan2(z1 - z0, x1 - x0)
    g.add(wgrp)
  }
  lowWall(H + THICK / 2, -H - THICK, H + THICK / 2, H + THICK)
  const door = uvToHouse(HOUSE_EXIT)
  const doorHalf = 0.75
  lowWall(-H - THICK, H + THICK / 2, door.x - doorHalf, H + THICK / 2)
  lowWall(door.x + doorHalf, H + THICK / 2, H + THICK, H + THICK / 2)
  // 현관 매트 + 문짝 (열려 있는 문)
  const exit = group(
    part(roundBox(1.4, 0.03, 0.7, 0.01), mat('#ff9f6b', { rough: 1 }), [0, 0.015, -0.1]),
    part(roundBox(1.2, 0.012, 0.5, 0.005), mat('#ffd2b0', { rough: 1 }), [0, 0.035, -0.1]),
    part(box(0.1, 2.2, 0.16), mat('#8a5a38'), [-doorHalf, 1.1, 0.25]),
    part(box(0.1, 2.2, 0.16), mat('#8a5a38'), [doorHalf, 1.1, 0.25]),
    part(box(1.6, 0.14, 0.16), mat('#8a5a38'), [0, 2.2, 0.25]),
  )
  const leaf = part(roundBox(0.06, 2.0, 1.3, 0.02), mat('#ffb36b'), [doorHalf - 0.03, 1.02, 0.25 + 0.65])
  exit.add(leaf)
  exit.add(part(sphere3(0.045), mat('#ffd94a', { metal: 0.6, rough: 0.3 }), [doorHalf - 0.1, 1.0, 1.4]))
  exit.position.set(door.x, 0, H - 0.2)
  exit.name = 'exit'
  exit.traverse((n) => (n.userData.exit = true))
  g.add(exit)

  // ─── 칸막이벽 ───
  const wallTone = tint(wallL.color, -0.03)
  for (const seg of solidSegments(PARTITIONS)) {
    const a = uvToHouse(seg.from)
    const b = uvToHouse(seg.to)
    const tone = PARTITIONS.find((p) => onSeg(seg.from, p))?.tone ?? 'wall'
    const c = tone === 'tile' ? '#e2f1fa' : wallTone
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    if (len < 0.05) continue
    const w = group(
      part(roundBox(len + THICK, PART_H, THICK, 0.03), mat(c, { rough: tone === 'tile' ? 0.4 : 0.9 }), [0, PART_H / 2, 0]),
      part(roundBox(len + THICK + 0.04, 0.06, THICK + 0.05, 0.02), mat(tint(c, -0.1)), [0, PART_H + 0.02, 0]),
    )
    w.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2)
    w.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x)
    g.add(w)
  }

  // ─── 처음부터 있는 가구 ───
  const fixtures = new Map<string, THREE.Group>()
  for (const f of FIXTURES) {
    const m = buildItem3D(f.item)
    if (!m) continue
    const p = fixtureWorld(f)
    m.position.set(p.x, 0, p.z)
    m.rotation.y = fixtureFacing(f.id)
    m.userData.key = f.id
    m.traverse((n) => (n.userData.key = f.id))
    g.add(m)
    fixtures.set(f.id, m)
  }

  return {
    group: g,
    fixtures,
    exit,
    dispose() {
      for (const t of textures) t.dispose()
      for (const m of owned) m.dispose()
    },
  }
}

const sphere3 = (r: number) => new THREE.SphereGeometry(r, 10, 8)

function onSeg(p: UV, w: { from: UV; to: UV }) {
  const cross = (w.to.u - w.from.u) * (p.v - w.from.v) - (w.to.v - w.from.v) * (p.u - w.from.u)
  const within =
    p.u >= Math.min(w.from.u, w.to.u) - 1e-6 &&
    p.u <= Math.max(w.from.u, w.to.u) + 1e-6 &&
    p.v >= Math.min(w.from.v, w.to.v) - 1e-6 &&
    p.v <= Math.max(w.from.v, w.to.v) + 1e-6
  return Math.abs(cross) < 1e-6 && within
}
