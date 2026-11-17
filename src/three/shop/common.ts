/**
 * 가게 3D 공통: 가게 안 껍데기(바닥 · 벽 · 문 · 나가는 매트)와 골목에서 보이는 가게 건물.
 * 가게마다 이 위에 자기 물건을 올린다 (편의점 cvs3d.ts가 원래 모양).
 *
 * 가게 안: 카메라 쪽(남·동) 벽은 낮게 잘라 안이 보이게 한다. 누를 수 있는 것마다 보이지 않는 누름 상자에 key(<가게id>/…)를 붙인다.
 * 가게 건물: 가운데 x=0, 앞면 z=STORE_FRONT (골목 칸 자리로는 town3d가 옮긴다). 문 아무 데나 누르면 그 가게로 들어간다(userData.shop).
 */
import * as THREE from 'three'
import type { ShopDef } from '../../lib/shops'
import { STORE_D, STORE_DOOR_DX, STORE_FRONT, STORE_W } from '../../lib/town'
import type { AvatarLook as Look } from '../../art/avatar'
import { box, canvasTexture, mat, part, roundBox } from '../kit'
import type { PlaceAnims } from '../places3d'
import { HIT_LAYER } from '../town3d'

export const FONT = 'Galmuri11, system-ui, sans-serif'
const HIT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })

export interface Shop3D {
  group: THREE.Group
  /** 화면·조명처럼 늘 움직이는 것 (t: 초) */
  tick?(t: number): void
  dispose(): void
}

/** 가게 하나의 3D: 안 · 골목 건물 · 가게 사람 생김새 */
export interface ShopArt {
  interior: () => Shop3D
  exterior: (a: PlaceAnims) => THREE.Group
  npcLook?: Look
}

