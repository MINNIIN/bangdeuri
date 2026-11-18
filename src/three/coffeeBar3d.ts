/**
 * 카페 뒷선반 커피 바: 에스프레소 머신 · 그라인더 · 탬퍼 · 스팀 피처 · 얼음통 · 시럽 펌프 · 우유/생수 병 · 컵 더미.
 * 바리스타가 음료를 만들 때 도구가 스스로 움직인다 (손 없이: 포터필터가 날아가 끼워지고, 피처가 기울어 붓고, 얼음이 퐁당).
 *
 * 카페 안 좌표 (가운데 원점, x 동쪽, z 남쪽). 뒷선반 윗면 y = BAR_Y, 앞 가장자리 z ≈ -2.9.
 * pose()는 "지금 몇 번째 단계를 얼마나 했는지"만 보고 모든 도구 자리를 정한다 → 중간에 들어와도 같은 모습.
 */
import * as THREE from 'three'
import type { Drink, Station } from '../lib/cafe'
import { box, canvasTexture, cone, cyl, mat, part, roundBox, sphere, torus } from './kit'

export const BAR_Y = 0.995

/** 단계별 컵 자리 · 1인칭으로 볼 곳 */
export const BAR_SPOT: Record<Station, { cup: [number, number, number]; look: [number, number, number] }> = {
  grinder: { cup: [2.4, BAR_Y, -2.98], look: [4.5, 1.16, -3.08] },
  machine: { cup: [3.72, 1.035, -3.06], look: [3.76, 1.1, -3.08] },
  steam: { cup: [2.95, BAR_Y, -2.98], look: [3.18, 1.1, -3.0] },
  syrup: { cup: [1.75, BAR_Y, -3.07], look: [1.75, 1.12, -3.08] },
  ice: { cup: [1.32, BAR_Y, -2.98], look: [1.12, 1.08, -3.02] },
  // 샷 붓기: 얼음 컵은 그 자리 그대로, 샷잔이 날아와서 기울인다
  pour: { cup: [1.32, BAR_Y, -2.98], look: [1.36, 1.1, -3.02] },
  pickup: { cup: [2.3, 1.06, -1.72], look: [2.3, 1.0, -1.25] },
}
/** 컵을 꺼내 두는 곳 (컵 더미 옆) */
export const CUP_START: [number, number, number] = [2.4, BAR_Y, -2.98]

const PUMP_X = [1.55, 1.75, 1.95]
const GROUP_X = [3.72, 4.08]
const HEAD_Y = 1.29
const HEAD_Z = -3.06
const GRINDER = { x: 4.55, z: -3.2 }
const PITCHER_REST: [number, number, number] = [3.18, BAR_Y, -3.12]
const WAND_TIP: [number, number, number] = [3.43, 1.13, -2.93]
const ICE = { x: 1.0, z: -3.15 }
const MILK_REST: [number, number, number] = [0.74, BAR_Y, -3.2]
const WATER_REST: [number, number, number] = [0.74, BAR_Y, -3.0]
/** 샷잔: 평소엔 물받이 오른쪽, 추출할 땐 왼쪽 그룹 아래 */
const SHOT_REST: [number, number, number] = [3.95, 1.035, -2.99]
const SHOT_SPOUT: [number, number, number] = [GROUP_X[0], 1.035, HEAD_Z]
const SHOT_R = 0.026
const SHOT_H = 0.055
/** 포터필터 손잡이 방향 (앞 왼쪽으로 비켜서 컵을 가리지 않게) */
const PF_TURN = -0.9

export interface BarState {
  /** 지금 단계 (없으면 쉬는 중) */
  at: Station | null
  /** 그 단계를 얼마나 했나 (0~1, 걸어가는 중이면 0) */
  k: number
  walking: boolean
  /** 이번 음료에서 이미 끝낸 단계들 */
  done: Station[]
  drink: Drink | null
  /** 컵 지금 음료 높이 (흐름 끝을 맞춘다) */
  cupTop: number
  /** 같은 단계가 두 번째인가 (뜨거운 물) */
  again: boolean
  /** 마무리 손질 (시럽 자리에서 뚜껑·빨대만, 펌프는 안 누른다) */
  finish?: boolean
}

