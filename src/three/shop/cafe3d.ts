/**
 * 카페 방들이 3D. 안: 나무 바닥 · 주문대(디저트 진열장 + 계산대) · 뒷선반 커피 머신 · 테이블 넷 · 창가 바 · 펜던트 등.
 * 골목 건물: 크림색 벽 + 갈색 간판, 줄무늬 차양 · 문 앞 화분 · 칠판 메뉴판.
 */
import * as THREE from 'three'
import { CAFE_BAR_X, CAFE_BAR_Z, CAFE_CHAIR_DZ, CAFE_COUNTER, CAFE_SHOP, CAFE_TABLES } from '../../lib/shop/cafe'
import { bakeStatic, box, canvasTexture, cone, cyl, mat, part, roundBox, sphere, torus } from '../kit'
import { buildCoffeeBar } from '../coffeeBar3d'
import { FONT, type FrontStyle, type ShopArt, shopFront, shopKit, shopRoom } from './common'

const DEF = CAFE_SHOP

const WOOD = '#a8693f'
const WOOD_DARK = '#6b4226'
const WOOD_LIGHT = '#d9a46c'
const CREAM = '#f6ead8'
const CAKE = ['#ff8fb8', '#7a4a2e', '#fff3c4', '#b48cff', '#ffd94a', '#59c26b']

/** 작은 물건 (그림자 없음) */
const small = (g: THREE.BufferGeometry, m: THREE.Material, at: [number, number, number], opts: Parameters<typeof part>[3] = {}) => part(g, m, at, { shadow: false, ...opts })

/** 머그컵 하나 (받침 포함) */
function mug(g: THREE.Group, x: number, y: number, z: number, color: string) {
  g.add(small(cyl(0.1, 0.1, 0.012, 14), mat('#ffffff'), [x, y + 0.006, z]))
  g.add(small(cyl(0.05, 0.042, 0.09, 12), mat(color, { rough: 0.4 }), [x, y + 0.057, z]))
  g.add(small(cyl(0.045, 0.045, 0.005, 12), mat('#5a3420', { rough: 0.2 }), [x, y + 0.1, z]))
  g.add(small(torus(0.025, 0.008), mat(color, { rough: 0.4 }), [x + 0.055, y + 0.06, z]))
}

