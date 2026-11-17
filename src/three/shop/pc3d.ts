/**
 * 방들이PC방 3D. 어둑한 방에 모니터·키보드 RGB가 빛난다.
 * 안: 벽 쪽 PC 4대 + 가운데 책상 PC 4대 (모두 북쪽을 본다) · 음료 냉장고 · 라면 카운터.
 * 골목 건물: 어두운 남색 벽 + 하늘색 네온 간판, 창에 가짜 포스터.
 */
import * as THREE from 'three'
import {
  PC_COUNTER,
  PC_DESK_A_Z,
  PC_DESK_B_Z,
  PC_DESK_X0,
  PC_DESK_X1,
  PC_FRIDGE,
  PC_ROW_A_Z,
  PC_ROW_B_Z,
  PC_SEAT_X,
  PC_SHOP,
} from '../../lib/shop/pc'
import { STORE_DOOR_DX, STORE_W } from '../../lib/town'
import { bakeStatic, box, canvasTexture, cyl, mat, part, roundBox, sphere, fillFit } from '../kit'
import type { PlaceAnims } from '../places3d'
import { FONT, type ShopArt, shopFront, shopKit, shopRoom } from './common'

const DEF = PC_SHOP
const CAN = ['#ff5a4f', '#7cf0ff', '#59c26b', '#ffd94a', '#b48cff', '#ff8fb8']

/** 가짜 게임 화면 3가지 (블록 쌓기 · 우주 슈팅 · 레이싱) */
function drawScreen(kind: number) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    if (kind === 0) {
      ctx.fillStyle = '#141a3a'
      ctx.fillRect(0, 0, w, h)
      const c = ['#ff5a4f', '#ffd94a', '#59c26b', '#5aa9e6', '#b48cff']
      const s = 12
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 10; x++) {
          if ((x + y * 3) % 7 === 0) continue
          ctx.fillStyle = c[(x + y) % c.length]
          ctx.fillRect(w / 2 - 60 + x * s, h - 8 - (y + 1) * s, s - 1, s - 1)
        }
      ctx.fillStyle = '#7cf0ff'
      ctx.fillRect(w / 2 - 12, 14, s * 2 - 1, s - 1)
      ctx.fillRect(w / 2, 14 + s, s - 1, s - 1)
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 14px ${FONT}`
      ctx.fillText('SCORE 4200', 6, 18)
    } else if (kind === 1) {
      ctx.fillStyle = '#07081a'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#ffffff'
      for (let i = 0; i < 40; i++) ctx.fillRect((i * 53) % w, (i * 31) % h, 2, 2)
      // 내 비행기 · 적 · 총알
      ctx.fillStyle = '#7cf0ff'
      ctx.beginPath()
      ctx.moveTo(w / 2, h - 30)
      ctx.lineTo(w / 2 - 12, h - 8)
      ctx.lineTo(w / 2 + 12, h - 8)
      ctx.fill()
      ctx.fillStyle = '#ffd94a'
      for (let i = 0; i < 4; i++) ctx.fillRect(w / 2 - 1, h - 44 - i * 14, 3, 8)
      ctx.fillStyle = '#ff5a4f'
      for (const [x, y] of [[40, 24], [90, 40], [150, 20], [200, 36]]) ctx.fillRect(x, y, 16, 10)
    } else {
      ctx.fillStyle = '#7cc6ff'
      ctx.fillRect(0, 0, w, h / 2)
      ctx.fillStyle = '#59c26b'
      ctx.fillRect(0, h / 2, w, h / 2)
      ctx.fillStyle = '#4a4f5c'
      ctx.beginPath()
      ctx.moveTo(w / 2 - 8, h / 2)
      ctx.lineTo(w / 2 + 8, h / 2)
      ctx.lineTo(w - 20, h)
      ctx.lineTo(20, h)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      for (let i = 0; i < 4; i++) ctx.fillRect(w / 2 - 2, h / 2 + 6 + i * 16, 4, 8 + i * 2)
      ctx.fillStyle = '#ff5a4f'
      ctx.fillRect(w / 2 - 20, h - 34, 40, 20)
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 14px ${FONT}`
      ctx.fillText('1위', 8, 18)
    }
  }
}