/** 가게 안 그리기 도구 (텍스처·재질은 owned에 모아 dispose 때 버린다) */
export function shopKit(g: THREE.Group, owned: { dispose(): void }[]) {
  const tex = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) => {
    const t = canvasTexture(w, h, (ctx) => draw(ctx, w, h), repeat)
    owned.push(t)
    return t
  }
  const texMat = (t: THREE.Texture, opts: { rough?: number; glow?: number } = {}) => {
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: opts.rough ?? 0.6, emissive: opts.glow ? '#ffffff' : '#000000', emissiveMap: opts.glow ? t : null, emissiveIntensity: opts.glow ?? 0 })
    owned.push(m)
    return m
  }
  const label = (text: string, bg: string, fg: string, w = 256, h = 64, size = 36) =>
    tex(w, h, (ctx) => {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = fg
      ctx.font = `700 ${size}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, w / 2, h / 2 + 2)
    })
  /** 빛나는 재질 (화면 · 네온): 밝기를 바꿔 깜빡일 수 있게 따로 만든다 */
  const glow = (color: string, intensity = 1.2) => {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 })
    owned.push(m)
    return m
  }
  /** 누름 상자 (가운데·크기, key) */
  const hit = (key: string, x: number, z: number, w: number, h: number, d: number) => {
    const m = new THREE.Mesh(box(w, h, d), HIT)
    m.position.set(x, h / 2, z)
    m.name = 'hit'
    m.layers.set(HIT_LAYER)
    m.userData.key = key
    g.add(m)
    return m
  }
  return { tex, texMat, label, glow, hit }
}

export interface RoomStyle {
  /** 바닥 무늬 (128×128 한 칸, 1m마다 반복) */
  floor: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  wall: string
  trim: string
  /** 나가는 매트 글씨 · 색 */
  matText: string
  matColor: string
  /** 문틀 색 */
  frame?: string
}

/** 가게 안 껍데기: 바닥 · 북·서 높은 벽 · 남·동 낮은 벽 · 문틀 · 나가는 매트 */
export function shopRoom(def: ShopDef, style: RoomStyle, g: THREE.Group, owned: { dispose(): void }[]) {
  const { tex, texMat, label } = shopKit(g, owned)
  const W = def.hw
  const D = def.hd
  const H = def.wallH
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2), texMat(tex(128, 128, style.floor, [W, D]), { rough: 0.5 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  floor.userData.ground = true
  floor.name = 'floor'
  g.add(floor)
  g.add(part(box(W * 2 + 0.3, 0.3, D * 2 + 0.3), mat('#b9bec4'), [0, -0.16, 0]))
  const wall = mat(style.wall, { rough: 0.85 })
  const trim = mat(style.trim, { rough: 0.6 })
  const T = 0.16
  g.add(part(box(W * 2 + T * 2, H, T), wall, [0, H / 2, -D - T / 2]))
  g.add(part(box(T, H, D * 2), wall, [-W - T / 2, H / 2, 0]))
  g.add(part(box(W * 2 + T * 2, 0.16, T + 0.02), trim, [0, H - 0.08, -D - T / 2]))
  g.add(part(box(T + 0.02, 0.16, D * 2), trim, [-W - T / 2, H - 0.08, 0]))
  const LOW = 0.75
  const gap0 = def.doorX - 0.75
  const gap1 = def.doorX + 0.75
  g.add(part(box(gap0 + W + T, LOW, T), wall, [(-W - T + gap0) / 2, LOW / 2, D + T / 2]))
  g.add(part(box(W + T - gap1, LOW, T), wall, [(gap1 + W + T) / 2, LOW / 2, D + T / 2]))
  g.add(part(box(T, LOW, D * 2), wall, [W + T / 2, LOW / 2, 0]))
  for (const [x, z, w, d] of [
    [(-W - T + gap0) / 2, D + T / 2, gap0 + W + T, T + 0.04],
    [(gap1 + W + T) / 2, D + T / 2, W + T - gap1, T + 0.04],
    [W + T / 2, 0, T + 0.04, D * 2],
  ] as const)
    g.add(part(box(w, 0.06, d), trim, [x, LOW + 0.03, z]))
  const frame = mat(style.frame ?? '#4a4f5c', { rough: 0.5 })
  for (const x of [gap0, gap1]) g.add(part(box(0.1, 2.4, 0.2), frame, [x, 1.2, D + T / 2]))
  g.add(part(box(gap1 - gap0 + 0.1, 0.12, 0.2), frame, [def.doorX, 2.4, D + T / 2]))
  // 현관 매트 (누르면 나간다)
  const doorMat = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.75), texMat(label(style.matText, style.matColor, '#ffffff', 256, 96, 40), { rough: 1 }))
  doorMat.rotation.x = -Math.PI / 2
  doorMat.position.set(def.doorX, 0.012, D - 0.42)
  doorMat.name = 'exitmat'
  doorMat.userData.exit = true
  g.add(doorMat)
  const exitHit = new THREE.Mesh(box(1.5, 1.6, 1.0), HIT)
  exitHit.position.set(def.doorX, 0.8, D - 0.2)
  exitHit.name = 'hit'
  exitHit.layers.set(HIT_LAYER)
  exitHit.userData.exit = true
  g.add(exitHit)
}

export interface FrontStyle {
  /** 간판 글씨 */
  name: string
  wall: string
  /** 간판 바탕 · 글씨 · 띠 색 */
  signBg: string
  signFg: string
  accent: string
  /** 큰 창에 보이는 안쪽 색 (밤에 빛난다) */
  window: string
  /** 건물 앞에 더 붙일 것 (가운데 x=0, 앞면 z=0 기준으로 그린다) */
  deco?: (g: THREE.Group, a: PlaceAnims) => void
}

/** 골목 가게 건물 (편의점과 같은 크기 · 같은 문 자리) */
export function shopFront(id: ShopDef['id'], style: FrontStyle, a: PlaceAnims) {
  const W = STORE_W
  const D = STORE_D
  const H = 3.4
  const g = new THREE.Group()
  g.add(part(roundBox(W, H, D, 0.06), mat(style.wall, { rough: 0.85 }), [0, H / 2, 0]))
  g.add(part(box(W + 0.06, 0.36, D + 0.06), mat('#8c8f99', { rough: 0.9 }), [0, 0.18, 0]))
  g.add(part(box(W + 0.16, 0.22, D + 0.16), mat('#d9ddd8'), [0, H + 0.11, 0]))
  // 간판 (밤에 빛난다)
  const signT = canvasTexture(1024, 128, (ctx) => {
    ctx.fillStyle = style.signBg
    ctx.fillRect(0, 0, 1024, 128)
    ctx.fillStyle = style.accent
    ctx.fillRect(0, 0, 1024, 14)
    ctx.fillRect(0, 114, 1024, 14)
    ctx.fillStyle = style.signFg
    ctx.font = `700 60px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(style.name, 512, 66)
  })
  a.owned.push(signT)
  const signMat = new THREE.MeshStandardMaterial({ map: signT, emissive: '#ffffff', emissiveMap: signT, emissiveIntensity: 0.2, roughness: 0.5 })
  a.owned.push(signMat)
  a.glows.push({ mat: signMat, day: 0.2, night: 1.1 })
  // 간판: 띠 상자 + 앞면에만 글씨 (상자 전체에 붙이면 윗면에도 글씨가 비친다)
  g.add(part(box(W - 0.3, 0.86, 0.1), mat(style.signBg), [0, H - 0.55, D / 2 + 0.05]))
  g.add(part(new THREE.PlaneGeometry(W - 0.4, 0.8), signMat, [0, H - 0.55, D / 2 + 0.11], { shadow: false }))
  // 큰 창 (문 왼쪽): 단색 판이 아니라 유리 너머 가게 안(천장 등 · 진열장 · 카운터)이 비치고 햇빛 반사 줄이 있는 그림
  const doorX = STORE_DOOR_DX
  const winW = doorX - 0.9 + W / 2 - 0.5
  const winX = -W / 2 + 0.5 + winW / 2
  const glassT = (w: number, h: number, shelves: boolean) => {
    const t = canvasTexture(w, h, (ctx) => {
      const base = new THREE.Color(style.window)
      const deep = base.clone().lerp(new THREE.Color('#1d2033'), 0.45)
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, `#${deep.getHexString()}`)
      grad.addColorStop(1, `#${base.getHexString()}`)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
      // 천장 등 줄
      ctx.fillStyle = 'rgba(255,250,225,0.85)'
      for (let x = w * 0.12; x < w; x += w * 0.26) ctx.fillRect(x, h * 0.07, w * 0.12, h * 0.035)
      if (shelves) {
        // 안쪽 진열장 · 카운터 그림자
        ctx.fillStyle = 'rgba(20,20,40,0.28)'
        ctx.fillRect(w * 0.04, h * 0.3, w * 0.3, h * 0.55)
        ctx.fillRect(w * 0.58, h * 0.62, w * 0.36, h * 0.3)
        ctx.fillStyle = 'rgba(255,255,255,0.22)'
        for (let r = 0; r < 3; r++) ctx.fillRect(w * 0.05, h * (0.4 + r * 0.15), w * 0.28, h * 0.02)
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        for (let k = 0; k < 7; k++) ctx.fillRect(w * (0.07 + k * 0.035), h * (0.33 + (k % 3) * 0.15), w * 0.02, h * 0.05)
      }
      // 햇빛 반사 줄 (비스듬히)
      ctx.fillStyle = 'rgba(255,255,255,0.28)'
      for (const [x0, ww] of [[0.18, 0.12], [0.36, 0.05], [0.72, 0.09]] as const) {
        ctx.beginPath()
        ctx.moveTo(w * x0, h)
        ctx.lineTo(w * (x0 + ww), h)
        ctx.lineTo(w * (x0 + ww + 0.22), 0)
        ctx.lineTo(w * (x0 + 0.22), 0)
        ctx.fill()
      }
    })
    a.owned.push(t)
    const m = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.12, roughness: 0.15, metalness: 0.1 })
    a.owned.push(m)
    a.glows.push({ mat: m, day: 0.12, night: 0.85 })
    return m
  }
  const frameMat = mat('#3b3f4c', { rough: 0.5, metal: 0.3 })
  g.add(part(new THREE.PlaneGeometry(winW, 1.7), glassT(512, 256, true), [winX, 1.45, D / 2 + 0.035], { shadow: false }))
  // 창틀: 바깥 테두리 + 세로 살 둘 + 가로 살
  for (const [x, y, w, h] of [
    [winX, 2.32, winW + 0.1, 0.07],
    [winX, 0.6, winW + 0.1, 0.07],
    [winX - winW / 2, 1.45, 0.07, 1.8],
    [winX + winW / 2, 1.45, 0.07, 1.8],
    [winX - winW / 6, 1.45, 0.05, 1.7],
    [winX + winW / 6, 1.45, 0.05, 1.7],
    [winX, 1.95, winW, 0.04],
  ] as const)
    g.add(part(box(w, h, 0.06), frameMat, [x, y, D / 2 + 0.06]))
  g.add(part(box(winW + 0.12, 0.1, 0.12), mat(style.accent), [winX, 0.56, D / 2 + 0.08]))
  // 문 (유리 두 짝 + 손잡이 + 차양)
  const door = new THREE.Group()
  door.add(part(box(1.6, 2.4, 0.1), frameMat, [0, 1.2, 0]))
  const doorGlass = glassT(256, 384, false)
  for (const x of [-0.36, 0.36]) door.add(part(new THREE.PlaneGeometry(0.66, 2.1), doorGlass, [x, 1.15, 0.06], { shadow: false }))
  door.add(part(box(0.05, 2.2, 0.08), frameMat, [0, 1.15, 0.07]))
  for (const x of [-0.1, 0.1]) door.add(part(box(0.04, 0.5, 0.06), mat('#d9dde2', { metal: 0.6, rough: 0.3 }), [x, 1.15, 0.12]))
  door.add(part(roundBox(2.1, 0.08, 0.7, 0.03), mat(style.accent, { rough: 0.5 }), [0, 2.72, 0.32]))
  door.add(part(box(1.9, 0.06, 1.0), mat('#5c5f6b', { rough: 0.95 }), [0, 0.03, 0.62]))
  door.position.set(doorX, 0, D / 2)
  g.add(door)
  // 앞 턱
  g.add(part(box(W + 0.4, 0.08, 0.6), mat('#cfd2cc', { rough: 0.95 }), [0, 0.04, D / 2 + 0.32]))
  if (style.deco) {
    const d = new THREE.Group()
    d.position.z = D / 2
    style.deco(d, a)
    g.add(d)
  }
  g.position.set(0, 0, STORE_FRONT - D / 2)
  g.traverse((n) => (n.userData.shop = id))
  const outer = new THREE.Group()
  outer.add(g)
  return outer
}
