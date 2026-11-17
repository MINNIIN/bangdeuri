/**
 * 방들이코인빨래방 3D: 안(세탁기 4 · 2단 건조기 2 · 세제 자판기 · 벤치 · 빨래 개는 탁자)과 골목 건물.
 * 세탁기·건조기 동그란 유리문 안에서 빨래가 빙글빙글 돈다 (tick).
 */
import * as THREE from 'three'
import { LAUNDRY_SHOP, LD_BENCH_Z, LD_DRYER_Z, LD_WASHER_X } from '../../lib/shop/laundry'
import { bakeStatic, box, canvasTexture, cyl, mat, part, roundBox, sphere, torus } from '../kit'
import { FONT, type ShopArt, shopFront, shopKit, shopRoom } from './common'

const DEF = LAUNDRY_SHOP
const CLOTH = ['#ff8fb8', '#ffd94a', '#5aa9e6', '#59c26b', '#ffffff', '#ff8a3d', '#b48cff']
const BLUE = '#2f7fd6'
const SKY = '#5aa9e6'

function interior() {
  const g = new THREE.Group()
  const owned: { dispose(): void }[] = []
  shopRoom(
    DEF,
    {
      // 하늘색·하얀 체크 타일
      floor: (ctx, w, h) => {
        ctx.fillStyle = '#f4f8fb'
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#dcebf7'
        ctx.fillRect(0, 0, w / 2, h / 2)
        ctx.fillRect(w / 2, h / 2, w / 2, h / 2)
        ctx.strokeStyle = '#c9dbe9'
        ctx.lineWidth = 2
        ctx.strokeRect(0, 0, w, h)
      },
      wall: '#f2f8ff',
      trim: SKY,
      matText: '안녕히 가세요',
      matColor: SKY,
      frame: '#3f5f86',
    },
    g,
    owned,
  )
  const { texMat, label, glow, hit } = shopKit(g, owned)
  const W = DEF.hw
  const D = DEF.hd

  const white = mat('#f7f9fb', { rough: 0.4 })
  const steel = mat('#c4ccd4', { metal: 0.5, rough: 0.3 })
  const dark = mat('#2b3442', { rough: 0.5 })
  const glass = mat('#cfeef8', { rough: 0.05, opacity: 0.3 })
  const drums: { o: THREE.Object3D; speed: number }[] = []
  const lamps: THREE.MeshStandardMaterial[] = []

  /** 드럼 기계 하나 (앞면 +z 기준, 동그란 유리문 + 안에서 도는 빨래). 문 가운데 높이 y */
  const machine = (parent: THREE.Group, y: number, w: number, h: number, d: number, speed: number, seed: number, panel: string) => {
    parent.add(part(roundBox(w, h, d, 0.05), white, [0, y, 0]))
    const r = Math.min(w, h) * 0.32
    const fz = d / 2
    // 문 테두리 · 안쪽 어두운 드럼 · 유리
    parent.add(part(torus(r, 0.045), steel, [0, y - 0.03, fz + 0.01], { shadow: false }))
    parent.add(part(cyl(r, r, 0.02, 20), dark, [0, y - 0.03, fz - 0.01], { rot: [Math.PI / 2, 0, 0], shadow: false }))
    const drum = new THREE.Group()
    drum.name = 'drum'
    drum.position.set(0, y - 0.03, fz + 0.01)
    if (speed > 0)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + seed
        drum.add(part(sphere(r * 0.38, 8, 6), mat(CLOTH[(seed * 3 + i) % CLOTH.length], { rough: 0.9 }), [Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, 0], { scale: [1.3, 0.8, 0.5], shadow: false }))
      }
    parent.add(drum)
    drums.push({ o: drum, speed })
    parent.add(part(cyl(r - 0.02, r - 0.02, 0.02, 20), glass, [0, y - 0.03, fz + 0.03], { rot: [Math.PI / 2, 0, 0], shadow: false }))
    // 손잡이 · 위 조작판 (돌고 있으면 초록 불)
    parent.add(part(box(0.04, 0.14, 0.04), steel, [r + 0.02, y - 0.03, fz + 0.05]))
    const lamp = glow(speed > 0 ? '#59e08a' : '#ff6b5a', 1)
    lamps.push(lamp)
    parent.add(part(box(w - 0.12, 0.12, 0.02), mat(panel, { rough: 0.5 }), [0, y + h * 0.5 - 0.12, fz + 0.005], { shadow: false }))
    const l = new THREE.Mesh(box(0.06, 0.06, 0.02), lamp)
    l.name = 'lamp'
    l.position.set(w / 2 - 0.15, y + h * 0.5 - 0.12, fz + 0.02)
    parent.add(l)
    parent.add(part(box(0.18, 0.06, 0.02), dark, [-w / 2 + 0.2, y + h * 0.5 - 0.12, fz + 0.02], { shadow: false }))
  }

  // ─── 북쪽 벽: 세탁기 4대 ───
  for (const [i, x] of LD_WASHER_X.entries()) {
    const m = new THREE.Group()
    m.position.set(x, 0, -3.12)
    machine(m, 0.55, 1.0, 1.1, 0.74, i === 2 ? 0 : 2.2 + i * 0.6, i, SKY)
    g.add(m)
    hit(`laundry/washer:${i}`, x, -3.0, 1.0, 1.2, 0.9)
  }
  // 세탁기 위 간판 · 번호
  g.add(part(box(4.4, 0.5, 0.05), texMat(label('방들이코인빨래방 · 무인 24시', '#ffffff', BLUE, 512, 64, 34), { glow: 0.25 }), [-1.2, 2.55, -D + 0.03]))
  for (const [i, x] of LD_WASHER_X.entries()) g.add(part(box(0.32, 0.32, 0.03), texMat(label(String(i + 1), SKY, '#ffffff', 64, 64, 44)), [x, 1.45, -D + 0.03]))

  // ─── 서쪽 벽: 2단 건조기 2대 (위·아래 둘 다 돈다) ───
  for (const [i, z] of LD_DRYER_Z.entries()) {
    const m = new THREE.Group()
    m.position.set(-4.6, 0, z)
    m.rotation.y = Math.PI / 2
    m.add(part(box(0.86, 0.12, 0.74), dark, [0, 0.06, 0]))
    machine(m, 0.6, 0.86, 0.96, 0.78, 3.2 + i, i + 4, '#ff8a3d')
    machine(m, 1.58, 0.86, 0.96, 0.78, 2.6 + i, i + 6, '#ff8a3d')
    g.add(m)
    hit(`laundry/dryer:${i}`, -4.55, z, 0.9, 2.1, 0.9)
  }
  g.add(part(box(0.05, 0.36, 1.2), texMat(label('건조기', '#ff8a3d', '#ffffff', 192, 64, 38)), [-W + 0.03, 2.45, -0.575]))

  // ─── 세제 자판기 ───
  {
    const cx = 2.25
    const zc = -3.15
    g.add(part(roundBox(0.88, 1.75, 0.68, 0.05), mat(BLUE, { rough: 0.5 }), [cx, 0.875, zc]))
    // 상품 창 (환하다) + 세제 통
    const lit = glow('#eef8ff', 0.5)
    g.add(part(box(0.68, 0.7, 0.02), lit, [cx - 0.04, 1.2, zc + 0.33], { shadow: false }))
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 3; i++) g.add(part(roundBox(0.14, 0.2, 0.08, 0.02), mat(CLOTH[(i + r * 3) % CLOTH.length], { rough: 0.5 }), [cx - 0.24 + i * 0.2, 1.0 + r * 0.33, zc + 0.36]))
    g.add(part(box(0.7, 0.72, 0.02), glass, [cx - 0.04, 1.2, zc + 0.38], { shadow: false }))
    g.add(part(box(0.7, 0.18, 0.02), texMat(label('세제 · 유연제', '#ffffff', BLUE, 256, 64, 34)), [cx, 1.68, zc + 0.35], { shadow: false }))
    // 동전 넣는 곳 · 꺼내는 곳
    g.add(part(box(0.08, 0.14, 0.03), dark, [cx + 0.34, 1.1, zc + 0.35]))
    g.add(part(box(0.5, 0.18, 0.04), dark, [cx, 0.35, zc + 0.34]))
    hit('laundry/soap', cx, zc + 0.1, 0.95, 1.8, 0.9)
  }

  // ─── 북동쪽: 빨래 바구니 선반 ───
  {
    const cx = 4.15
    const zc = -3.2
    for (const y of [0.05, 0.75, 1.45]) g.add(part(box(1.4, 0.04, 0.5), steel, [cx, y, zc]))
    for (const x of [cx - 0.68, cx + 0.68]) g.add(part(box(0.04, 1.5, 0.5), steel, [x, 0.75, zc]))
    for (let i = 0; i < 4; i++) {
      const x = cx - 0.35 + (i % 2) * 0.7
      const y = i < 2 ? 0.07 : 0.77
      g.add(part(box(0.55, 0.32, 0.4), mat(['#ff8fb8', '#5aa9e6', '#ffd94a', '#59c26b'][i], { rough: 0.7 }), [x, y + 0.16, zc]))
    }
    for (let i = 0; i < 3; i++) g.add(part(roundBox(0.4, 0.08, 0.3, 0.03), mat(CLOTH[i + 2], { rough: 0.95 }), [cx, 1.51 + i * 0.08, zc]))
  }

  // ─── 가운데: 빨래 개는 탁자 (개어 둔 수건 · 바구니) ───
  {
    const cx = -0.9
    const zc = 0.35
    g.add(part(roundBox(1.7, 0.06, 0.9, 0.02), mat('#e8d3b0', { rough: 0.5 }), [cx, 0.86, zc]))
    for (const [dx, dz] of [
      [-0.75, -0.35],
      [0.75, -0.35],
      [-0.75, 0.35],
      [0.75, 0.35],
    ])
      g.add(part(box(0.06, 0.84, 0.06), steel, [cx + dx, 0.42, zc + dz]))
    for (let i = 0; i < 4; i++) g.add(part(roundBox(0.42, 0.08, 0.32, 0.03), mat(CLOTH[i], { rough: 0.95 }), [cx - 0.45, 0.93 + i * 0.08, zc]))
    g.add(part(box(0.5, 0.26, 0.36), mat('#ff8fb8', { rough: 0.7 }), [cx + 0.35, 1.02, zc]))
    g.add(part(sphere(0.12, 8, 6), mat('#ffffff', { rough: 0.95 }), [cx + 0.3, 1.16, zc], { scale: [1.4, 0.6, 1] }))
    g.add(part(sphere(0.1, 8, 6), mat('#5aa9e6', { rough: 0.95 }), [cx + 0.45, 1.17, zc + 0.05], { scale: [1.3, 0.6, 1] }))
  }

  // ─── 동쪽 벽: 대기 벤치 (서쪽을 보고 앉는다) ───
  {
    const cx = 4.6
    g.add(part(roundBox(0.5, 0.08, 3.1, 0.03), mat('#ffd94a', { rough: 0.5 }), [cx, 0.48, 0]))
    g.add(part(roundBox(0.08, 0.45, 3.1, 0.03), mat('#ffd94a', { rough: 0.5 }), [cx + 0.27, 0.78, 0]))
    for (const z of [-1.4, 0, 1.4]) g.add(part(box(0.4, 0.44, 0.06), steel, [cx, 0.22, z]))
    for (const [i, z] of LD_BENCH_Z.entries()) hit(`laundry/bench:${i}`, cx, z, 0.6, 0.9, 0.9)
    // 벤치 옆 잡지 한 권
    g.add(part(box(0.22, 0.02, 0.3), mat('#ff6b5a'), [cx - 0.05, 0.53, 1.45], { rot: [0, 0.3, 0] }))
  }
  // 서쪽 벽 안내문
  g.add(part(box(0.05, 0.7, 0.55), texMat(label('동전 OK', '#ffffff', BLUE, 128, 160, 34)), [-W + 0.03, 2.35, 1.6]))
  g.add(part(box(0.05, 0.7, 0.55), texMat(label('40분', '#ffd94a', '#2b2233', 128, 160, 48)), [-W + 0.03, 2.35, 2.4]))

  // ─── 남서쪽 화분 · 형광등 ───
  g.add(part(cyl(0.2, 0.15, 0.34, 14), mat('#c98f5a'), [-4.5, 0.17, 3.0]))
  g.add(part(sphere(0.3, 14, 10), mat('#59c26b', { rough: 0.9 }), [-4.5, 0.58, 3.0]))
  const tube = glow('#ffffff', 1.4)
  for (const x of [-3.2, 0.8, 3.6]) g.add(part(box(1.6, 0.05, 0.1), tube, [x, 2.95, -D + 0.12], { shadow: false }))

  bakeStatic(g)
  return {
    group: g,
    tick(t: number) {
      for (const d of drums) if (d.speed) d.o.rotation.z = -t * d.speed
      // 초록 불은 천천히 깜빡
      for (const [i, m] of lamps.entries()) m.emissiveIntensity = 0.8 + Math.sin(t * 3 + i) * 0.4
    },
    dispose: () => owned.forEach((o) => o.dispose()),
  }
}

