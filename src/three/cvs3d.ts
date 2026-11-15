/**
 * 편의점 안 3D (방들이편의점24). 집 안처럼 카메라 쪽(남·동) 벽은 낮게 잘라 안이 보이게 한다.
 * 누를 수 있는 것마다 보이지 않는 누름 상자에 key(cvs/…)를 붙인다.
 */
import * as THREE from 'three'
import { CVS_DOOR_X, CVS_HD, CVS_HW, CVS_WALL_H } from '../lib/cvs'
import { HIT_LAYER } from './town3d'
import { bakeStatic, box, canvasTexture, cone, cyl, mat, part, roundBox, sphere, tint, torus } from './kit'

const FONT = 'Galmuri11, system-ui, sans-serif'
const HIT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })

export interface Cvs3D {
  group: THREE.Group
  dispose(): void
}

const PRODUCT = ['#ff5a4f', '#ffd94a', '#59c26b', '#5aa9e6', '#ff8fb8', '#ff8a3d', '#b48cff', '#ffffff']

export function buildCvs3D(): Cvs3D {
  const g = new THREE.Group()
  const owned: { dispose(): void }[] = []
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
  /** 누름 상자 (가운데·크기, key) */
  const hit = (key: string, x: number, z: number, w: number, h: number, d: number) => {
    const m = new THREE.Mesh(box(w, h, d), HIT)
    m.position.set(x, h / 2, z)
    m.name = 'hit'
    m.layers.set(HIT_LAYER)
    m.userData.key = key
    g.add(m)
  }

  const W = CVS_HW
  const D = CVS_HD

  // ─── 바닥 (밝은 타일) ───
  const floorTex = tex(
    128,
    128,
    (ctx) => {
      ctx.fillStyle = '#eef0ee'
      ctx.fillRect(0, 0, 128, 128)
      ctx.fillStyle = '#e2e5e3'
      ctx.fillRect(0, 0, 64, 64)
      ctx.fillRect(64, 64, 64, 64)
      ctx.strokeStyle = '#d3d7d5'
      ctx.lineWidth = 2
      ctx.strokeRect(0, 0, 128, 128)
      ctx.beginPath()
      ctx.moveTo(64, 0)
      ctx.lineTo(64, 128)
      ctx.moveTo(0, 64)
      ctx.lineTo(128, 64)
      ctx.stroke()
    },
    [W, D],
  )
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2), texMat(floorTex, { rough: 0.35 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  floor.userData.ground = true
  floor.name = 'floor'
  g.add(floor)
  // 바닥 밑 두께 (밖에서 보이는 단면)
  g.add(part(box(W * 2 + 0.3, 0.3, D * 2 + 0.3), mat('#b9bec4'), [0, -0.16, 0]))

  // ─── 벽: 북·서는 높게, 남·동은 낮게 (안이 보이게) ───
  const wall = mat('#f6f7f4', { rough: 0.85 })
  const trim = mat('#2fbfa0', { rough: 0.6 })
  const T = 0.16
  g.add(part(box(W * 2 + T * 2, CVS_WALL_H, T), wall, [0, CVS_WALL_H / 2, -D - T / 2]))
  g.add(part(box(T, CVS_WALL_H, D * 2), wall, [-W - T / 2, CVS_WALL_H / 2, 0]))
  g.add(part(box(W * 2 + T * 2, 0.16, T + 0.02), trim, [0, CVS_WALL_H - 0.08, -D - T / 2]))
  g.add(part(box(T + 0.02, 0.16, D * 2), trim, [-W - T / 2, CVS_WALL_H - 0.08, 0]))
  const LOW = 0.75
  // 남쪽: 문 자리(x 1.25~2.75)는 비운다
  const gap0 = CVS_DOOR_X - 0.75
  const gap1 = CVS_DOOR_X + 0.75
  g.add(part(box(gap0 + W + T, LOW, T), wall, [(-W - T + gap0) / 2, LOW / 2, D + T / 2]))
  g.add(part(box(W + T - gap1, LOW, T), wall, [(gap1 + W + T) / 2, LOW / 2, D + T / 2]))
  g.add(part(box(T, LOW, D * 2), wall, [W + T / 2, LOW / 2, 0]))
  for (const [x, z, w, d] of [
    [(-W - T + gap0) / 2, D + T / 2, gap0 + W + T, T + 0.04],
    [(gap1 + W + T) / 2, D + T / 2, W + T - gap1, T + 0.04],
    [W + T / 2, 0, T + 0.04, D * 2],
  ] as const)
    g.add(part(box(w, 0.06, d), trim, [x, LOW + 0.03, z]))
  // 문틀 + 열린 자동문 (양옆으로 밀려 있다)
  const frame = mat('#4a4f5c', { rough: 0.5 })
  for (const x of [gap0, gap1]) g.add(part(box(0.1, 2.4, 0.2), frame, [x, 1.2, D + T / 2]))
  g.add(part(box(gap1 - gap0 + 0.1, 0.12, 0.2), frame, [CVS_DOOR_X, 2.4, D + T / 2]))
  // 현관 매트 (누르면 나간다)
  const matTex = label('어서오세요', '#2fbfa0', '#ffffff', 256, 96, 40)
  const doorMat = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.75), texMat(matTex, { rough: 1 }))
  doorMat.rotation.x = -Math.PI / 2
  doorMat.position.set(CVS_DOOR_X, 0.012, D - 0.42)
  doorMat.name = 'exitmat'
  doorMat.userData.exit = true
  g.add(doorMat)
  const exitHit = new THREE.Mesh(box(1.5, 1.6, 1.0), HIT)
  exitHit.position.set(CVS_DOOR_X, 0.8, D - 0.2)
  exitHit.name = 'hit'
  exitHit.layers.set(HIT_LAYER)
  exitHit.userData.exit = true
  g.add(exitHit)

  // 북쪽 벽 위 간판 · 서쪽 벽 포스터
  g.add(part(box(4.6, 0.55, 0.05), texMat(label('방들이편의점24', '#ffffff', '#2b2233', 512, 64, 44), { glow: 0.25 }), [-1.6, 2.62, -D + 0.03]))
  g.add(part(box(0.05, 0.9, 0.7), texMat(label('1+1', '#ff3b5c', '#ffffff', 128, 160, 60)), [-W + 0.03, 1.9, -1.4]))
  g.add(part(box(0.05, 0.9, 0.7), texMat(label('2+1', '#ffd94a', '#2b2233', 128, 160, 60)), [-W + 0.03, 1.9, 0.6]))
  // 천장 대신 벽 위 형광등 줄
  const tube = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.4 })
  owned.push(tube)
  for (const x of [-3.5, -0.5, 2.5]) g.add(part(box(1.6, 0.05, 0.1), tube, [x, 2.95, -D + 0.12], { shadow: false }))

  // ─── 북쪽: 음료 냉장고 (유리문 4칸, 안이 환하다) ───
  {
    const x0 = -4.7
    const x1 = 0.5
    const zc = -3.15
    const body = mat('#d9dde2', { metal: 0.3, rough: 0.4 })
    g.add(part(box(x1 - x0, 2.3, 0.7), body, [(x0 + x1) / 2, 1.15, zc]))
    const inner = new THREE.MeshStandardMaterial({ color: '#f4fbff', emissive: '#e8f6ff', emissiveIntensity: 0.5, roughness: 0.6 })
    owned.push(inner)
    g.add(part(box(x1 - x0 - 0.12, 2.0, 0.02), inner, [(x0 + x1) / 2, 1.18, zc - 0.25]))
    const doors = 4
    const dw = (x1 - x0) / doors
    for (let k = 0; k < doors; k++) {
      const cx = x0 + dw * (k + 0.5)
      // 칸마다 선반 4단 + 음료
      for (let r = 0; r < 4; r++) {
        const y = 0.32 + r * 0.48
        g.add(part(box(dw - 0.12, 0.025, 0.5), mat('#ffffff', { rough: 0.4 }), [cx, y, zc - 0.02]))
        for (let i = 0; i < 6; i++) {
          const c = PRODUCT[(k * 3 + r * 5 + i) % PRODUCT.length]
          const bx = cx - dw / 2 + 0.16 + i * ((dw - 0.32) / 5)
          if ((r + k) % 2) {
            g.add(part(cyl(0.045, 0.045, 0.24, 8), mat(c, { rough: 0.3 }), [bx, y + 0.13, zc + 0.08]))
            g.add(part(cyl(0.018, 0.03, 0.06, 6), mat(tint(c, -0.15)), [bx, y + 0.28, zc + 0.08]))
          } else {
            g.add(part(box(0.1, 0.17, 0.07), mat(c, { rough: 0.5 }), [bx, y + 0.1, zc + 0.08]))
          }
        }
      }
      // 유리문 + 손잡이 + 문틀
      g.add(part(box(dw - 0.06, 2.0, 0.03), mat('#cfeef8', { rough: 0.05, opacity: 0.32 }), [cx, 1.18, zc + 0.33], { shadow: false }))
      g.add(part(box(0.04, 0.6, 0.04), mat('#aeb4bb', { metal: 0.6, rough: 0.3 }), [cx + dw / 2 - 0.12, 1.2, zc + 0.37]))
      g.add(part(box(0.05, 2.1, 0.06), frame, [x0 + dw * k, 1.18, zc + 0.33]))
    }
    g.add(part(box(x1 - x0, 0.12, 0.08), trim, [(x0 + x1) / 2, 2.3, zc + 0.33]))
    hit('cvs/drink', (x0 + x1) / 2, zc + 0.2, x1 - x0, 2.3, 1.0)
  }

  // ─── 북쪽: 김밥·도시락 오픈 냉장 매대 ───
  {
    const cx = 1.7
    const zc = -3.17
    g.add(part(roundBox(1.8, 0.75, 0.68, 0.04), mat('#d9dde2', { metal: 0.3, rough: 0.4 }), [cx, 0.375, zc]))
    g.add(part(box(1.8, 1.55, 0.2), mat('#d9dde2', { metal: 0.3, rough: 0.4 }), [cx, 1.5, zc - 0.25]))
    const lit = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.9 })
    owned.push(lit)
    g.add(part(box(1.7, 0.05, 0.5), lit, [cx, 2.26, zc - 0.05], { shadow: false }))
    for (let r = 0; r < 3; r++) {
      const y = 0.8 + r * 0.45
      const zz = zc + 0.15 - r * 0.08
      g.add(part(box(1.7, 0.03, 0.45), mat('#ffffff', { rough: 0.4 }), [cx, y, zz], { rot: [0.18, 0, 0] }))
      for (let i = 0; i < 7; i++) {
        const x = cx - 0.72 + i * 0.24
        if (r === 1) {
          // 도시락
          g.add(part(box(0.2, 0.06, 0.15), mat('#2b2233', { rough: 0.4 }), [x, y + 0.04, zz]))
          g.add(part(box(0.17, 0.02, 0.12), mat(PRODUCT[(i + 2) % 6], { rough: 0.6 }), [x, y + 0.08, zz]))
        } else {
          // 삼각김밥 (세모 + 김)
          g.add(part(cone(0.085, 0.07, 3), mat('#ffffff', { rough: 0.5 }), [x, y + 0.07, zz], { rot: [Math.PI / 2, 0, 0], scale: [1, 1, 1.4] }))
          g.add(part(box(0.06, 0.05, 0.072), mat('#2b2e2a'), [x, y + 0.035, zz + 0.002]))
          g.add(part(box(0.1, 0.025, 0.074), mat(PRODUCT[(i + r) % 6]), [x, y + 0.1, zz + 0.003]))
        }
      }
    }
    g.add(part(box(1.0, 0.24, 0.03), texMat(label('삼각김밥 · 도시락', '#ff8a3d', '#ffffff', 256, 64, 30)), [cx, 2.05, zc - 0.13]))
    hit('cvs/kimbap', cx, zc + 0.2, 1.8, 2.2, 1.0)
  }

  // ─── 아이스크림 냉동고 (윗면 유리) ───
  {
    const cx = 3.85
    const zc = -3.0
    g.add(part(roundBox(1.7, 0.82, 0.84, 0.06), mat('#ffffff', { rough: 0.5 }), [cx, 0.41, zc]))
    g.add(part(box(1.72, 0.12, 0.86), mat('#5aa9e6', { rough: 0.5 }), [cx, 0.26, zc]))
    for (let i = 0; i < 14; i++) {
      const c = PRODUCT[(i * 3) % PRODUCT.length]
      g.add(part(box(0.18, 0.05, 0.1), mat(c, { rough: 0.5 }), [cx - 0.65 + (i % 7) * 0.22, 0.8, zc - 0.18 + Math.floor(i / 7) * 0.32], { rot: [0, (i % 3) * 0.3, 0] }))
    }
    g.add(part(box(1.6, 0.02, 0.76), mat('#cfeef8', { rough: 0.05, opacity: 0.35 }), [cx, 0.84, zc], { shadow: false }))
    g.add(part(box(0.9, 0.22, 0.03), texMat(label('아이스크림', '#5aa9e6', '#ffffff', 256, 64, 34)), [cx, 0.55, zc + 0.43]))
    hit('cvs/icecream', cx, zc + 0.15, 1.8, 1.2, 1.1)
  }

  // ─── 가운데 진열대 둘 (양면 4단) ───
  const gondola = (cx: number, west: { key: string; name: string; kind: 'cup' | 'bag' | 'box' | 'bread' }, east: { key: string; name: string; kind: 'cup' | 'bag' | 'box' | 'bread' }) => {
    const z0 = -1.7
    const z1 = 1.0
    const len = z1 - z0
    const zc = (z0 + z1) / 2
    const metal = mat('#e4e7ea', { metal: 0.2, rough: 0.5 })
    g.add(part(box(0.16, 1.55, len), metal, [cx, 0.78, zc]))
    g.add(part(box(0.64, 0.12, len), mat('#9aa0ad'), [cx, 0.06, zc]))
    for (const side of [-1, 1]) {
      const kind = side < 0 ? west.kind : east.kind
      for (let r = 0; r < 4; r++) {
        const y = 0.16 + r * 0.36
        g.add(part(box(0.26, 0.03, len), metal, [cx + side * 0.2, y, zc]))
        g.add(part(box(0.02, 0.06, len), trim, [cx + side * 0.33, y + 0.02, zc]))
        const n = 9
        for (let i = 0; i < n; i++) {
          const z = z0 + 0.16 + (i * (len - 0.32)) / (n - 1)
          const c = PRODUCT[(i * 2 + r * 3 + (side > 0 ? 1 : 0)) % PRODUCT.length]
          const x = cx + side * 0.2
          if (kind === 'cup') {
            g.add(part(cyl(0.085, 0.065, 0.14, 10), mat(c, { rough: 0.5 }), [x, y + 0.085, z]))
            g.add(part(cyl(0.087, 0.087, 0.012, 10), mat('#fff3c4'), [x, y + 0.16, z]))
          } else if (kind === 'bag') {
            g.add(part(box(0.08, 0.26, 0.2), mat(c, { rough: 0.35 }), [x, y + 0.15, z], { rot: [0, 0, side * 0.12] }))
          } else if (kind === 'bread') {
            g.add(part(box(0.18, 0.08, 0.2), mat('#f8f1e6', { rough: 0.3, opacity: 0.92 }), [x, y + 0.06, z]))
            g.add(part(sphere(0.08, 10, 6), mat(i % 2 ? '#d9a35b' : '#c47f3c'), [x, y + 0.07, z], { scale: [1, 0.55, 1] }))
          } else {
            g.add(part(box(0.14, 0.18 + (i % 3) * 0.04, 0.12), mat(i % 2 ? '#ffffff' : c, { rough: 0.5 }), [x, y + 0.11 + (i % 3) * 0.02, z]))
          }
        }
      }
      // 진열대 위 이름표 (그쪽 면)
      const t = label(side < 0 ? west.name : east.name, side < 0 ? '#ff8a3d' : '#2fbfa0', '#ffffff', 256, 64, 38)
      g.add(part(box(0.03, 0.26, 0.9), texMat(t), [cx + side * 0.1, 1.72, zc], { rot: [0, side < 0 ? 0 : Math.PI, 0] }))
    }
    g.add(part(box(0.06, 0.3, 0.06), frame, [cx, 1.62, zc]))
    hit(west.key, cx - 0.2, zc, 0.42, 1.6, len)
    hit(east.key, cx + 0.2, zc, 0.42, 1.6, len)
  }
  gondola(-2.6, { key: 'cvs/ramen', name: '라면', kind: 'cup' }, { key: 'cvs/snack', name: '과자', kind: 'bag' })
  gondola(-0.2, { key: 'cvs/goods', name: '생활용품', kind: 'box' }, { key: 'cvs/bread', name: '빵', kind: 'bread' })

  // ─── 계산대 (알바생은 동쪽 뒤) ───
  {
    const cx = 3.25
    const zc = -0.35
    g.add(part(roundBox(0.7, 1.0, 2.5, 0.04), mat('#2fbfa0', { rough: 0.6 }), [cx, 0.5, zc]))
    g.add(part(roundBox(0.82, 0.06, 2.6, 0.03), mat('#c98f5a', { rough: 0.5 }), [cx, 1.03, zc]))
    // 손님 쪽 앞판 글씨 (계산대 서쪽 면에 붙인다)
    g.add(part(new THREE.PlaneGeometry(1.8, 0.3), texMat(label('어서오세요 · 방들이편의점24', '#2fbfa0', '#ffffff', 512, 64, 32)), [cx - 0.356, 0.72, zc], { rot: [0, -Math.PI / 2, 0], shadow: false }))
    // 포스기: 화면 + 받침 · 스캐너 · 카드기
    const screen = new THREE.MeshStandardMaterial({ color: '#1b2236', emissive: '#7fd0ff', emissiveIntensity: 0.6, roughness: 0.3 })
    owned.push(screen)
    g.add(part(cyl(0.05, 0.08, 0.12, 12), mat('#3b3646'), [cx + 0.05, 1.12, zc - 0.55]))
    g.add(part(roundBox(0.06, 0.32, 0.42, 0.02), mat('#3b3646'), [cx + 0.05, 1.32, zc - 0.55], { rot: [0, 0, 0.25] }))
    g.add(part(box(0.01, 0.26, 0.36), screen, [cx + 0.01, 1.33, zc - 0.55], { rot: [0, 0, 0.25] }))
    g.add(part(roundBox(0.14, 0.16, 0.12, 0.03), mat('#3b3646'), [cx - 0.15, 1.13, zc - 0.05]))
    g.add(part(box(0.02, 0.06, 0.08), new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff3b30', emissiveIntensity: 1.2 }), [cx - 0.22, 1.16, zc - 0.05]))
    g.add(part(roundBox(0.12, 0.05, 0.18, 0.02), mat('#3b3646'), [cx - 0.2, 1.08, zc + 0.3]))
    // 핫바 온장고 (빛나는 유리 상자 + 소시지)
    const warm = new THREE.MeshStandardMaterial({ color: '#fff1c4', emissive: '#ffb347', emissiveIntensity: 0.6, roughness: 0.2, transparent: true, opacity: 0.55 })
    owned.push(warm)
    g.add(part(box(0.4, 0.32, 0.5), warm, [cx + 0.05, 1.22, zc + 0.75], { shadow: false }))
    for (let i = 0; i < 5; i++) g.add(part(cyl(0.025, 0.025, 0.32, 8), mat('#c4572a', { rough: 0.4 }), [cx + 0.05, 1.15 + (i % 2) * 0.08, zc + 0.55 + i * 0.09], { rot: [0, 0, Math.PI / 2] }))
    // 껌·사탕 진열 (손님 쪽)
    for (let i = 0; i < 6; i++) g.add(part(roundBox(0.1, 0.04, 0.12, 0.01), mat(PRODUCT[i % PRODUCT.length]), [cx - 0.28, 1.1, zc + 0.05 + i * 0.13]))
    hit('cvs/counter', cx, zc, 0.9, 1.4, 2.6)
    // 알바생 뒤 낮은 장 (담배 대신 우산·충전기)
    g.add(part(roundBox(0.45, 1.05, 2.2, 0.03), mat('#e4e7ea'), [W - 0.25, 0.525, -0.5]))
    for (let i = 0; i < 8; i++) g.add(part(roundBox(0.14, 0.2, 0.14, 0.02), mat(PRODUCT[(i * 3) % PRODUCT.length]), [W - 0.25, 1.15, -1.4 + i * 0.26]))
  }

  // ─── 남쪽 창가 바 + 의자 셋 ───
  {
    const x0 = -4.7
    const x1 = -0.9
    g.add(part(roundBox(x1 - x0, 0.06, 0.62, 0.02), mat('#c98f5a', { rough: 0.5 }), [(x0 + x1) / 2, 1.02, 3.17]))
    for (const x of [x0 + 0.2, (x0 + x1) / 2, x1 - 0.2]) g.add(part(box(0.08, 1.0, 0.08), frame, [x, 0.5, 3.3]))
    for (const [i, x] of [-4.0, -2.8, -1.6].entries()) {
      g.add(part(cyl(0.2, 0.2, 0.06, 18), mat('#ff8a3d', { rough: 0.5 }), [x, 0.62, 2.45]))
      g.add(part(cyl(0.03, 0.03, 0.6, 8), mat('#9aa0ad', { metal: 0.5, rough: 0.3 }), [x, 0.3, 2.45]))
      g.add(part(cyl(0.18, 0.2, 0.03, 16), mat('#9aa0ad', { metal: 0.5, rough: 0.3 }), [x, 0.015, 2.45]))
      g.add(part(torus(0.14, 0.012), mat('#9aa0ad', { metal: 0.5, rough: 0.3 }), [x, 0.28, 2.45], { rot: [Math.PI / 2, 0, 0] }))
      hit(`cvs/stool:${i}`, x, 2.45, 0.6, 0.9, 0.6)
    }
    // 바 위 컵라면 하나 (김이 날 자리)
    g.add(part(cyl(0.08, 0.06, 0.12, 14), mat('#ff5a4f', { rough: 0.5 }), [-2.8, 1.11, 3.2]))
    g.add(part(cyl(0.082, 0.082, 0.01, 14), mat('#fff3c4'), [-2.8, 1.175, 3.2]))
    hit('cvs/stool', (x0 + x1) / 2, 3.17, x1 - x0, 1.1, 0.6)
  }

  // ─── 온수기 · 전자레인지 탁자 ───
  {
    const cx = 0.05
    const zc = 3.15
    g.add(part(roundBox(1.1, 0.9, 0.62, 0.03), mat('#e4e7ea'), [cx, 0.45, zc]))
    g.add(part(roundBox(0.34, 0.5, 0.34, 0.04), mat('#ffffff', { rough: 0.4 }), [cx - 0.28, 1.15, zc]))
    g.add(part(cyl(0.025, 0.025, 0.08, 8), mat('#ff3b30'), [cx - 0.33, 1.05, zc - 0.2], { rot: [Math.PI / 2, 0, 0] }))
    g.add(part(cyl(0.025, 0.025, 0.08, 8), mat('#3d7fd6'), [cx - 0.22, 1.05, zc - 0.2], { rot: [Math.PI / 2, 0, 0] }))
    g.add(part(roundBox(0.5, 0.3, 0.36, 0.03), mat('#d9dde2', { metal: 0.3, rough: 0.4 }), [cx + 0.25, 1.05, zc]))
    g.add(part(box(0.3, 0.2, 0.01), mat('#2b2233', { rough: 0.2 }), [cx + 0.2, 1.05, zc - 0.185]))
    g.add(part(roundBox(0.24, 0.3, 0.24, 0.04), mat('#9aa0ad'), [cx + 0.75, 0.15, zc - 0.05]))
    hit('cvs/water', cx, zc, 1.2, 1.5, 0.8)
  }

  // ─── 화분 · 우산꽂이 (빈 구석) ───
  g.add(part(cyl(0.18, 0.14, 0.32, 14), mat('#c98f5a'), [-4.55, 0.16, -2.25]))
  g.add(part(sphere(0.28, 14, 10), mat('#59c26b', { rough: 0.9 }), [-4.55, 0.55, -2.25]))
  g.add(part(cyl(0.15, 0.15, 0.5, 12), mat('#9aa0ad', { metal: 0.4, rough: 0.4 }), [W - 0.35, 0.25, 2.9]))
  for (const [i, c] of ['#ff5a4f', '#5aa9e6', '#ffd94a'].entries()) g.add(part(cyl(0.02, 0.02, 0.8, 6), mat(c), [W - 0.4 + i * 0.04, 0.6, 2.88 + (i - 1) * 0.04], { rot: [0.05 * (i - 1), 0, 0.08] }))

  bakeStatic(g)
  return {
    group: g,
    dispose() {
      for (const o of owned) o.dispose()
    },
  }
}

/** 편의점 알바생 (방들이편의점24 조끼) */
export const CLERK_LOOK = {
  hair: 'short',
  hairColor: '#3a2a20',
  skin: '#ffe0cc',
  eyes: 'smile',
  top: 'tee',
  topColor: '#2fbfa0',
  bottom: 'pants',
  bottomColor: '#3b3646',
  hat: 'cap',
  hatColor: '#ff8a3d',
} as const