export interface CoffeeBar {
  group: THREE.Group
  pose(s: BarState, t: number): void
  dispose(): void
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
/** k가 a~b 사이에서 0→1 (부드럽게) */
const span = (k: number, a: number, b: number) => {
  const x = clamp01((k - a) / (b - a))
  return x * x * (3 - 2 * x)
}

export function buildCoffeeBar(owned: { dispose(): void }[]): CoffeeBar {
  const g = new THREE.Group()
  const steel = mat('#d7dbe0', { metal: 0.75, rough: 0.25 })
  const steelDark = mat('#9aa1aa', { metal: 0.7, rough: 0.35 })
  const black = mat('#2b2a30', { rough: 0.5 })
  const glass = mat('#e8f6ff', { rough: 0.05, opacity: 0.35 })
  const add = (o: THREE.Object3D) => (g.add(o), o)
  const sm = (geo: THREE.BufferGeometry, m: THREE.Material, at: [number, number, number], o: Parameters<typeof part>[3] = {}) => part(geo, m, at, { shadow: false, ...o })
  const own = <T extends { dispose(): void }>(x: T) => (owned.push(x), x)

  // ─── 에스프레소 머신 (2그룹) ───
  {
    const cx = 3.9
    // 물받이 (격자 무늬)
    const grate = own(
      canvasTexture(128, 64, (ctx) => {
        ctx.fillStyle = '#2f3138'
        ctx.fillRect(0, 0, 128, 64)
        ctx.fillStyle = '#5c616b'
        for (let x = 4; x < 128; x += 8) ctx.fillRect(x, 4, 4, 56)
      }),
    )
    const grateMat = own(new THREE.MeshStandardMaterial({ map: grate, metalness: 0.6, roughness: 0.4 }))
    add(part(box(0.86, 0.04, 0.22), steelDark, [cx, 1.015, -3.03]))
    add(sm(new THREE.PlaneGeometry(0.82, 0.19), grateMat, [cx, 1.036, -3.03], { rot: [-Math.PI / 2, 0, 0] }))
    // 아래 몸통 (컵 자리 뒤) · 위 몸통 (그룹 헤드 위)
    add(part(roundBox(0.95, 0.3, 0.26, 0.03), steel, [cx, BAR_Y + 0.15, -3.33]))
    add(part(roundBox(0.95, 0.36, 0.5, 0.05), steel, [cx, 1.53, -3.2]))
    // 양옆 기둥
    for (const dx of [-0.455, 0.455]) add(part(box(0.04, 0.56, 0.48), steel, [cx + dx, 1.27, -3.2]))
    // 위 컵 데우는 판 + 난간 + 작은 잔 셋
    add(part(box(0.9, 0.015, 0.44), steelDark, [cx, 1.72, -3.2]))
    for (const x of [-0.44, 0.44]) add(sm(cyl(0.008, 0.008, 0.44, 6), steel, [cx + x, 1.75, -3.2], { rot: [Math.PI / 2, 0, 0] }))
    for (let i = 0; i < 3; i++) {
      add(sm(cyl(0.035, 0.03, 0.05, 12), mat('#ffffff', { rough: 0.35 }), [cx - 0.2 + i * 0.2, 1.755, -3.24], { rot: [Math.PI, 0, 0] }))
    }
    // 앞 판: 이름 · 압력계 둘 · 버튼
    const plate = own(
      canvasTexture(256, 64, (ctx) => {
        ctx.fillStyle = '#c4572a'
        ctx.fillRect(0, 0, 256, 64)
        ctx.fillStyle = '#fff3e0'
        ctx.font = `700 34px Galmuri11, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('BANGDEURI', 128, 34)
      }),
    )
    add(sm(new THREE.PlaneGeometry(0.34, 0.085), own(new THREE.MeshStandardMaterial({ map: plate, roughness: 0.5 })), [cx, 1.64, -2.948]))
    const gauge = own(
      canvasTexture(64, 64, (ctx) => {
        ctx.fillStyle = '#fbfaf5'
        ctx.beginPath()
        ctx.arc(32, 32, 30, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#2b2233'
        ctx.lineWidth = 2
        for (let i = 0; i <= 8; i++) {
          const a = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5
          ctx.beginPath()
          ctx.moveTo(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22)
          ctx.lineTo(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28)
          ctx.stroke()
        }
        ctx.fillStyle = '#59c26b'
        ctx.beginPath()
        ctx.arc(32, 32, 26, Math.PI * 1.6, Math.PI * 1.95)
        ctx.arc(32, 32, 22, Math.PI * 1.95, Math.PI * 1.6, true)
        ctx.fill()
      }),
    )
    const gaugeMat = own(new THREE.MeshStandardMaterial({ map: gauge, roughness: 0.4 }))
    for (const x of [-0.3, 0.3]) {
      add(sm(cyl(0.055, 0.055, 0.02, 20), steelDark, [cx + x, 1.56, -2.952], { rot: [Math.PI / 2, 0, 0] }))
      add(sm(new THREE.CircleGeometry(0.047, 20), gaugeMat, [cx + x, 1.56, -2.94]))
      add(sm(box(0.004, 0.035, 0.004), mat('#ff3b30'), [cx + x + 0.008, 1.568, -2.937], { rot: [0, 0, -0.5] }))
    }
    // 그룹마다 버튼 넷 (불 들어옴)
    const btnMat = own(new THREE.MeshStandardMaterial({ color: '#ffb35a', emissive: '#ffb35a', emissiveIntensity: 0.8, roughness: 0.4 }))
    for (const gx of GROUP_X) for (let i = 0; i < 4; i++) add(sm(cyl(0.011, 0.011, 0.01, 10), btnMat, [gx - 0.045 + i * 0.03, 1.47, -2.952], { rot: [Math.PI / 2, 0, 0] }))
    // 그룹 헤드
    for (const gx of GROUP_X) {
      add(part(cyl(0.06, 0.065, 0.06, 20), steel, [gx, HEAD_Y + 0.035, HEAD_Z]))
      add(sm(cyl(0.05, 0.05, 0.01, 20), steelDark, [gx, HEAD_Y + 0.005, HEAD_Z]))
    }
    // 오른쪽 그룹에는 늘 끼워 둔 포터필터
    add(portafilterMesh(steel, black, [GROUP_X[1], HEAD_Y - 0.025, HEAD_Z], 0.4))
    // 스팀 완드 (왼쪽) · 온수 꼭지 (오른쪽)
    add(sm(cyl(0.022, 0.022, 0.05, 12), black, [3.47, 1.62, -2.98]))
    add(sm(cyl(0.008, 0.008, 0.3, 8), steel, [3.455, 1.33, -2.95], { rot: [0.25, 0, 0.12] }))
    add(sm(sphere(0.012, 8, 6), steel, [WAND_TIP[0], WAND_TIP[1] + 0.05, WAND_TIP[2]]))
    add(sm(cyl(0.008, 0.008, 0.2, 8), steel, [4.33, 1.35, -2.95]))
    add(sm(cyl(0.022, 0.022, 0.05, 12), black, [4.33, 1.62, -2.98]))
  }

  // 움직이는 포터필터 (왼쪽 그룹 · 그라인더로 오간다) + 커피 가루
  const pf = new THREE.Group()
  pf.name = 'portafilter'
  pf.add(portafilterMesh(steel, black, [0, 0, 0], 0))
  const grounds = sm(cyl(0.043, 0.043, 0.02, 18), mat('#4a2c1a', { rough: 1 }), [0, 0.012, 0])
  pf.add(grounds)
  g.add(pf)

  // ─── 그라인더 ───
  {
    const { x, z } = GRINDER
    add(part(roundBox(0.2, 0.05, 0.26, 0.02), black, [x, BAR_Y + 0.025, z]))
    add(part(roundBox(0.17, 0.3, 0.2, 0.03), mat('#3b3646', { rough: 0.4 }), [x, BAR_Y + 0.2, z - 0.02]))
    // 원두 통 (투명) + 원두
    add(part(cyl(0.07, 0.04, 0.05, 16), black, [x, BAR_Y + 0.37, z - 0.02]))
    add(sm(cone(0.085, 0.2, 16), glass, [x, BAR_Y + 0.5, z - 0.02], { rot: [Math.PI, 0, 0] }))
    const bean = mat('#5a3420', { rough: 0.6 })
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4
      const r = 0.015 + (i % 4) * 0.012
      add(sm(sphere(0.012, 6, 4), bean, [x + Math.cos(a) * r, BAR_Y + 0.42 + (i % 5) * 0.012, z - 0.02 + Math.sin(a) * r], { scale: [1, 0.7, 0.8] }))
    }
    // 배출구 · 포터필터 걸이 · 작은 화면
    add(sm(box(0.04, 0.05, 0.05), black, [x, BAR_Y + 0.25, z + 0.09]))
    add(sm(box(0.1, 0.012, 0.06), steelDark, [x, BAR_Y + 0.12, z + 0.1]))
    add(sm(box(0.06, 0.03, 0.005), own(new THREE.MeshStandardMaterial({ color: '#7cf0ff', emissive: '#7cf0ff', emissiveIntensity: 0.7 })), [x, BAR_Y + 0.32, z + 0.081]))
  }
  // 탬퍼 · 탬핑 매트
  add(sm(box(0.12, 0.012, 0.12), mat('#3b3646', { rough: 0.9 }), [4.37, BAR_Y + 0.006, -2.98]))
  const tamper = new THREE.Group()
  tamper.name = 'tamper'
  tamper.add(sm(cyl(0.042, 0.042, 0.02, 18), steel, [0, 0.01, 0]))
  tamper.add(sm(cyl(0.012, 0.016, 0.05, 10), steel, [0, 0.045, 0]))
  // 나무 손잡이: 아래가 잘록한 원기둥 + 둥근 머리
  const wood = mat('#8a5a38', { rough: 0.5 })
  tamper.add(sm(cyl(0.024, 0.017, 0.045, 20), wood, [0, 0.085, 0]))
  tamper.add(sm(sphere(0.024, 20, 12), wood, [0, 0.108, 0], { scale: [1, 0.55, 1] }))
  g.add(tamper)

  // ─── 스팀 피처 (우유) ───
  const pitcher = new THREE.Group()
  pitcher.name = 'pitcher'
  {
    // 안쪽 벽도 보이게 (위에서 내려다보면 속이 비어 보이지 않게) + 말린 입술 + 부리
    const steelIn = own(new THREE.MeshStandardMaterial({ color: '#b9bfc7', metalness: 0.7, roughness: 0.3, side: THREE.BackSide }))
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.11, 32, 1, true), steel)
    own(body.geometry)
    body.position.y = 0.055
    pitcher.add(body)
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.048, 0.106, 32, 1, true), steelIn)
    own(inner.geometry)
    inner.position.y = 0.057
    pitcher.add(inner)
    pitcher.add(sm(torus(0.04, 0.0025), steel, [0, 0.11, 0], { rot: [Math.PI / 2, 0, 0] }))
    pitcher.add(sm(cyl(0.05, 0.05, 0.006, 32), steel, [0, 0.003, 0]))
    pitcher.add(sm(cone(0.014, 0.03, 20), steel, [0.044, 0.104, 0], { rot: [0, 0, -1.25], scale: [1, 1, 0.7] }))
    pitcher.add(sm(torus(0.03, 0.006), steel, [-0.055, 0.06, 0], { rot: [0, 0, Math.PI / 2] }))
  }
  const pitcherMilk = sm(cyl(0.039, 0.039, 0.005, 32), mat('#fffaf2', { rough: 0.6 }), [0, 0.06, 0])
  pitcher.add(pitcherMilk)
  g.add(pitcher)

  // ─── 샷잔 (아이스 커피는 여기에 뽑아서 얼음 컵에 붓는다) ───
  const shotGlass = new THREE.Group()
  shotGlass.name = 'shotglass'
  const shotLiquid = new THREE.Mesh(new THREE.CylinderGeometry(SHOT_R * 0.88, SHOT_R * 0.8, 1, 24), own(new THREE.MeshStandardMaterial({ color: '#3a1f12', roughness: 0.25 })))
  own(shotLiquid.geometry)
  shotLiquid.geometry.translate(0, 0.5, 0)
  shotLiquid.position.y = 0.004
  {
    const gm = own(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }))
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(SHOT_R, SHOT_R * 0.85, SHOT_H, 24, 1, true), gm)
    own(wall.geometry)
    wall.position.y = SHOT_H / 2
    wall.renderOrder = 2
    shotGlass.add(wall)
    shotGlass.add(sm(cyl(SHOT_R * 0.85, SHOT_R * 0.85, 0.006, 24), gm, [0, 0.003, 0]))
    shotGlass.add(sm(torus(SHOT_R, 0.0018), mat('#ffffff', { opacity: 0.6, rough: 0.1 }), [0, SHOT_H, 0], { rot: [Math.PI / 2, 0, 0] }))
    shotGlass.add(shotLiquid)
  }
  g.add(shotGlass)

  // ─── 얼음통 + 집게 ───
  {
    const { x, z } = ICE
    add(part(box(0.44, 0.16, 0.36), mat('#eef3f7', { rough: 0.3 }), [x, BAR_Y + 0.08, z]))
    add(sm(box(0.4, 0.01, 0.32), mat('#c9e9ff', { rough: 0.1, opacity: 0.7 }), [x, BAR_Y + 0.15, z]))
    const cube = mat('#f2fbff', { rough: 0.1, opacity: 0.8 })
    for (let i = 0; i < 16; i++) add(sm(box(0.04, 0.035, 0.04), cube, [x - 0.15 + (i % 4) * 0.1, BAR_Y + 0.165, z - 0.12 + Math.floor(i / 4) * 0.08], { rot: [i * 0.3, i * 0.7, 0] }))
    add(sm(box(0.03, 0.012, 0.22), steel, [x + 0.12, BAR_Y + 0.18, z + 0.02], { rot: [0, 0.4, 0.1] }))
  }
  // 떨어지는 얼음 (퐁당)
  const iceDrops: THREE.Mesh[] = []
  {
    const cube = own(new THREE.MeshStandardMaterial({ color: '#eaf8ff', roughness: 0.1, transparent: true, opacity: 0.85 }))
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(box(0.034, 0.03, 0.034), cube)
      m.visible = false
      m.name = 'icedrop'
      iceDrops.push(m)
      g.add(m)
    }
  }

  // ─── 우유 병 · 생수 병 ───
  const bottle = (color: string, label: string, labelColor: string) => {
    const b = new THREE.Group()
    b.add(sm(cyl(0.045, 0.045, 0.2, 16), mat(color, { rough: 0.3, opacity: color === '#ffffff' ? 1 : 0.6 }), [0, 0.1, 0]))
    b.add(sm(cyl(0.045, 0.022, 0.05, 16), mat(color, { rough: 0.3, opacity: color === '#ffffff' ? 1 : 0.6 }), [0, 0.225, 0]))
    b.add(sm(cyl(0.022, 0.022, 0.02, 12), mat(labelColor), [0, 0.26, 0]))
    const t = own(
      canvasTexture(128, 48, (ctx) => {
        ctx.fillStyle = labelColor
        ctx.fillRect(0, 0, 128, 48)
        ctx.fillStyle = '#ffffff'
        ctx.font = `700 28px Galmuri11, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, 64, 26)
      }),
    )
    const lm = own(new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }))
    const lg = own(new THREE.CylinderGeometry(0.0455, 0.0455, 0.06, 16, 1, true, -Math.PI / 2, Math.PI))
    const l = new THREE.Mesh(lg, lm)
    l.position.y = 0.1
    b.add(l)
    return b
  }
  const milk = bottle('#ffffff', '우유', '#5aa9e6')
  milk.name = 'milk'
  g.add(milk)
  const water = bottle('#cfeef8', '생수', '#59c26b')
  water.name = 'water'
  g.add(water)

  // ─── 시럽 펌프 셋 (딸기 · 초코 · 녹차) ───
  const SYRUP = ['#ff4f6d', '#4a2414', '#4f8a3a']
  const pumps: THREE.Group[] = []
  PUMP_X.forEach((x, i) => {
    add(part(cyl(0.05, 0.05, 0.24, 16), mat(SYRUP[i], { rough: 0.3, opacity: 0.85 }), [x, BAR_Y + 0.12, -3.25]))
    add(sm(cyl(0.03, 0.05, 0.03, 16), black, [x, BAR_Y + 0.255, -3.25]))
    const head = new THREE.Group()
    head.name = `pump${i}`
    head.add(sm(cyl(0.008, 0.008, 0.08, 8), steel, [0, 0.04, 0]))
    head.add(sm(roundBox(0.05, 0.022, 0.05, 0.01), black, [0, 0.085, 0]))
    head.add(sm(cyl(0.006, 0.006, 0.17, 8), black, [0, 0.07, 0.085], { rot: [Math.PI / 2, 0, 0] }))
    head.add(sm(cyl(0.006, 0.006, 0.03, 8), black, [0, 0.055, 0.17]))
    head.position.set(x, BAR_Y + 0.27, -3.25)
    g.add(head)
    pumps.push(head)
  })

  // ─── 컵 더미 (투명 컵 · 머그) ───
  for (let i = 0; i < 5; i++) add(sm(cyl(0.07, 0.052, 0.17, 16, ), mat('#ffffff', { opacity: 0.35, rough: 0.05 }), [2.22, BAR_Y + 0.085 + i * 0.02, -3.2]))
  for (let i = 0; i < 3; i++) add(sm(cyl(0.068, 0.06, 0.17, 16), mat('#fffaf2', { rough: 0.35 }), [2.58, BAR_Y + 0.085 + i * 0.17, -3.22]))

  // ─── 흐르는 것: 커피 줄기 둘 · 가루 · 우유/물/시럽 줄기 · 김 ───
  const streamMat = own(new THREE.MeshStandardMaterial({ color: '#3a1f12', roughness: 0.3, transparent: true, opacity: 0.92 }))
  const streamGeo = own(new THREE.CylinderGeometry(1, 1, 1, 8))
  const stream = (r: number) => {
    const m = new THREE.Mesh(streamGeo, streamMat.clone())
    owned.push(m.material as THREE.Material)
    m.scale.set(r, 1, r)
    m.visible = false
    m.name = 'stream'
    g.add(m)
    return m
  }
  const shots = [stream(0.005), stream(0.005)]
  const pour = stream(0.009)
  const shotPour = stream(0.0045)
  const groundsFall = stream(0.007)
  // 시럽: 가늘고 반들한 줄기 + 끝에 맺혀 떨어지는 방울 (굵은 막대처럼 보이지 않게)
  const syrupStream = stream(0.0028)
  const syrupDrops: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(sphere(0.006, 12, 8), streamMat.clone())
    owned.push(m.material as THREE.Material)
    m.visible = false
    m.name = 'syrupdrop'
    syrupDrops.push(m)
    g.add(m)
  }
  /** 위(a)에서 아래(b)로 줄기 */
  const setStream = (m: THREE.Mesh, a: [number, number, number], b: [number, number, number], color: string, on: boolean) => {
    m.visible = on
    if (!on) return
    const len = Math.max(0.005, a[1] - b[1])
    m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    m.scale.y = len
    ;(m.material as THREE.MeshStandardMaterial).color.set(color)
  }
  // 김: 가장자리가 흐린 부드러운 연기 조각 (각진 공 대신)
  const puffTex = own(
    canvasTexture(64, 64, (ctx) => {
      const r = ctx.createRadialGradient(32, 32, 2, 32, 32, 31)
      r.addColorStop(0, 'rgba(255,255,255,0.9)')
      r.addColorStop(0.45, 'rgba(255,255,255,0.45)')
      r.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = r
      ctx.fillRect(0, 0, 64, 64)
    }),
  )
  const puffs: THREE.Sprite[] = []
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0.5 })))
    m.visible = false
    m.name = 'puff'
    puffs.push(m)
    g.add(m)
  }

  const v3 = (p: [number, number, number]) => new THREE.Vector3(...p)
  const pfRest = v3([GROUP_X[0], HEAD_Y - 0.025, HEAD_Z])
  const pfGrind = v3([GRINDER.x, BAR_Y + 0.135, GRINDER.z + 0.11])
  const tamperRest = v3([4.37, BAR_Y + 0.012, -2.98])
  const tmp = new THREE.Vector3()

  const pose = (s: BarState, t: number) => {
    const { at, k, done, drink } = s
    const has = (st: Station) => done.includes(st)
    const working = (st: Station) => at === st && !s.walking

    // 포터필터: 머신(빈 채) → 그라인더 걸이에서 가루 받고 다지기 → 머신에 끼우기
    const espresso = !!drink?.espresso
    let pfPos = pfRest
    let pfTurn = PF_TURN
    let fill = 0
    if (espresso && working('grinder')) {
      const up = span(k, 0, 0.12)
      pfPos = tmp.lerpVectors(pfRest, pfGrind, up).setY(lerp(pfRest.y, pfGrind.y, up) + Math.sin(up * Math.PI) * 0.12)
      pfTurn = lerp(PF_TURN, 0, up)
      fill = span(k, 0.15, 0.6)
    } else if (espresso && (has('grinder') && !has('machine')) && !working('machine')) {
      pfPos = pfGrind
      pfTurn = 0
      fill = 1
    } else if (espresso && working('machine') && !s.again) {
      const back = span(k, 0, 0.18)
      pfPos = tmp.lerpVectors(pfGrind, pfRest, back).setY(lerp(pfGrind.y, pfRest.y, back) + Math.sin(back * Math.PI) * 0.14)
      pfTurn = lerp(0, PF_TURN, span(k, 0.14, 0.22))
      fill = 1 - span(k, 0.85, 1) * 0.3
    } else if (espresso && has('machine')) fill = 0.7
    pf.position.copy(pfPos)
    pf.rotation.y = pfTurn
    grounds.visible = fill > 0.02
    grounds.scale.set(1, Math.max(0.05, fill), 1)
    // 가루 떨어지는 줄기
    const grinding = espresso && working('grinder') && k > 0.15 && k < 0.6
    setStream(groundsFall, [GRINDER.x, BAR_Y + 0.23, GRINDER.z + 0.11], [GRINDER.x, pfGrind.y + 0.02 + fill * 0.02, GRINDER.z + 0.11], '#4a2c1a', grinding)
    if (grinding) groundsFall.position.x += Math.sin(t * 40) * 0.002

    // 탬퍼: 가루 위로 와서 꾹꾹 두 번
    {
      let p = tamperRest
      if (espresso && working('grinder') && k > 0.62) {
        const go = span(k, 0.62, 0.72)
        const back = span(k, 0.92, 1)
        const press = Math.max(0, Math.sin(((k - 0.72) / 0.2) * Math.PI * 2)) * (k > 0.72 && k < 0.92 ? 1 : 0)
        const above = pfGrind.clone().setY(pfGrind.y + 0.09 - press * 0.05)
        p = tmp.lerpVectors(tamperRest, above, go * (1 - back))
        if (go > 0 && back < 1) p.y += Math.sin(go * Math.PI) * 0.05
      }
      tamper.position.copy(p)
    }

    // 샷잔: 아이스 커피는 추출구 아래 샷잔에 받아 두었다가 → 얼음 컵 위로 날아가 기울여 붓고 → 제자리로
    const shotMode = !!drink?.espresso && !!drink.iced
    let shotFill = 0
    {
      const rest = v3(SHOT_REST)
      const spout = v3(SHOT_SPOUT)
      const p = rest.clone()
      let tilt = 0
      if (shotMode && working('machine')) {
        const go = span(k, 0, 0.15)
        p.lerpVectors(rest, spout, go)
        p.y += Math.sin(go * Math.PI) * 0.06
        shotFill = span(k, 0.25, 0.95)
      } else if (shotMode && has('machine') && !has('pour') && !working('pour')) {
        p.copy(spout)
        shotFill = 1
      } else if (shotMode && working('pour')) {
        const cup = BAR_SPOT.pour.cup
        const above = new THREE.Vector3(cup[0] + 0.075, cup[1] + 0.24, cup[2])
        const go = span(k, 0, 0.22)
        const back = span(k, 0.88, 1)
        p.lerpVectors(spout, above, go)
        p.y += Math.sin(go * Math.PI) * 0.1
        if (back > 0) {
          p.lerpVectors(above, rest, back)
          p.y += Math.sin(back * Math.PI) * 0.1
        }
        tilt = span(k, 0.22, 0.34) * 1.9 * (1 - back)
        shotFill = 1 - span(k, 0.35, 0.85)
      }
      shotGlass.position.copy(p)
      shotGlass.rotation.set(0, 0, tilt)
      shotLiquid.visible = shotFill > 0.02
      shotLiquid.scale.y = Math.max(0.001, shotFill * (SHOT_H - 0.012))
      // 기울어진 잔 입술(왼쪽)에서 컵으로 가는 줄기
      const lip = new THREE.Vector3(-SHOT_R, SHOT_H, 0).applyEuler(shotGlass.rotation).add(shotGlass.position)
      setStream(shotPour, [lip.x, lip.y, lip.z], [lip.x, s.cupTop, lip.z], '#3a1f12', shotMode && working('pour') && k > 0.34 && k < 0.85)
    }

    // 커피 머신: 두 줄기 (두 번째 'machine'이면 뜨거운 물 한 줄기)
    {
      const extracting = working('machine') && k > 0.25 && k < 0.95
      const color = s.again ? '#b9d9e6' : k < 0.45 ? '#2a140a' : '#6b3b1c'
      const bottom = shotMode && !s.again ? SHOT_SPOUT[1] + 0.006 + shotFill * (SHOT_H - 0.012) : s.cupTop
      setStream(shots[0], [GROUP_X[0] - 0.012, HEAD_Y - 0.06, HEAD_Z], [GROUP_X[0] - 0.012, bottom, HEAD_Z], color, extracting)
      setStream(shots[1], [GROUP_X[0] + 0.012, HEAD_Y - 0.06, HEAD_Z], [GROUP_X[0] + 0.012, bottom, HEAD_Z], color, extracting && !s.again)
      for (const m of shots) if (m.visible) m.scale.x = m.scale.z = 0.004 + Math.sin(t * 30 + m.id) * 0.0008
    }

    // 스팀 피처: 완드 아래로 → 치익 (김) → 컵 위에서 기울여 붓기
    {
      const p = new THREE.Vector3(...PITCHER_REST)
      let tilt = 0
      let milkLv = 0
      let steaming = false
      let pouring = false
      if (working('steam')) {
        const toWand = span(k, 0, 0.12)
        const toCup = span(k, 0.6, 0.72)
        const wand = new THREE.Vector3(WAND_TIP[0] - 0.01, WAND_TIP[1] - 0.09, WAND_TIP[2])
        const cupAbove = new THREE.Vector3(BAR_SPOT.steam.cup[0] + 0.1, BAR_SPOT.steam.cup[1] + 0.22, BAR_SPOT.steam.cup[2])
        p.lerp(wand, toWand)
        p.lerp(cupAbove, toCup)
        steaming = k > 0.12 && k < 0.6
        if (steaming) p.x += Math.sin(t * 25) * 0.004
        milkLv = 0.4 + span(k, 0.12, 0.6) * 0.5 - span(k, 0.72, 0.98) * 0.85
        tilt = span(k, 0.68, 0.78) * 1.25
        pouring = k > 0.74 && k < 0.98
      }
      pitcher.position.copy(p)
      pitcher.rotation.set(0, Math.PI, -tilt)
      pitcherMilk.visible = milkLv > 0.05
      pitcherMilk.position.y = 0.01 + milkLv * 0.09
      const spout = new THREE.Vector3(0.05, 0.105, 0).applyEuler(pitcher.rotation).add(p)
      setStream(pour, [spout.x, spout.y, spout.z], [spout.x, s.cupTop, spout.z], '#fffaf2', pouring)
      // 김
      puffs.forEach((m, i) => {
        const on = steaming || (working('machine') && k > 0.25 && k < 0.95 && i < 2)
        m.visible = on
        if (!on) return
        const ph = (t * 0.9 + i / puffs.length) % 1
        const base = steaming ? WAND_TIP : ([GROUP_X[0], HEAD_Y - 0.02, HEAD_Z] as const)
        m.position.set(base[0] + Math.sin(t * 2 + i * 2) * 0.03 * ph, base[1] + ph * 0.3, base[2] + 0.02)
        m.scale.setScalar(0.035 + ph * 0.11)
        ;(m.material as THREE.SpriteMaterial).opacity = 0.55 * (1 - ph) * Math.min(1, ph * 6)
      })
    }

    // 얼음: 하나씩 퐁당 → 우유(또는 생수) 붓기
    {
      const cup = BAR_SPOT.ice.cup
      const icing = working('ice')
      iceDrops.forEach((m, i) => {
        const k0 = 0.05 + i * 0.07
        const q = icing ? clamp01((k - k0) / 0.1) : 0
        m.visible = icing && q > 0 && q < 1
        if (!m.visible) return
        m.position.set(lerp(ICE.x + 0.08, cup[0] + (i % 2 ? 0.015 : -0.015), q), BAR_Y + 0.22 + Math.sin(q * Math.PI) * 0.12 - q * 0.05, lerp(ICE.z + 0.05, cup[2], q))
        m.rotation.set(q * 5 + i, q * 3, 0)
      })
      const useMilk = !!drink?.milk
      const pourB = useMilk ? milk : water
      const restB = useMilk ? MILK_REST : WATER_REST
      for (const [b, rest] of [
        [milk, MILK_REST],
        [water, WATER_REST],
      ] as const) {
        b.position.set(...rest)
        b.rotation.set(0, 0, 0)
      }
      if (icing && k > 0.45) {
        const go = span(k, 0.45, 0.58) * (1 - span(k, 0.92, 1))
        const above = new THREE.Vector3(cup[0] - 0.2, cup[1] + 0.3, cup[2])
        pourB.position.lerpVectors(new THREE.Vector3(...restB), above, go)
        pourB.rotation.z = -go * 1.35
        const mouth = new THREE.Vector3(0, 0.27, 0).applyEuler(pourB.rotation).add(pourB.position)
        setStream(pour, [mouth.x, mouth.y, mouth.z], [mouth.x, s.cupTop, mouth.z], useMilk ? '#fffaf2' : '#d6f0ff', k > 0.58 && k < 0.9)
      } else if (!working('steam')) pour.visible = false
    }

    // 시럽 펌프: 꾹 꾹 두 번
    pumps.forEach((h, i) => {
      const mine = working('syrup') && !s.finish && pumpOf(drink) === i
      const press = mine ? Math.max(span(k, 0.15, 0.25) - span(k, 0.3, 0.4), span(k, 0.45, 0.55) - span(k, 0.6, 0.7)) : 0
      h.position.y = BAR_Y + 0.27 - press * 0.04
    })
    {
      const i = pumpOf(drink)
      const pumping = working('syrup') && !s.finish
      const on = pumping && ((k > 0.2 && k < 0.36) || (k > 0.5 && k < 0.66))
      // 펌프 꼭지 끝 (머리에서 앞쪽 0.17 · 아래로)
      const tipY = pumps[i].position.y + 0.04
      const x = PUMP_X[i]
      const z = -3.25 + 0.17
      setStream(syrupStream, [x, tipY, z], [x, s.cupTop, z], SYRUP[i], on)
      if (on) syrupStream.position.x += Math.sin(t * 18) * 0.0012
      // 누를 때마다 끝에 방울이 맺혀 똑 떨어진다
      syrupDrops.forEach((m, n) => {
        const k0 = [0.36, 0.66, 0.72][n]
        const q = pumping ? clamp01((k - k0) / 0.08) : 0
        m.visible = pumping && q > 0 && q < 1
        if (!m.visible) return
        m.position.set(x, lerp(tipY - 0.006, s.cupTop, q * q), z)
        m.scale.set(0.8, 1.3, 0.8)
        ;(m.material as THREE.MeshStandardMaterial).color.set(SYRUP[i])
      })
    }
  }

  return {
    group: g,
    pose,
    dispose: () => undefined,
  }
}

/** 시럽 음료는 어느 펌프를 쓰나 (딸기 · 초코 · 녹차) */
export const pumpOf = (d: Drink | null) => (d?.id === 'choco' ? 1 : d?.id === 'matcha' ? 2 : 0)

/** 포터필터 (손잡이가 앞쪽으로) */
function portafilterMesh(steel: THREE.Material, black: THREE.Material, at: [number, number, number], turn: number) {
  const g = new THREE.Group()
  g.add(part(cyl(0.05, 0.045, 0.035, 18), steel, [0, 0, 0], { shadow: false }))
  g.add(part(cyl(0.008, 0.008, 0.06, 8), steel, [0, -0.005, 0.07], { rot: [Math.PI / 2, 0, 0], shadow: false }))
  g.add(part(cyl(0.015, 0.012, 0.12, 10), black, [0, 0.005, 0.16], { rot: [Math.PI / 2 + 0.2, 0, 0], shadow: false }))
  g.position.set(...at)
  g.rotation.y = turn
  return g
}