export const LAUNDRY_ART: ShopArt = {
  interior,
  exterior: (a) =>
    shopFront(
      'laundry',
      {
        name: '방들이코인빨래방',
        wall: '#f7f9fb',
        signBg: BLUE,
        signFg: '#ffffff',
        accent: SKY,
        window: '#cfe9ff',
        deco: (d, a) => {
          // 큰 창 너머 세탁기 동그라미 셋 (창: x -4.5~0.6, 앞면 z=0)
          const white = mat('#ffffff', { rough: 0.4 })
          const ring = mat('#9fb4c8', { metal: 0.4, rough: 0.3 })
          const drum = mat('#3b5a7e', { rough: 0.4 })
          for (const x of [-3.6, -2.0, -0.4]) {
            d.add(part(box(1.3, 1.25, 0.04), white, [x, 1.2, 0.07], { shadow: false }))
            d.add(part(cyl(0.4, 0.4, 0.03, 20), drum, [x, 1.15, 0.1], { rot: [Math.PI / 2, 0, 0], shadow: false }))
            d.add(part(torus(0.4, 0.05), ring, [x, 1.15, 0.11], { shadow: false }))
            d.add(part(sphere(0.12, 8, 6), mat('#ff8fb8'), [x - 0.1, 1.05, 0.11], { scale: [1.3, 0.8, 0.4], shadow: false }))
            d.add(part(sphere(0.1, 8, 6), mat('#ffd94a'), [x + 0.12, 1.22, 0.11], { scale: [1.3, 0.8, 0.4], shadow: false }))
            d.add(part(box(1.1, 0.12, 0.02), mat(SKY), [x, 1.72, 0.1], { shadow: false }))
          }
          // 문 오른쪽 "무인 24시" 안내판
          const t = canvasTexture(160, 220, (ctx) => {
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, 160, 220)
            ctx.fillStyle = BLUE
            ctx.fillRect(0, 0, 160, 18)
            ctx.fillRect(0, 202, 160, 18)
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.font = `700 44px ${FONT}`
            ctx.fillText('무인', 80, 72)
            ctx.fillStyle = '#ff6b5a'
            ctx.font = `700 52px ${FONT}`
            ctx.fillText('24시', 80, 140)
          })
          const sm = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })
          d.add(part(box(0.7, 0.96, 0.05), sm, [3.9, 1.5, 0.04], { shadow: false }))
          d.add(part(box(0.76, 1.02, 0.03), mat('#3f5f86'), [3.9, 1.5, 0.02], { shadow: false }))
          // 앞 턱의 빨래 바구니
          d.add(part(box(0.5, 0.3, 0.38), mat('#5aa9e6', { rough: 0.7 }), [-4.4, 0.23, 0.35]))
          a.owned.push(t, sm)
        },
      },
      a,
    ),
}