function interior() {
  const g = new THREE.Group()
  const owned: { dispose(): void }[] = []
  shopRoom(
    DEF,
    {
      floor: (ctx, w, h) => {
        // 어두운 카펫 타일
        ctx.fillStyle = '#3b4063'
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#434970'
        ctx.fillRect(0, 0, w / 2, h / 2)
        ctx.fillRect(w / 2, h / 2, w / 2, h / 2)
        ctx.strokeStyle = '#30344f'
        ctx.lineWidth = 2
        ctx.strokeRect(0, 0, w, h)
      },
      wall: '#353a5c',
      trim: '#5aa9e6',
      matText: '안녕히 가세요',
      matColor: '#3a7fc2',
      frame: '#1d2033',
    },
    g,
    owned,
  )
  const { tex, texMat, label, glow, hit } = shopKit(g, owned)
  const W = DEF.hw
  const D = DEF.hd

  // RGB (키보드 · 본체 · 책상 밑 띠): 하나를 같이 쓰고 tick에서 색을 돈다
  const rgb = glow('#ff3bd4', 1.4)
  const screens = [0, 1, 2].map((k) => texMat(tex(256, 160, drawScreen(k)), { glow: 0.95, rough: 0.3 }))
  const dark = mat('#1b1d2a', { rough: 0.5 })
  const deskTop = mat('#5a6088', { rough: 0.45 })
  const chairBody = mat('#22243a', { rough: 0.6 })
  const chairRed = mat('#ff4f7a', { rough: 0.55 })
  const chairBlue = mat('#3fb6ff', { rough: 0.55 })
  const metal = mat('#9aa0ad', { metal: 0.5, rough: 0.35 })

  // ─── 북쪽 벽: 네온 간판 · LED 띠 ───
  const neon = glow('#7cf0ff', 1.3)
  g.add(part(box(3.6, 0.5, 0.04), texMat(label('방들이PC방', '#14182a', '#7cf0ff', 512, 72, 50), { glow: 0.9 }), [-3.1, 2.45, -D + 0.03], { shadow: false }))
  g.add(part(box(3.8, 0.04, 0.04), neon, [-3.1, 2.17, -D + 0.05], { shadow: false }))
  g.add(part(box(3.8, 0.04, 0.04), neon, [-3.1, 2.73, -D + 0.05], { shadow: false }))
  g.add(part(box(W * 2, 0.05, 0.06), rgb, [0, 2.9, -D + 0.05], { shadow: false }))
  g.add(part(box(0.06, 0.05, D * 2), rgb, [-W + 0.05, 2.9, 0], { shadow: false }))
  // 서쪽 벽 포스터 (가짜 게임)
  g.add(part(box(0.04, 1.0, 0.72), texMat(label('우주 대결', '#3b2a7a', '#ffd94a', 128, 180, 30), { glow: 0.3 }), [-W + 0.03, 1.8, 1.4]))
  g.add(part(box(0.04, 1.0, 0.72), texMat(label('신작 업데이트', '#ff4f7a', '#ffffff', 160, 220, 24), { glow: 0.3 }), [-W + 0.03, 1.8, 2.5]))

  // ─── 책상 + PC 한 자리 ───
  const desk = (zc: number, wallSide: boolean) => {
    const x0 = PC_DESK_X0
    const x1 = PC_DESK_X1
    const cx = (x0 + x1) / 2
    g.add(part(box(x1 - x0, 0.05, 0.72), deskTop, [cx, 0.74, zc]))
    for (const x of [x0 + 0.08, (x0 + x1) / 2, x1 - 0.08]) g.add(part(box(0.06, 0.72, 0.6), dark, [x, 0.36, zc]))
    // 책상 밑 RGB 띠 (손님 쪽 모서리)
    g.add(part(box(x1 - x0, 0.025, 0.02), rgb, [cx, 0.71, zc + 0.36], { shadow: false }))
    // 가운데 책상: 북쪽에 낮은 칸막이
    if (!wallSide) g.add(part(box(x1 - x0, 0.42, 0.04), mat('#4a4f6a', { rough: 0.5 }), [cx, 0.98, zc - 0.34]))
  }
  desk(PC_DESK_A_Z, true)
  desk(PC_DESK_B_Z, false)

  const station = (x: number, zDesk: number, i: number) => {
    const zm = zDesk - 0.16
    // 모니터 (받침 + 테두리 + 화면)
    g.add(part(box(0.22, 0.02, 0.16), dark, [x, 0.775, zm], { shadow: false }))
    g.add(part(box(0.05, 0.22, 0.04), dark, [x, 0.88, zm - 0.03], { shadow: false }))
    g.add(part(roundBox(0.7, 0.44, 0.05, 0.02), dark, [x, 1.15, zm]))
    g.add(part(new THREE.PlaneGeometry(0.64, 0.38), screens[i % 3], [x, 1.15, zm + 0.027], { shadow: false }))
    // 키보드 (RGB 자판) · 마우스 패드 · 마우스
    g.add(part(box(0.44, 0.025, 0.14), dark, [x - 0.05, 0.775, zDesk + 0.14], { shadow: false }))
    g.add(part(box(0.4, 0.008, 0.1), rgb, [x - 0.05, 0.79, zDesk + 0.14], { shadow: false }))
    g.add(part(box(0.24, 0.006, 0.2), mat('#2a2d40'), [x + 0.3, 0.768, zDesk + 0.14], { shadow: false }))
    g.add(part(sphere(0.035, 10, 6), mat('#e8e8f0'), [x + 0.3, 0.78, zDesk + 0.14], { scale: [0.8, 0.5, 1.2], shadow: false }))
    // 본체 (책상 위 옆, 옆판이 빛난다)
    const tx = x + 0.44
    if (tx < PC_DESK_X1 - 0.1) {
      g.add(part(box(0.18, 0.4, 0.4), dark, [tx, 0.97, zDesk - 0.08], { shadow: false }))
      g.add(part(box(0.005, 0.32, 0.32), rgb, [tx - 0.093, 0.97, zDesk - 0.08], { shadow: false }))
    }
    // 헤드셋 (모니터에 걸쳐 있다)
    if (i % 2 === 0) g.add(part(new THREE.TorusGeometry(0.1, 0.018, 6, 14, Math.PI), mat(i % 4 ? '#3fb6ff' : '#ff4f7a'), [x + 0.3, 1.38, zm], { shadow: false }))
  }
  const chair = (x: number, z: number, i: number) => {
    // 게이밍 의자: 다리 받침 · 기둥 · 방석(윗면 0.45) · 등받이(남쪽) · 팔걸이
    const accent = i % 2 ? chairBlue : chairRed
    g.add(part(cyl(0.24, 0.24, 0.04, 5), dark, [x, 0.04, z], { shadow: false }))
    g.add(part(cyl(0.035, 0.035, 0.34, 8), metal, [x, 0.22, z], { shadow: false }))
    g.add(part(roundBox(0.48, 0.08, 0.46, 0.03), chairBody, [x, 0.41, z]))
    g.add(part(box(0.18, 0.012, 0.42), accent, [x, 0.455, z], { shadow: false }))
    g.add(part(roundBox(0.48, 0.7, 0.1, 0.04), chairBody, [x, 0.82, z + 0.23], { rot: [-0.12, 0, 0] }))
    g.add(part(box(0.1, 0.62, 0.012), accent, [x - 0.14, 0.82, z + 0.175], { rot: [-0.12, 0, 0], shadow: false }))
    g.add(part(box(0.1, 0.62, 0.012), accent, [x + 0.14, 0.82, z + 0.175], { rot: [-0.12, 0, 0], shadow: false }))
    g.add(part(roundBox(0.26, 0.14, 0.1, 0.04), accent, [x, 1.25, z + 0.28], { shadow: false }))
    for (const s of [-1, 1]) g.add(part(box(0.05, 0.05, 0.3), dark, [x + s * 0.25, 0.62, z + 0.02], { shadow: false }))
  }
  PC_SEAT_X.forEach((x, k) => {
    station(x, PC_DESK_A_Z, k)
    station(x, PC_DESK_B_Z, k + 4)
    chair(x, PC_ROW_A_Z, k)
    chair(x, PC_ROW_B_Z, k + 1)
    // 누름 상자: 의자 · 그 자리 모니터
    for (const [z, n] of [[PC_ROW_A_Z, k + 1], [PC_ROW_B_Z, k + 5]] as const) {
      hit(`pc/seat:${n - 1}`, x, z, 0.6, 1.3, 0.6)
      hit(`pc/seat:${n - 1}`, x, z === PC_ROW_A_Z ? PC_DESK_A_Z : PC_DESK_B_Z, 0.9, 1.4, 0.7)
    }
  })
  // 가운데 책상 칸막이 위 자리 번호
  for (let n = 0; n < 4; n++) g.add(part(box(0.22, 0.12, 0.02), texMat(label(`${n + 5}`, '#14182a', '#7cf0ff', 64, 40, 30), { glow: 0.6 }), [PC_SEAT_X[n] - 0.42, 1.12, PC_DESK_B_Z - 0.31], { shadow: false }))

  // ─── 음료 냉장고 (유리문, 안이 환하다) ───
  {
    const { x: cx, z: zc } = PC_FRIDGE
    // 몸통은 뒤판 · 옆판 · 위아래만 (안이 보이게)
    const body = mat('#d9dde2', { metal: 0.3, rough: 0.4 })
    g.add(part(box(1.2, 2.1, 0.08), body, [cx, 1.05, zc - 0.36]))
    for (const s of [-1, 1]) g.add(part(box(0.08, 2.1, 0.8), body, [cx + s * 0.56, 1.05, zc]))
    g.add(part(box(1.2, 0.2, 0.8), body, [cx, 2.0, zc]))
    g.add(part(box(1.2, 0.16, 0.8), body, [cx, 0.08, zc]))
    const inner = glow('#dff6ff', 0.8)
    g.add(part(box(1.06, 1.8, 0.02), inner, [cx, 1.1, zc - 0.3], { shadow: false }))
    for (let r = 0; r < 4; r++) {
      const y = 0.32 + r * 0.44
      g.add(part(box(1.06, 0.02, 0.6), mat('#ffffff', { rough: 0.4 }), [cx, y, zc]))
      for (let i = 0; i < 6; i++) {
        const c = CAN[(i + r * 2) % CAN.length]
        g.add(part(cyl(0.05, 0.05, 0.2, 8), mat(c, { rough: 0.3 }), [cx - 0.42 + i * 0.17, y + 0.11, zc + 0.12], { shadow: false }))
      }
    }
    g.add(part(box(1.1, 1.85, 0.03), mat('#cfeef8', { rough: 0.05, opacity: 0.3 }), [cx, 1.1, zc + 0.41], { shadow: false }))
    g.add(part(box(0.04, 0.6, 0.04), metal, [cx + 0.48, 1.15, zc + 0.44], { shadow: false }))
    g.add(part(box(1.0, 0.2, 0.03), texMat(label('시원한 음료', '#7cf0ff', '#14182a', 256, 52, 30), { glow: 0.5 }), [cx, 2.0, zc + 0.41], { shadow: false }))
    hit('pc/drink', cx, zc + 0.15, 1.3, 2.2, 1.0)
  }

  // ─── 카운터 (라면 · 충전) · 알바생은 동쪽 뒤 ───
  {
    const { x: cx, z: zc } = PC_COUNTER
    g.add(part(roundBox(0.72, 1.0, 2.3, 0.04), mat('#1d2033', { rough: 0.6 }), [cx, 0.5, zc]))
    g.add(part(roundBox(0.84, 0.06, 2.4, 0.03), mat('#3a3f5a', { rough: 0.45 }), [cx, 1.03, zc]))
    g.add(part(box(0.02, 0.04, 2.2), neon, [cx - 0.37, 0.95, zc], { shadow: false }))
    g.add(part(new THREE.PlaneGeometry(1.7, 0.3), texMat(label('라면 · 음료 · 충전', '#1d2033', '#7cf0ff', 512, 64, 34), { glow: 0.6 }), [cx - 0.366, 0.68, zc], { rot: [0, -Math.PI / 2, 0], shadow: false }))
    // 라면 조리기 + 냄비
    g.add(part(roundBox(0.4, 0.14, 0.4, 0.03), mat('#d9dde2', { metal: 0.3, rough: 0.4 }), [cx + 0.05, 1.13, zc - 0.7]))
    g.add(part(cyl(0.14, 0.13, 0.14, 14), metal, [cx + 0.05, 1.27, zc - 0.7]))
    g.add(part(cyl(0.13, 0.13, 0.01, 14), mat('#ff8a3d', { rough: 0.4 }), [cx + 0.05, 1.34, zc - 0.7], { shadow: false }))
    // 계산 화면 · 컵라면 줄
    g.add(part(roundBox(0.06, 0.3, 0.4, 0.02), dark, [cx + 0.15, 1.3, zc + 0.2], { rot: [0, 0, 0.25] }))
    g.add(part(box(0.01, 0.24, 0.34), screens[2], [cx + 0.11, 1.31, zc + 0.2], { rot: [0, 0, 0.25], shadow: false }))
    for (let i = 0; i < 4; i++) {
      g.add(part(cyl(0.07, 0.055, 0.12, 12), mat(CAN[i], { rough: 0.5 }), [cx - 0.2, 1.12, zc + 0.6 + i * 0.16], { shadow: false }))
      g.add(part(cyl(0.072, 0.072, 0.01, 12), mat('#fff3c4'), [cx - 0.2, 1.185, zc + 0.6 + i * 0.16], { shadow: false }))
    }
    hit('pc/counter', cx, zc, 0.9, 1.4, 2.4)
    // 알바생 뒤 메뉴판 (북쪽 벽) · 간식 선반
    g.add(part(box(1.5, 0.9, 0.04), texMat(
      tex(256, 160, (ctx, w, h) => {
        ctx.fillStyle = '#14182a'
        ctx.fillRect(0, 0, w, h)
        ctx.strokeStyle = '#7cf0ff'
        ctx.lineWidth = 4
        ctx.strokeRect(4, 4, w - 8, h - 8)
        ctx.fillStyle = '#ffd94a'
        ctx.font = `700 26px ${FONT}`
        ctx.textAlign = 'center'
        fillFit(ctx, '메뉴', w / 2, 34, w - 24)
        ctx.fillStyle = '#ffffff'
        ctx.font = `700 20px ${FONT}`
        ctx.textAlign = 'left'
        ctx.fillText('라면 ······ 3,000', 22, 72)
        ctx.fillText('계란 추가 ··· 500', 22, 102)
        ctx.fillText('볶음밥 ···· 4,500', 22, 132)
      }),
      { glow: 0.7 },
    ), [4.6, 2.0, -D + 0.03], { shadow: false }))
    g.add(part(roundBox(0.45, 1.05, 1.6, 0.03), mat('#2a2d40'), [W - 0.25, 0.525, -2.6]))
    for (let i = 0; i < 6; i++) g.add(part(roundBox(0.14, 0.2, 0.14, 0.02), mat(CAN[i % CAN.length]), [W - 0.25, 1.15, -3.2 + i * 0.24], { shadow: false }))
  }

  // ─── 남서쪽 구석: 화분 · 쓰레기통 ───
  g.add(part(cyl(0.2, 0.15, 0.34, 12), mat('#4a4f6a'), [-5.05, 0.17, 3.55]))
  g.add(part(sphere(0.3, 12, 8), mat('#59c26b', { rough: 0.9 }), [-5.05, 0.58, 3.55]))
  g.add(part(cyl(0.16, 0.14, 0.5, 12), mat('#3a3f5a'), [-4.4, 0.25, 3.65]))

  bakeStatic(g)
  return {
    group: g,
    tick(t: number) {
      rgb.emissive.setHSL((t * 0.08) % 1, 1, 0.55)
      neon.emissiveIntensity = 1.2 + Math.sin(t * 2.2) * 0.15
      screens.forEach((s, i) => (s.emissiveIntensity = 0.9 + Math.sin(t * 3 + i * 2) * 0.08))
    },
    dispose: () => owned.forEach((o) => o.dispose()),
  }
}