function interior() {
  const g = new THREE.Group()
  const owned: { dispose(): void }[] = []
  shopRoom(
    DEF,
    {
      // 나무 마루 (판자 넷, 이음매)
      floor: (ctx, w, h) => {
        const cols = ['#c8925e', '#bf8754', '#cf9a66', '#c48c59']
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = cols[i]
          ctx.fillRect(0, (i * h) / 4, w, h / 4)
        }
        ctx.strokeStyle = '#9c6a3e'
        ctx.lineWidth = 2
        for (let i = 0; i <= 4; i++) {
          ctx.beginPath()
          ctx.moveTo(0, (i * h) / 4)
          ctx.lineTo(w, (i * h) / 4)
          ctx.stroke()
        }
        for (const [i, x] of [40, 100, 70, 15].entries()) {
          ctx.beginPath()
          ctx.moveTo(x, (i * h) / 4)
          ctx.lineTo(x, ((i + 1) * h) / 4)
          ctx.stroke()
        }
      },
      wall: CREAM,
      trim: WOOD,
      matText: '안녕히 가세요',
      matColor: WOOD,
      frame: WOOD_DARK,
    },
    g,
    owned,
  )
  const { tex, texMat, label, glow, hit } = shopKit(g, owned)
  const W = DEF.hw
  const D = DEF.hd

  // ─── 벽 아래 나무 판 (북·서) ───
  const wains = mat(WOOD_LIGHT, { rough: 0.7 })
  g.add(part(box(W * 2, 0.9, 0.04), wains, [0, 0.45, -D + 0.02], { shadow: false }))
  g.add(part(box(0.04, 0.9, D * 2), wains, [-W + 0.02, 0.45, 0], { shadow: false }))
  g.add(part(box(W * 2, 0.05, 0.07), mat(WOOD), [0, 0.92, -D + 0.035], { shadow: false }))
  g.add(part(box(0.07, 0.05, D * 2), mat(WOOD), [-W + 0.035, 0.92, 0], { shadow: false }))

  // ─── 북쪽 벽: 가게 이름 간판 · 칠판 메뉴판 ───
  g.add(part(box(3.2, 0.5, 0.05), texMat(label('☕ 카페 방들이', WOOD_DARK, '#fff3e0', 512, 80, 46), { glow: 0.25 }), [-2.45, 2.5, -D + 0.03], { shadow: false }))
  const menuT = tex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2f3b35'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = WOOD
    ctx.lineWidth = 14
    ctx.strokeRect(0, 0, w, h)
    ctx.fillStyle = '#fff8e6'
    ctx.font = `700 34px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const rows: [string, string][] = [
      ['아메리카노', '2.0'],
      ['카페 라떼', '2.5'],
      ['구름 크림 라떼', '3.2'],
      ['딸기 우유', '3.0'],
      ['오늘의 케이크', '3.5'],
    ]
    rows.forEach(([n, p], i) => {
      ctx.fillStyle = i % 2 ? '#ffd9a0' : '#fff8e6'
      ctx.fillText(n, 34, 42 + i * 43)
      ctx.textAlign = 'right'
      ctx.fillText(p, w - 34, 42 + i * 43)
      ctx.textAlign = 'left'
    })
  })
  g.add(part(box(2.2, 1.1, 0.05), texMat(menuT, { glow: 0.12 }), [2.65, 2.25, -D + 0.04], { shadow: false }))

  // ─── 서쪽 벽: 액자 둘 · 선반 위 화분 ───
  const frameArt = (z: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) => {
    g.add(part(box(0.05, 0.8, 0.64), mat(WOOD_DARK), [-W + 0.03, 1.75, z], { shadow: false }))
    g.add(part(new THREE.PlaneGeometry(0.54, 0.7), texMat(tex(128, 160, draw)), [-W + 0.06, 1.75, z], { rot: [0, Math.PI / 2, 0], shadow: false }))
  }
  frameArt(-2.3, (ctx, w, h) => {
    ctx.fillStyle = '#ffe9d0'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#7a4a2e'
    ctx.beginPath()
    ctx.ellipse(w / 2, h * 0.58, 36, 24, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(w / 2, h * 0.52, 30, 12, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#c98f5a'
    ctx.lineWidth = 4
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(w / 2 - 14 + i * 14, h * 0.38)
      ctx.quadraticCurveTo(w / 2 - 6 + i * 14, h * 0.28, w / 2 - 14 + i * 14, h * 0.2)
      ctx.stroke()
    }
  })
  frameArt(1.0, (ctx, w, h) => {
    ctx.fillStyle = '#d9f0e6'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ff8fb8'
    ctx.beginPath()
    ctx.moveTo(w / 2, h * 0.25)
    ctx.lineTo(w * 0.8, h * 0.7)
    ctx.lineTo(w * 0.2, h * 0.7)
    ctx.fill()
    ctx.fillStyle = '#ff3b5c'
    ctx.beginPath()
    ctx.arc(w / 2, h * 0.24, 10, 0, Math.PI * 2)
    ctx.fill()
  })
  g.add(part(box(0.24, 0.04, 1.4), mat(WOOD), [-W + 0.12, 1.3, -0.65], { shadow: false }))
  for (const [i, z] of [-1.15, -0.65, -0.15].entries()) {
    g.add(small(cyl(0.07, 0.055, 0.12, 10), mat(['#ffffff', '#c98f5a', '#ff8fb8'][i]), [-W + 0.12, 1.38, z]))
    g.add(small(sphere(0.1, 10, 8), mat('#59c26b', { rough: 0.9 }), [-W + 0.12, 1.5, z], { scale: [1, 0.8, 1] }))
  }

  // ─── 주문대: 디저트 진열장(서) + 계산대(동) ───
  const cz = CAFE_COUNTER.z
  {
    const x0 = 1.6
    const x1 = CAFE_COUNTER.x1
    const cx = (x0 + x1) / 2
    g.add(part(roundBox(x1 - x0, 1.0, 0.7, 0.04), mat(WOOD, { rough: 0.6 }), [cx, 0.5, cz]))
    g.add(part(box(x1 - x0 - 0.2, 0.7, 0.02), mat(CREAM), [cx, 0.5, cz + 0.36], { shadow: false }))
    g.add(part(roundBox(x1 - x0 + 0.1, 0.06, 0.82, 0.03), mat(WOOD_LIGHT, { rough: 0.45 }), [cx, 1.03, cz]))
    g.add(part(new THREE.PlaneGeometry(1.6, 0.28), texMat(label('ORDER · 주문하는 곳', WOOD_DARK, '#fff3e0', 512, 80, 38)), [3.0, 0.72, cz + 0.375], { shadow: false }))
    // 계산기 · 진동벨 · 컵 탑 · 빨대통
    g.add(small(roundBox(0.32, 0.12, 0.26, 0.03), mat('#3b3646'), [3.0, 1.12, cz - 0.08]))
    g.add(small(box(0.26, 0.18, 0.02), glow('#ffcf8a', 0.5), [3.0, 1.27, cz - 0.14], { rot: [-0.35, 0, 0] }))
    for (let i = 0; i < 3; i++) g.add(small(cyl(0.05, 0.05, 0.03, 12), glow(['#ff5a4f', '#5aa9e6', '#59c26b'][i], 0.5), [2.35 + i * 0.12, 1.08, cz + 0.2]))
    for (let i = 0; i < 4; i++) g.add(small(cyl(0.055, 0.045, 0.1, 12), mat('#ffffff', { rough: 0.5 }), [4.25, 1.11 + i * 0.07, cz - 0.1]))
    g.add(small(cyl(0.05, 0.05, 0.14, 10), mat('#cfeef8', { opacity: 0.5 }), [3.75, 1.13, cz + 0.15]))
    for (let i = 0; i < 4; i++) g.add(small(cyl(0.008, 0.008, 0.22, 4), mat(['#ff5a4f', '#ffd94a', '#5aa9e6', '#59c26b'][i]), [3.73 + (i % 2) * 0.03, 1.2, cz + 0.13 + (i >> 1) * 0.03], { rot: [0, 0, (i - 1.5) * 0.12] }))
    hit('cafe/order', cx, cz, x1 - x0, 1.5, 1.0)
  }
  // 디저트 진열장 (유리, 안이 환하다)
  {
    const x0 = CAFE_COUNTER.x0
    const x1 = 1.6
    const cx = (x0 + x1) / 2
    g.add(part(roundBox(x1 - x0, 0.6, 0.7, 0.04), mat(WOOD, { rough: 0.6 }), [cx, 0.3, cz]))
    const lit = new THREE.MeshStandardMaterial({ color: '#fffaf0', emissive: '#ffe6c0', emissiveIntensity: 0.6, roughness: 0.6 })
    owned.push(lit)
    g.add(part(box(x1 - x0 - 0.08, 0.02, 0.6), lit, [cx, 0.61, cz], { shadow: false }))
    g.add(part(box(x1 - x0 - 0.08, 0.02, 0.6), lit, [cx, 0.86, cz], { shadow: false }))
    // 케이크 (층 둘 × 셋)
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 3; i++) {
        const c = CAKE[(r * 3 + i) % CAKE.length]
        const x = cx - 0.36 + i * 0.36
        const y = 0.62 + r * 0.25
        if ((r + i) % 2) {
          // 조각 케이크 (세모) + 딸기
          g.add(small(cyl(0.11, 0.11, 0.1, 3), mat(c, { rough: 0.6 }), [x, y + 0.06, cz], { rot: [0, 0.5, 0] }))
          g.add(small(sphere(0.03, 8, 6), mat('#ff3b5c'), [x, y + 0.13, cz]))
        } else {
          // 둥근 케이크 + 크림
          g.add(small(cyl(0.11, 0.11, 0.1, 14), mat(c, { rough: 0.6 }), [x, y + 0.06, cz]))
          g.add(small(cyl(0.112, 0.112, 0.025, 14), mat('#ffffff', { rough: 0.5 }), [x, y + 0.12, cz]))
          g.add(small(sphere(0.025, 8, 6), mat('#ff3b5c'), [x, y + 0.15, cz]))
        }
      }
    g.add(part(box(x1 - x0, 0.55, 0.7), mat('#e8f6ff', { rough: 0.05, opacity: 0.25 }), [cx, 0.88, cz], { shadow: false }))
    g.add(part(roundBox(x1 - x0 + 0.04, 0.05, 0.74, 0.02), mat(WOOD_LIGHT), [cx, 1.17, cz]))
    g.add(part(new THREE.PlaneGeometry(0.9, 0.22), texMat(label('오늘의 디저트', '#ff8fb8', '#ffffff', 256, 64, 34)), [cx, 0.35, cz + 0.36], { shadow: false }))
    hit('cafe/dessert', cx, cz, x1 - x0, 1.4, 1.0)
  }

  // ─── 뒷선반 (북쪽 벽): 커피 바(머신 · 그라인더 · 피처 · 얼음통 · 시럽) · 컵 선반 ───
  {
    const zc = -D + 0.3
    g.add(part(roundBox(4.1, 0.95, 0.55, 0.03), mat(WOOD_DARK, { rough: 0.6 }), [2.65, 0.475, zc]))
    g.add(part(roundBox(4.15, 0.05, 0.6, 0.02), mat(WOOD_LIGHT), [2.65, 0.97, zc]))
    // 컵 선반 (벽에)
    // 커피 머신과 겹치지 않게 서쪽 절반에만
    g.add(part(box(2.0, 0.04, 0.26), mat(WOOD), [1.6, 1.72, -D + 0.14], { shadow: false }))
    for (let i = 0; i < 6; i++) mug(g, 0.8 + i * 0.32, 1.74, -D + 0.16, ['#ffffff', '#ffd9a0', '#c98f5a'][i % 3])
  }

  // ─── 테이블 넷 · 의자 여덟 (마주 보고 앉는다) ───
  const chair = (x: number, z: number, back: number) => {
    const wood = mat(WOOD, { rough: 0.6 })
    g.add(part(roundBox(0.42, 0.05, 0.42, 0.02), wood, [x, 0.43, z]))
    g.add(small(roundBox(0.36, 0.03, 0.36, 0.015), mat('#c4572a', { rough: 0.9 }), [x, 0.47, z]))
    for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) g.add(small(box(0.04, 0.42, 0.04), mat(WOOD_DARK), [x + dx, 0.21, z + dz]))
    g.add(part(roundBox(0.42, 0.34, 0.04, 0.02), wood, [x, 0.66, z + back * 0.19]))
  }
  CAFE_TABLES.forEach((t, n) => {
    g.add(part(cyl(0.4, 0.4, 0.05, 20), mat(WOOD_LIGHT, { rough: 0.45 }), [t.x, 0.72, t.z]))
    g.add(part(cyl(0.04, 0.04, 0.68, 8), mat(WOOD_DARK), [t.x, 0.36, t.z]))
    g.add(part(cyl(0.2, 0.22, 0.04, 14), mat(WOOD_DARK), [t.x, 0.02, t.z]))
    mug(g, t.x - 0.12, 0.745, t.z - 0.18, n % 2 ? '#ffd9a0' : '#ffffff')
    mug(g, t.x + 0.12, 0.745, t.z + 0.18, n % 2 ? '#ffffff' : '#c98f5a')
    if (n === 1 || n === 2) g.add(small(cyl(0.1, 0.1, 0.03, 14), mat('#ffffff'), [t.x + 0.18, 0.76, t.z - 0.12]))
    if (n === 1 || n === 2) g.add(small(cyl(0.07, 0.07, 0.07, 3), mat(CAKE[n]), [t.x + 0.18, 0.81, t.z - 0.12]))
    // 북쪽 의자는 등받이가 북쪽, 남쪽 의자는 등받이가 남쪽
    chair(t.x, t.z - CAFE_CHAIR_DZ, -1)
    chair(t.x, t.z + CAFE_CHAIR_DZ, 1)
    hit(`cafe/seat${n}:0`, t.x, t.z - CAFE_CHAIR_DZ, 0.5, 0.95, 0.45)
    hit(`cafe/seat${n}:1`, t.x, t.z + CAFE_CHAIR_DZ, 0.5, 0.95, 0.45)
    hit(`cafe/seat${n}`, t.x, t.z, 0.85, 0.8, 0.75)
  })

  // ─── 남쪽 창가 바 + 의자 셋 (창 밖을 본다) ───
  {
    const x0 = -4.6
    const x1 = -0.6
    g.add(part(roundBox(x1 - x0, 0.05, 0.5, 0.02), mat(WOOD_LIGHT, { rough: 0.45 }), [(x0 + x1) / 2, 0.76, 3.15]))
    for (const x of [x0 + 0.2, x1 - 0.2]) g.add(part(box(0.06, 0.74, 0.06), mat(WOOD_DARK), [x, 0.37, 3.05]))
    for (const [i, x] of CAFE_BAR_X.entries()) {
      g.add(part(cyl(0.19, 0.19, 0.06, 16), mat('#c4572a', { rough: 0.8 }), [x, 0.43, CAFE_BAR_Z]))
      g.add(small(cyl(0.03, 0.03, 0.4, 8), mat(WOOD_DARK), [x, 0.2, CAFE_BAR_Z]))
      g.add(small(cyl(0.16, 0.18, 0.03, 14), mat(WOOD_DARK), [x, 0.015, CAFE_BAR_Z]))
      hit(`cafe/bar:${i}`, x, CAFE_BAR_Z, 0.5, 0.8, 0.5)
    }
    mug(g, -2.6, 0.785, 3.15, '#ffffff')
    for (const x of [-4.3, -0.9]) {
      g.add(small(cyl(0.07, 0.055, 0.1, 10), mat('#ffffff'), [x, 0.835, 3.15]))
      g.add(small(sphere(0.09, 10, 8), mat('#59c26b', { rough: 0.9 }), [x, 0.93, 3.15]))
    }
    hit('cafe/bar', (x0 + x1) / 2, 3.15, x1 - x0, 0.95, 0.55)
  }

  // ─── 동쪽 구석 큰 화분 ───
  g.add(part(cyl(0.24, 0.18, 0.45, 14), mat('#c98f5a'), [4.4, 0.225, 2.9]))
  g.add(part(sphere(0.38, 12, 10), mat('#4fae5e', { rough: 0.9 }), [4.4, 0.8, 2.9], { scale: [1, 1.2, 1] }))
  g.add(part(sphere(0.25, 10, 8), mat('#59c26b', { rough: 0.9 }), [4.3, 1.2, 2.85]))

  // 커피 바: 바리스타가 음료를 만들 때 도구가 움직인다 (움직이는 건 이름이 있어 합치기에서 빠진다)
  const bar = buildCoffeeBar(owned)
  g.add(bar.group)

  bakeStatic(g)

  // ─── 펜던트 등 (테이블마다, 살랑 흔들린다) ───
  const bulb = glow('#ffd28a', 1.6)
  const shade = mat('#3b3646', { rough: 0.5 })
  const pendants: THREE.Group[] = []
  for (const t of CAFE_TABLES) {
    const p = new THREE.Group()
    p.name = 'pendant'
    p.position.set(t.x, 3.0, t.z)
    p.add(small(cyl(0.008, 0.008, 0.85, 4), mat('#2b2233'), [0, -0.425, 0]))
    p.add(small(cone(0.2, 0.18, 14), shade, [0, -0.9, 0]))
    p.add(small(sphere(0.07, 10, 8), bulb, [0, -1.0, 0]))
    g.add(p)
    pendants.push(p)
  }
  // 주문대 위 작은 등 둘
  for (const x of [1.0, 3.6]) {
    const p = new THREE.Group()
    p.name = 'pendant'
    p.position.set(x, 3.0, cz)
    p.add(small(cyl(0.008, 0.008, 0.7, 4), mat('#2b2233'), [0, -0.35, 0]))
    p.add(small(cyl(0.06, 0.14, 0.14, 12), mat(WOOD_LIGHT), [0, -0.75, 0]))
    p.add(small(sphere(0.06, 10, 8), bulb, [0, -0.83, 0]))
    g.add(p)
    pendants.push(p)
  }

  return {
    group: g,
    bar,
    tick(t: number) {
      pendants.forEach((p, i) => (p.rotation.z = Math.sin(t * 0.9 + i * 1.3) * 0.025))
    },
    dispose: () => owned.forEach((o) => o.dispose()),
  }
}

/** 골목 건물 앞: 줄무늬 차양 · 문 앞 화분 둘 · 칠판 메뉴판 */
const deco: NonNullable<FrontStyle['deco']> = (g, a) => {
  const stripeT = canvasTexture(256, 64, (ctx) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#fff3e0' : WOOD_DARK
      ctx.fillRect(i * 32, 0, 32, 64)
    }
  })
  stripeT.wrapS = THREE.RepeatWrapping
  stripeT.repeat.set(3, 1)
  a.owned.push(stripeT)
  const stripe = new THREE.MeshStandardMaterial({ map: stripeT, roughness: 0.8, side: THREE.DoubleSide })
  a.owned.push(stripe)
  // 큰 창 위 차양 (기울어진 천 + 앞 주름)
  const ax = -1.7
  const aw = 6.0
  g.add(part(box(aw, 0.03, 0.95), stripe, [ax, 2.33, 0.44], { rot: [0.42, 0, 0] }))
  g.add(part(box(aw, 0.2, 0.02), stripe, [ax, 2.05, 0.88], { shadow: false }))
  for (const x of [ax - aw / 2 + 0.05, ax + aw / 2 - 0.05]) g.add(part(box(0.03, 0.03, 0.95), mat(WOOD_DARK), [x, 2.33, 0.44], { rot: [0.42, 0, 0], shadow: false }))

  // 문 앞 화분 둘
  for (const x of [0.85, 3.15]) {
    g.add(part(cyl(0.2, 0.15, 0.36, 12), mat('#c98f5a'), [x, 0.18, 0.4]))
    g.add(part(sphere(0.26, 10, 8), mat('#4fae5e', { rough: 0.9 }), [x, 0.52, 0.4], { scale: [1, 1.15, 1] }))
    g.add(small(sphere(0.05, 6, 5), mat('#ff8fb8'), [x + 0.12, 0.7, 0.55]))
    g.add(small(sphere(0.05, 6, 5), mat('#ffd94a'), [x - 0.1, 0.62, 0.6]))
  }

  // 칠판 메뉴판 (A자 입간판)
  const boardT = canvasTexture(128, 160, (ctx) => {
    ctx.fillStyle = '#2f3b35'
    ctx.fillRect(0, 0, 128, 160)
    ctx.fillStyle = '#fff8e6'
    ctx.font = `700 20px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText('오늘의 커피', 64, 34)
    ctx.fillStyle = '#ffd9a0'
    ctx.font = `700 17px ${FONT}`
    ctx.fillText('라떼 2.5', 64, 72)
    ctx.fillText('케이크 3.5', 64, 100)
    ctx.fillStyle = '#ff8fb8'
    ctx.fillText('♥ 어서오세요', 64, 136)
  })
  a.owned.push(boardT)
  const boardM = new THREE.MeshStandardMaterial({ map: boardT, roughness: 0.9 })
  a.owned.push(boardM)
  const sign = new THREE.Group()
  sign.position.set(3.95, 0, 0.85)
  sign.rotation.y = -0.35
  for (const s of [1, -1]) {
    const leaf = new THREE.Group()
    leaf.position.z = s * 0.13
    leaf.rotation.x = -s * 0.2
    leaf.add(part(box(0.56, 0.78, 0.04), mat(WOOD), [0, 0.4, s * 0.02]))
    leaf.add(part(new THREE.PlaneGeometry(0.48, 0.66), boardM, [0, 0.42, s * 0.045], { rot: [0, s > 0 ? 0 : Math.PI, 0], shadow: false }))
    sign.add(leaf)
  }
  g.add(sign)
}

export const CAFE_ART: ShopArt = {
  interior,
  exterior: (a) => shopFront('cafe', { name: '☕ 카페 방들이', wall: CREAM, signBg: WOOD_DARK, signFg: '#fff3e0', accent: '#c98f5a', window: '#ffd59a', deco }, a),
  npcLook: {
    hair: 'bun',
    hairColor: '#4a2f22',
    skin: '#ffe0cc',
    eyes: 'smile',
    top: 'tee',
    topColor: '#7a4a2e',
    bottom: 'pants',
    bottomColor: '#3b3646',
    hat: 'none',
    hatColor: '#3b3646',
  },
}