/** 골목 PC방 건물: 남색 벽 · 하늘색 네온 간판 · 창 포스터 · RGB 창틀 */
function exterior(a: PlaceAnims) {
  const W = STORE_W
  return shopFront(
    'pc',
    {
      name: '방들이PC방',
      wall: '#262b4a',
      signBg: '#14182a',
      signFg: '#7cf0ff',
      accent: '#3fb6ff',
      window: '#24306a',
      deco: (g) => {
        const owned = (t: THREE.Texture | THREE.Material) => (a.owned.push(t), t)
        const poster = (text: string[], bg: string, fg: string, w = 128, h = 180) =>
          owned(
            canvasTexture(w, h, (ctx) => {
              ctx.fillStyle = bg
              ctx.fillRect(0, 0, w, h)
              ctx.fillStyle = fg
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              text.forEach((s, i) => {
                ctx.font = `700 ${i === 0 ? 34 : 20}px ${FONT}`
                fillFit(ctx, s, w / 2, (h * (i + 0.8)) / (text.length + 0.6), w - 12)
              })
            }),
          ) as THREE.Texture
        const posterMat = (t: THREE.Texture) => {
          const m = owned(new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.15, roughness: 0.6 })) as THREE.MeshStandardMaterial
          a.glows.push({ mat: m, day: 0.15, night: 0.7 })
          return m
        }
        // 창 (문 왼쪽) 위 포스터 셋
        const winL = -W / 2 + 0.5
        const winR = STORE_DOOR_DX - 0.9
        const step = (winR - winL) / 3
        const list = [
          poster(['24시', '연중무휴'], '#ff4f7a', '#ffffff'),
          poster(['최신', '사양', '고사양 PC'], '#14182a', '#7cf0ff'),
          poster(['신작', '우주 대결', '오픈!'], '#ffd94a', '#14182a'),
        ]
        list.forEach((t, i) => g.add(part(new THREE.PlaneGeometry(0.85, 1.2), posterMat(t), [winL + step * (i + 0.5), 1.4, 0.075], { shadow: false })))
        // 창틀 RGB 네온 (밤에 색이 돈다)
        const led = owned(new THREE.MeshStandardMaterial({ color: '#ff3bd4', emissive: '#ff3bd4', emissiveIntensity: 0.4, roughness: 0.4 })) as THREE.MeshStandardMaterial
        const ww = winR - winL
        g.add(part(box(ww, 0.05, 0.05), led, [(winL + winR) / 2, 2.33, 0.08], { shadow: false }))
        g.add(part(box(0.05, 1.75, 0.05), led, [winL, 1.45, 0.08], { shadow: false }))
        g.add(part(box(0.05, 1.75, 0.05), led, [winR, 1.45, 0.08], { shadow: false }))
        a.tick.push((t, night) => {
          led.emissive.setHSL((t * 0.08) % 1, 1, 0.55)
          led.emissiveIntensity = night ? 1.3 : 0.35
        })
        // 문 옆 세움 간판 (모니터 모양)
        const sx = STORE_DOOR_DX + 1.5
        g.add(part(box(0.06, 0.9, 0.06), mat('#1d2033'), [sx, 0.45, 0.6]))
        g.add(part(roundBox(0.8, 0.55, 0.08, 0.03), mat('#1d2033'), [sx, 1.1, 0.6]))
        g.add(part(new THREE.PlaneGeometry(0.7, 0.45), posterMat(poster(['PC', '빈자리 많음'], '#14182a', '#59c26b', 180, 116)), [sx, 1.1, 0.645], { shadow: false }))
        g.add(part(box(0.5, 0.04, 0.3), mat('#1d2033'), [sx, 0.02, 0.6]))
      },
    },
    a,
  )
}

export const PC_ART: ShopArt = {
  interior,
  exterior,
  npcLook: {
    hair: 'short',
    hairColor: '#2a2230',
    skin: '#ffe0cc',
    eyes: 'dot',
    top: 'hoodie',
    topColor: '#3fb6ff',
    bottom: 'pants',
    bottomColor: '#2b2f45',
    hat: 'none',
    hatColor: '#3fb6ff',
  },
}
