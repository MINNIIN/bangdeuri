/**
 * 가구·아이템 3D 모델. 원점은 바닥 가운데, 앞면은 +z.
 * 자주 보이는 것(집 가구, 큰 아이템)은 직접 깎아 만들고, 나머지 작은 아이템은 도트 그림을 입체로 쌓아 만든다.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { artById } from '../art/fixtures'
import { BASE_PALETTE, type Sprite } from '../art/sprite'
import { box, capsule, cone, cyl, group, mat, part, roundBox, sphere, tint, torus } from './kit'

const WOOD = '#c98f5a'
const WOOD_D = '#a8703f'
const GREY = '#c9cbd6'
const DARK = '#3b3646'

/** 앉기·눕기·목욕할 때 엉덩이(누우면 등)가 닿는 면의 높이 (m). 빈백은 푹 꺼지게 낮춘다 */
export const SEAT: Record<string, number> = {
  sofa: 0.49,
  chair: 0.5,
  beanbag: 0.4,
  toilet: 0.45,
  bed: 0.5,
  bathtub: 0.08,
  p_bench: 0.47,
}

/** 앉을 때 가구 가운데에서 앞으로 얼마나 나와 앉나 (등받이에 등이 닿게) */
export const SEAT_FORWARD: Record<string, number> = { sofa: -0.02, chair: 0.03, toilet: 0.07, beanbag: 0.02, p_bench: 0.04 }
/** 앉을 때 무릎을 굽히는 정도: 깊은 소파는 다리를 앞으로 쭉, 의자·변기는 아래로 */
export const SEAT_KNEE: Record<string, number> = { sofa: 0.25, beanbag: 0.45, chair: 1.25, toilet: 1.3, p_bench: 1.25 }
/** 누울 때 발밑이 침대 가운데에서 얼마나 떨어지나 (머리가 베개에 오게) */
export const LIE_FORWARD = 0.2

/** 미니미가 눕거나 들어갈 때 덮는 부분 (이불·욕조 물) — 이 이름의 메시는 사람이 있으면 보인다 */
export const COVER = 'cover'
/** TV·노트북 화면 (켜지면 빛난다) */
export const SCREEN = 'screen'
/** 스탠드 전구 */
export const BULB = 'bulb'

type Build = () => THREE.Group

const legs4 = (w: number, d: number, h: number, r: number, color: string) =>
  group(
    ...[
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].map(([sx, sz]) => part(cyl(r, r * 0.8, h, 10), mat(color), [sx * w, h / 2, sz * d])),
  )

function screenMat() {
  return new THREE.MeshStandardMaterial({ color: '#1b2236', roughness: 0.25, emissive: '#000000', emissiveIntensity: 0 })
}

const BUILDERS: Record<string, Build> = {
  // ─── 거실 ───
  tv: () => {
    const screen = part(roundBox(1.5, 0.86, 0.06, 0.02), screenMat(), [0, 1.03, 0.04], { name: SCREEN })
    return group(
      part(roundBox(1.7, 0.48, 0.45, 0.05), mat(WOOD), [0, 0.24, 0]),
      part(roundBox(1.6, 0.04, 0.4, 0.015), mat(WOOD_D), [0, 0.25, 0.03]),
      part(roundBox(1.58, 0.94, 0.08, 0.03), mat(DARK, { rough: 0.4 }), [0, 1.03, 0]),
      screen,
      part(box(0.12, 0.1, 0.06), mat(DARK), [0, 0.53, 0]),
    )
  },
  sofa: () => {
    const c = '#ff9fbf'
    const d = tint(c, -0.08)
    return group(
      part(roundBox(2.1, 0.32, 0.85, 0.1), mat(d), [0, 0.22, 0]),
      part(roundBox(0.95, 0.16, 0.66, 0.07), mat(c), [-0.48, 0.43, 0.07]),
      part(roundBox(0.95, 0.16, 0.66, 0.07), mat(c), [0.48, 0.43, 0.07]),
      part(roundBox(2.1, 0.62, 0.24, 0.1), mat(d), [0, 0.62, -0.31]),
      part(roundBox(0.22, 0.48, 0.85, 0.1), mat(c), [-1.0, 0.45, 0]),
      part(roundBox(0.22, 0.48, 0.85, 0.1), mat(c), [1.0, 0.45, 0]),
      part(roundBox(0.38, 0.32, 0.12, 0.06), mat('#fff3a8'), [-0.6, 0.66, -0.13], { rot: [-0.25, 0, 0.12] }),
    )
  },
  lowtable: () =>
    group(
      part(roundBox(1.15, 0.07, 0.72, 0.03), mat(WOOD), [0, 0.34, 0]),
      legs4(0.47, 0.27, 0.31, 0.035, WOOD_D),
      part(cyl(0.07, 0.06, 0.1, 16), mat('#ffffff'), [0.25, 0.42, 0.05]),
      part(roundBox(0.3, 0.03, 0.22, 0.01), mat('#7fc8ff'), [-0.25, 0.39, 0]),
    ),
  lamp: () => {
    const bulb = part(sphere(0.07, 12, 10), mat('#fff6d8', { emissive: '#ffd36b', glow: 0 }), [0, 1.35, 0], { name: BULB })
    return group(
      part(cyl(0.2, 0.22, 0.05, 24), mat(DARK), [0, 0.025, 0]),
      part(cyl(0.022, 0.022, 1.3, 10), mat('#d9b25b', { metal: 0.6, rough: 0.35 }), [0, 0.68, 0]),
      part(cyl(0.16, 0.3, 0.32, 24, ), mat('#fff0c7', { rough: 0.9 }), [0, 1.42, 0]),
      bulb,
    )
  },
  turntable: () =>
    group(
      part(roundBox(0.95, 0.55, 0.5, 0.04), mat(WOOD), [0, 0.275, 0]),
      part(roundBox(0.9, 0.04, 0.45, 0.02), mat(DARK), [0, 0.56, 0]),
      group(part(cyl(0.17, 0.17, 0.02, 28), mat('#1d1a26', { rough: 0.3 }), [0, 0, 0]), part(cyl(0.05, 0.05, 0.022, 16), mat('#ff7f2a'), [0, 0, 0])).translateX(-0.15).translateY(0.59),
      part(cyl(0.012, 0.012, 0.28, 6), mat(GREY, { metal: 0.6 }), [0.2, 0.61, 0], { rot: [0, 0.4, Math.PI / 2] }),
      part(roundBox(0.18, 0.12, 0.02, 0.01), mat('#ff8fb8'), [0.25, 0.4, 0.26]),
      part(roundBox(0.18, 0.12, 0.02, 0.01), mat('#7fc8ff'), [0.05, 0.4, 0.26]),
    ),
  calendar: () =>
    group(
      part(cyl(0.025, 0.025, 1.0, 8), mat(WOOD_D), [-0.18, 0.5, -0.05], { rot: [-0.12, 0, 0] }),
      part(cyl(0.025, 0.025, 1.0, 8), mat(WOOD_D), [0.18, 0.5, -0.05], { rot: [-0.12, 0, 0] }),
      part(roundBox(0.55, 0.7, 0.04, 0.02), mat('#ffffff'), [0, 0.95, 0], { rot: [-0.12, 0, 0] }),
      part(roundBox(0.55, 0.16, 0.05, 0.02), mat('#ff6f6f'), [0, 1.25, -0.035], { rot: [-0.12, 0, 0] }),
      ...Array.from({ length: 12 }, (_, i) =>
        part(box(0.08, 0.06, 0.01), mat(i === 7 ? '#ff7f2a' : '#d7dbe8'), [-0.18 + (i % 4) * 0.12, 1.06 - Math.floor(i / 4) * 0.13, 0.04], {
          rot: [-0.12, 0, 0],
        }),
      ),
    ),
  // ─── 안방 ───
  bed: () => {
    const sheet = '#ffffff'
    const blanket = '#9fb8ff'
    return group(
      part(roundBox(1.6, 0.3, 2.15, 0.06), mat(WOOD), [0, 0.2, 0]),
      part(roundBox(1.6, 1.0, 0.12, 0.05), mat(WOOD_D), [0, 0.5, -1.05]),
      part(roundBox(1.5, 0.16, 2.0, 0.08), mat(sheet), [0, 0.43, 0.02]),
      part(roundBox(0.62, 0.16, 0.36, 0.08), mat('#fff6e5'), [-0.36, 0.56, -0.75]),
      part(roundBox(0.62, 0.16, 0.36, 0.08), mat('#fff6e5'), [0.36, 0.56, -0.75]),
      // 이불: 평소엔 발치에 개어 두고, 누우면 어깨까지 폭신하게 덮는다
      part(roundBox(1.56, 0.12, 1.3, 0.06), mat(blanket), [0, 0.56, 0.38], { name: 'blanket' }),
      part(roundBox(1.6, 0.3, 1.42, 0.14), mat(blanket, { rough: 0.95 }), [0, 0.64, 0.33], { name: COVER }),
      part(roundBox(1.58, 0.1, 0.16, 0.05), mat('#ffffff', { rough: 0.95 }), [0, 0.77, -0.34], { name: COVER, rot: [0.2, 0, 0] }),
    )
  },
  wardrobe: () =>
    group(
      part(roundBox(1.25, 2.0, 0.6, 0.04), mat('#efe3d0'), [0, 1.0, 0]),
      part(roundBox(0.58, 1.84, 0.04, 0.02), mat('#f9f1e4'), [-0.3, 1.02, 0.3]),
      part(roundBox(0.58, 1.84, 0.04, 0.02), mat('#f9f1e4'), [0.3, 1.02, 0.3]),
      part(cyl(0.02, 0.02, 0.22, 8), mat('#d9b25b', { metal: 0.6, rough: 0.3 }), [-0.06, 1.05, 0.34]),
      part(cyl(0.02, 0.02, 0.22, 8), mat('#d9b25b', { metal: 0.6, rough: 0.3 }), [0.06, 1.05, 0.34]),
    ),
  alarm: () =>
    group(
      part(roundBox(0.5, 0.5, 0.45, 0.04), mat(WOOD), [0, 0.25, 0]),
      part(roundBox(0.44, 0.04, 0.02, 0.01), mat(WOOD_D), [0, 0.3, 0.23]),
      part(cyl(0.12, 0.12, 0.07, 24), mat('#ff6f6f'), [0, 0.63, 0], { rot: [Math.PI / 2, 0, 0] }),
      part(cyl(0.095, 0.095, 0.075, 24), mat('#ffffff'), [0, 0.63, 0.005], { rot: [Math.PI / 2, 0, 0] }),
      part(sphere(0.045), mat('#ffd94a', { metal: 0.5, rough: 0.3 }), [-0.08, 0.76, 0]),
      part(sphere(0.045), mat('#ffd94a', { metal: 0.5, rough: 0.3 }), [0.08, 0.76, 0]),
      part(box(0.01, 0.07, 0.01), mat(DARK), [0, 0.655, 0.045]),
    ),
  // ─── 작은방 ───
  desk: () => {
    const screen = part(roundBox(0.6, 0.36, 0.02, 0.01), screenMat(), [0, 1.06, -0.13], { name: SCREEN })
    return group(
      part(roundBox(1.35, 0.06, 0.68, 0.02), mat('#f2e6d4'), [0, 0.74, 0]),
      legs4(0.6, 0.27, 0.72, 0.03, '#d4c4ad'),
      part(roundBox(0.66, 0.42, 0.04, 0.02), mat(DARK), [0, 1.06, -0.15]),
      screen,
      part(box(0.06, 0.18, 0.06), mat(DARK), [0, 0.84, -0.17]),
      part(roundBox(0.42, 0.02, 0.14, 0.006), mat('#ffffff'), [0, 0.78, 0.12]),
      part(cyl(0.04, 0.035, 0.1, 12), mat('#ff8fb8'), [0.5, 0.82, 0.05]),
    )
  },
  chair: () =>
    group(
      part(roundBox(0.48, 0.08, 0.46, 0.03), mat('#7fc8ff'), [0, 0.46, 0]),
      part(roundBox(0.48, 0.48, 0.06, 0.03), mat('#7fc8ff'), [0, 0.74, -0.21]),
      part(cyl(0.03, 0.03, 0.4, 8), mat(GREY, { metal: 0.6 }), [0, 0.23, 0]),
      part(cyl(0.2, 0.2, 0.03, 5), mat(DARK), [0, 0.04, 0]),
    ),
  bookshelf: () => {
    const g = group(
      part(roundBox(1.0, 1.8, 0.36, 0.03), mat(WOOD), [0, 0.9, 0]),
      ...[0.35, 0.8, 1.25].map((y) => part(box(0.92, 0.03, 0.32), mat(WOOD_D), [0, y, 0.02])),
    )
    const colors = ['#ff6f6f', '#ffd94a', '#7fc8ff', '#59c26b', '#9d8cff', '#ff8fb8', '#ffffff']
    let k = 0
    for (const y of [0.37, 0.82, 1.27]) {
      let x = -0.42
      while (x < 0.38) {
        const w = 0.06 + ((k * 37) % 5) * 0.012
        const h = 0.26 + ((k * 13) % 4) * 0.03
        g.add(part(box(w, h, 0.24), mat(colors[k % colors.length]), [x + w / 2, y + h / 2, 0.04]))
        x += w + 0.01
        k++
      }
    }
    return g
  },
  beanbag: () =>
    group(
      part(sphere(0.48, 28, 20), mat('#ffb36b', { rough: 0.95 }), [0, 0.28, 0], { scale: [1, 0.6, 1] }),
      part(sphere(0.3, 24, 16), mat('#ffc58e', { rough: 0.95 }), [0, 0.42, -0.18], { scale: [1.2, 0.8, 0.8] }),
    ),
  // ─── 주방 ───
  fridge: () =>
    group(
      part(roundBox(0.78, 1.85, 0.7, 0.08), mat('#e9f3ff', { rough: 0.35 }), [0, 0.925, 0]),
      part(box(0.74, 0.015, 0.02), mat(GREY), [0, 1.2, 0.351]),
      part(roundBox(0.04, 0.3, 0.04, 0.015), mat(GREY, { metal: 0.5, rough: 0.3 }), [0.3, 1.45, 0.37]),
      part(roundBox(0.04, 0.4, 0.04, 0.015), mat(GREY, { metal: 0.5, rough: 0.3 }), [0.3, 0.85, 0.37]),
      part(roundBox(0.12, 0.12, 0.01, 0.01), mat('#ff8fb8'), [-0.15, 1.5, 0.355]),
      part(roundBox(0.1, 0.14, 0.01, 0.01), mat('#ffd94a'), [0.05, 1.42, 0.355], { rot: [0, 0, 0.2] }),
    ),
  counter: () =>
    group(
      part(roundBox(1.9, 0.86, 0.66, 0.03), mat('#ffffff'), [0, 0.43, 0]),
      part(roundBox(1.94, 0.05, 0.7, 0.015), mat('#9a9ab4', { rough: 0.4 }), [0, 0.885, 0]),
      ...[-0.7, -0.24, 0.24, 0.7].map((x) => part(roundBox(0.4, 0.62, 0.02, 0.01), mat('#ffe7c2'), [x, 0.43, 0.335])),
      part(roundBox(0.5, 0.06, 0.4, 0.02), mat('#c4d6e6', { metal: 0.5, rough: 0.25 }), [-0.5, 0.89, 0]),
      part(cyl(0.015, 0.015, 0.26, 8), mat(GREY, { metal: 0.6 }), [-0.5, 1.03, -0.2]),
      part(cyl(0.11, 0.11, 0.015, 20), mat(DARK), [0.45, 0.92, -0.05]),
      part(cyl(0.11, 0.11, 0.015, 20), mat(DARK), [0.75, 0.92, 0.1]),
      group(part(cyl(0.12, 0.11, 0.12, 20), mat('#ff6f6f', { rough: 0.4 })), part(cyl(0.02, 0.02, 0.2, 6), mat(DARK), [0.18, 0.04, 0], { rot: [0, 0, Math.PI / 2] })).translateX(0.45).translateY(0.99).translateZ(-0.05),
    ),
  washer: () =>
    group(
      part(roundBox(0.7, 0.9, 0.66, 0.06), mat('#ffffff', { rough: 0.35 }), [0, 0.45, 0]),
      part(cyl(0.22, 0.22, 0.04, 28), mat(GREY, { metal: 0.4, rough: 0.3 }), [0, 0.42, 0.33], { rot: [Math.PI / 2, 0, 0] }),
      part(cyl(0.17, 0.17, 0.045, 28), mat('#9fdcff', { rough: 0.1, opacity: 0.85 }), [0, 0.42, 0.335], { rot: [Math.PI / 2, 0, 0] }),
      part(roundBox(0.6, 0.1, 0.02, 0.01), mat('#e6e9f2'), [0, 0.78, 0.33]),
      part(cyl(0.03, 0.03, 0.03, 12), mat('#ff7f2a'), [0.2, 0.78, 0.345], { rot: [Math.PI / 2, 0, 0] }),
    ),
  microwave: () =>
    group(
      part(roundBox(0.55, 0.32, 0.4, 0.04), mat('#f1f1f6', { rough: 0.4 }), [0, 0.16, 0]),
      part(roundBox(0.34, 0.22, 0.02, 0.01), screenMat(), [-0.07, 0.16, 0.2], { name: SCREEN }),
      part(roundBox(0.1, 0.22, 0.02, 0.01), mat(DARK), [0.19, 0.16, 0.2]),
    ),
  // ─── 화장실 ───
  toilet: () => {
    const g = group(
      part(roundBox(0.46, 0.52, 0.2, 0.06), mat('#ffffff', { rough: 0.25 }), [0, 0.7, -0.24]),
      part(cyl(0.2, 0.15, 0.4, 24), mat('#ffffff', { rough: 0.25 }), [0, 0.2, 0.02], { scale: [1, 1, 1.25] }),
      part(torus(0.17, 0.035), mat('#f0f4fa', { rough: 0.25 }), [0, 0.42, 0.04], { rot: [Math.PI / 2, 0, 0], scale: [1, 1.25, 1] }),
      part(cyl(0.03, 0.03, 0.03, 10), mat(GREY, { metal: 0.6 }), [0.15, 0.95, -0.2]),
    )
    return g
  },
  basin: () =>
    group(
      part(cyl(0.1, 0.13, 0.7, 16), mat('#ffffff', { rough: 0.25 }), [0, 0.35, -0.05]),
      part(roundBox(0.6, 0.18, 0.45, 0.08), mat('#ffffff', { rough: 0.25 }), [0, 0.78, 0]),
      part(roundBox(0.46, 0.06, 0.32, 0.05), mat('#cfe9f7', { rough: 0.1 }), [0, 0.86, 0.02]),
      part(cyl(0.02, 0.02, 0.18, 8), mat(GREY, { metal: 0.6, rough: 0.2 }), [0, 0.95, -0.17]),
      part(roundBox(0.45, 0.6, 0.03, 0.04), mat('#d7f0ff', { rough: 0.05, metal: 0.3 }), [0, 1.45, -0.22]),
    ),
  bathtub: () => {
    const white = mat('#ffffff', { rough: 0.25 })
    return group(
      part(roundBox(1.65, 0.55, 0.08, 0.04), white, [0, 0.275, -0.38]),
      part(roundBox(1.65, 0.55, 0.08, 0.04), white, [0, 0.275, 0.38]),
      part(roundBox(0.08, 0.55, 0.84, 0.04), white, [-0.8, 0.275, 0]),
      part(roundBox(0.08, 0.55, 0.84, 0.04), white, [0.8, 0.275, 0]),
      part(roundBox(1.6, 0.08, 0.8, 0.04), white, [0, 0.04, 0]),
      part(box(1.55, 0.02, 0.7), mat('#9fdcff', { rough: 0.05, opacity: 0.8 }), [0, 0.38, 0], { name: COVER, shadow: false }),
      part(cyl(0.025, 0.025, 0.2, 8), mat(GREY, { metal: 0.6 }), [0.72, 0.6, -0.33]),
      part(sphere(0.09, 12, 10), mat('#ffe14a'), [-0.3, 0.42, 0.1], { name: 'duck' }),
    )
  },

  // ─── 큰 아이템 ───
  gift: () =>
    group(
      part(roundBox(0.45, 0.36, 0.45, 0.03), mat('#ff6f8f'), [0, 0.18, 0]),
      part(roundBox(0.49, 0.08, 0.49, 0.03), mat('#ff8fa8'), [0, 0.37, 0]),
      part(box(0.08, 0.37, 0.462), mat('#ffd94a'), [0, 0.19, 0]),
      part(box(0.462, 0.37, 0.08), mat('#ffd94a'), [0, 0.19, 0]),
      part(torus(0.07, 0.025), mat('#ffd94a'), [-0.06, 0.45, 0], { rot: [0, 0, 0.6] }),
      part(torus(0.07, 0.025), mat('#ffd94a'), [0.06, 0.45, 0], { rot: [0, 0, -0.6] }),
    ),
  balloon: () => {
    const g = new THREE.Group()
    const colors = ['#ff6f8f', '#7fc8ff', '#ffd94a']
    colors.forEach((c, i) => {
      const x = (i - 1) * 0.16
      const y = 1.05 + (i === 1 ? 0.12 : 0)
      g.add(part(sphere(0.16, 20, 16), mat(c, { rough: 0.25 }), [x, y, 0], { scale: [1, 1.15, 1] }))
      const len = y - 0.15
      g.add(part(cyl(0.004, 0.004, len, 4), mat('#ffffff'), [x / 2, len / 2 + 0.05, 0], { rot: [0, 0, Math.atan2(x / 2, len)] }))
    })
    g.add(part(roundBox(0.12, 0.1, 0.12, 0.02), mat(DARK), [0, 0.05, 0]))
    return g
  },
  plant: () => {
    const g = group(part(cyl(0.2, 0.15, 0.36, 20), mat('#e07a4f'), [0, 0.18, 0]), part(cyl(0.18, 0.18, 0.02, 20), mat('#6b4a2e'), [0, 0.35, 0]))
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      const leaf = part(sphere(0.2, 14, 10), mat(i % 2 ? '#59c26b' : '#3fa65a'), [Math.cos(a) * 0.18, 0.62 + (i % 3) * 0.12, Math.sin(a) * 0.18], {
        scale: [1, 0.25, 0.6],
      })
      leaf.rotation.set(0.5 * Math.sin(a), -a, 0.5)
      g.add(leaf)
      g.add(part(cyl(0.01, 0.01, 0.4, 5), mat('#2f8a47'), [Math.cos(a) * 0.09, 0.5, Math.sin(a) * 0.09], { rot: [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4] }))
    }
    return g
  },
  cactus: () =>
    group(
      part(cyl(0.15, 0.12, 0.22, 18), mat('#e07a4f'), [0, 0.11, 0]),
      part(capsule(0.1, 0.32), mat('#4fb06a', { rough: 0.6 }), [0, 0.45, 0]),
      part(capsule(0.05, 0.12), mat('#4fb06a', { rough: 0.6 }), [0.14, 0.5, 0], { rot: [0, 0, -0.3] }),
      part(capsule(0.045, 0.1), mat('#4fb06a', { rough: 0.6 }), [-0.13, 0.42, 0], { rot: [0, 0, 0.3] }),
      part(sphere(0.04), mat('#ff8fb8'), [0, 0.68, 0]),
    ),
  cake: () =>
    group(
      part(cyl(0.32, 0.32, 0.03, 28), mat('#ffffff'), [0, 0.015, 0]),
      part(cyl(0.26, 0.26, 0.18, 28), mat('#fff3e0'), [0, 0.12, 0]),
      part(cyl(0.265, 0.265, 0.05, 28), mat('#ff8fb8'), [0, 0.2, 0]),
      ...[0, 1, 2, 3, 4, 5].map((i) => part(sphere(0.035), mat('#ff3b5c'), [Math.cos(i) * 0.18, 0.24, Math.sin(i) * 0.18])),
      part(cyl(0.012, 0.012, 0.12, 8), mat('#7fc8ff'), [0, 0.28, 0]),
      part(sphere(0.022, 8, 6), mat('#ffd36b', { emissive: '#ffb02e', glow: 1.2 }), [0, 0.36, 0], { scale: [1, 1.5, 1] }),
    ),
  trophy: () =>
    group(
      part(roundBox(0.24, 0.1, 0.24, 0.02), mat(DARK), [0, 0.05, 0]),
      part(cyl(0.03, 0.05, 0.15, 12), mat('#ffcf4a', { metal: 0.8, rough: 0.25 }), [0, 0.17, 0]),
      part(cyl(0.16, 0.07, 0.22, 24), mat('#ffcf4a', { metal: 0.8, rough: 0.25 }), [0, 0.36, 0]),
      part(torus(0.06, 0.015), mat('#ffcf4a', { metal: 0.8, rough: 0.25 }), [-0.17, 0.38, 0]),
      part(torus(0.06, 0.015), mat('#ffcf4a', { metal: 0.8, rough: 0.25 }), [0.17, 0.38, 0]),
    ),
  rock: () => group(part(new THREE.DodecahedronGeometry(0.22, 0), mat('#9a9aa8', { rough: 1 }), [0, 0.14, 0], { scale: [1.2, 0.7, 1] })),
  coffee: () =>
    group(
      part(cyl(0.08, 0.06, 0.26, 18), mat('#e6f6ff', { rough: 0.1, opacity: 0.7 }), [0, 0.13, 0]),
      part(cyl(0.07, 0.055, 0.2, 18), mat('#6b3e26'), [0, 0.11, 0]),
      part(cyl(0.085, 0.085, 0.03, 18), mat('#ffffff'), [0, 0.27, 0]),
      part(cyl(0.008, 0.008, 0.2, 6), mat('#ff6fa1'), [0.02, 0.35, 0], { rot: [0, 0, -0.2] }),
    ),
  cushion: () =>
    group(part(roundBox(0.55, 0.16, 0.55, 0.08), mat('#ffd94a', { rough: 0.95 }), [0, 0.08, 0]), part(sphere(0.03), mat('#ff9f4a'), [0, 0.165, 0])),
  dumbbell: () =>
    group(
      part(cyl(0.02, 0.02, 0.4, 8), mat(GREY, { metal: 0.7, rough: 0.3 }), [0, 0.08, 0], { rot: [0, 0, Math.PI / 2] }),
      part(cyl(0.08, 0.08, 0.08, 6), mat('#ff6f6f'), [-0.16, 0.08, 0], { rot: [0, 0, Math.PI / 2] }),
      part(cyl(0.08, 0.08, 0.08, 6), mat('#ff6f6f'), [0.16, 0.08, 0], { rot: [0, 0, Math.PI / 2] }),
    ),
  laptop: () =>
    group(
      part(roundBox(0.42, 0.025, 0.3, 0.01), mat('#c9cbd6', { metal: 0.5, rough: 0.3 }), [0, 0.0125, 0]),
      part(roundBox(0.42, 0.28, 0.02, 0.01), mat('#c9cbd6', { metal: 0.5, rough: 0.3 }), [0, 0.15, -0.15], { rot: [-0.25, 0, 0] }),
      part(roundBox(0.38, 0.24, 0.005, 0.004), screenMat(), [0, 0.15, -0.137], { rot: [-0.25, 0, 0], name: SCREEN }),
    ),
  disco: () => {
    const ball = part(new THREE.IcosahedronGeometry(0.22, 1), mat('#e8eef8', { metal: 0.9, rough: 0.15 }), [0, 1.0, 0], { name: 'spin' })
    ;(ball.geometry as THREE.BufferGeometry).computeVertexNormals()
    return group(part(cyl(0.012, 0.012, 0.75, 6), mat(GREY), [0, 0.56, 0]), part(cyl(0.18, 0.2, 0.05, 20), mat(DARK), [0, 0.025, 0]), ball)
  },
  fan: () => {
    const blades = new THREE.Group()
    blades.name = 'spin'
    for (let i = 0; i < 3; i++) blades.add(part(sphere(0.12, 12, 8), mat('#9fdcff', { opacity: 0.85 }), [Math.cos((i * 2 * Math.PI) / 3) * 0.12, Math.sin((i * 2 * Math.PI) / 3) * 0.12, 0], { scale: [1, 0.45, 0.12] }))
    blades.position.set(0, 0.95, 0.06)
    return group(
      part(cyl(0.18, 0.2, 0.05, 20), mat('#ffffff'), [0, 0.025, 0]),
      part(cyl(0.025, 0.025, 0.85, 8), mat('#ffffff'), [0, 0.45, 0]),
      part(torus(0.24, 0.012), mat('#ffffff'), [0, 0.95, 0.06]),
      part(sphere(0.06), mat('#ffffff'), [0, 0.95, 0.04]),
      blades,
    )
  },
  mic: () =>
    group(
      part(cyl(0.16, 0.18, 0.04, 18), mat(DARK), [0, 0.02, 0]),
      part(cyl(0.015, 0.015, 1.25, 8), mat(GREY, { metal: 0.7 }), [0, 0.64, 0]),
      part(capsule(0.04, 0.12), mat(DARK), [0, 1.3, 0.04], { rot: [0.6, 0, 0] }),
      part(sphere(0.055, 14, 10), mat('#c9cbd6', { metal: 0.6, rough: 0.4 }), [0, 1.38, 0.1]),
    ),
  teddy: () => {
    const fur = mat('#c98f5a', { rough: 1 })
    const light = mat('#f0c89a', { rough: 1 })
    return group(
      part(sphere(0.17, 18, 14), fur, [0, 0.18, 0], { scale: [1, 1.1, 0.9] }),
      part(sphere(0.15, 18, 14), fur, [0, 0.45, 0]),
      part(sphere(0.06), fur, [-0.11, 0.57, 0]),
      part(sphere(0.06), fur, [0.11, 0.57, 0]),
      part(sphere(0.06), light, [0, 0.42, 0.13], { scale: [1, 0.8, 0.6] }),
      part(sphere(0.02), mat(DARK), [-0.05, 0.48, 0.13]),
      part(sphere(0.02), mat(DARK), [0.05, 0.48, 0.13]),
      part(sphere(0.07), fur, [-0.15, 0.06, 0.1]),
      part(sphere(0.07), fur, [0.15, 0.06, 0.1]),
      part(torus(0.06, 0.02), mat('#ff6f8f'), [0, 0.33, 0.06], { rot: [Math.PI / 2.4, 0, 0] }),
    )
  },
  trashbag: () =>
    group(
      part(sphere(0.26, 18, 14), mat('#3b3a48', { rough: 0.3 }), [0, 0.24, 0], { scale: [1, 0.95, 0.9] }),
      part(cone(0.08, 0.16, 10), mat('#3b3a48', { rough: 0.3 }), [0, 0.52, 0]),
      part(torus(0.04, 0.012), mat('#ffd94a'), [0, 0.5, 0], { rot: [Math.PI / 2, 0, 0] }),
    ),
  // 바선생: 반들반들한 타원 등딱지 + 머리 방패 + 다리 6개 + 긴 더듬이 (앞이 +z)
  roach: () => {
    const shell = mat('#5a2e17', { rough: 0.22, metal: 0.15 })
    const edge = mat('#74391c', { rough: 0.3 })
    const dark = mat('#2b1810', { rough: 0.5 })
    const g = group(
      // 등딱지(날개): 양쪽 반쪽이 가운데에서 살짝 겹친다
      part(sphere(0.17, 24, 16), shell, [-0.028, 0.05, -0.02], { scale: [0.38, 0.27, 1] }),
      part(sphere(0.17, 24, 16), shell, [0.028, 0.05, -0.02], { scale: [0.38, 0.27, 1] }),
      // 배 (아래쪽 마디)
      part(sphere(0.15, 20, 12), edge, [0, 0.035, -0.03], { scale: [0.62, 0.2, 0.95] }),
      // 머리 방패 · 머리
      part(sphere(0.07, 18, 12), edge, [0, 0.055, 0.15], { scale: [1.25, 0.45, 0.85] }),
      part(sphere(0.035, 12, 8), dark, [0, 0.035, 0.205], { scale: [1.1, 0.8, 0.9] }),
      // 꼬리 끝 두 가닥
      part(cone(0.008, 0.06, 6), dark, [-0.03, 0.03, -0.19], { rot: [-Math.PI / 2 - 0.2, 0, 0.3] }),
      part(cone(0.008, 0.06, 6), dark, [0.03, 0.03, -0.19], { rot: [-Math.PI / 2 - 0.2, 0, -0.3] }),
    )
    // 더듬이: 머리에서 앞·바깥·위로 길게 휘어 나간다
    for (const s of [-1, 1]) {
      const ant = new THREE.Group()
      ant.position.set(s * 0.018, 0.045, 0.22)
      ant.rotation.set(-0.35, s * 0.45, 0)
      ant.add(part(cyl(0.0035, 0.002, 0.16, 5), dark, [0, 0, 0.08], { rot: [Math.PI / 2, 0, 0] }))
      const tip = new THREE.Group()
      tip.position.z = 0.16
      tip.rotation.set(0.35, s * 0.35, 0)
      tip.add(part(cyl(0.002, 0.0012, 0.14, 4), dark, [0, 0, 0.07], { rot: [Math.PI / 2, 0, 0] }))
      ant.add(tip)
      g.add(ant)
    }
    // 다리: 몸 옆에서 바깥으로 나가 꺾여 바닥을 짚는다 (앞·가운데·뒤)
    for (const s of [-1, 1])
      for (const [z, splay] of [
        [0.09, 0.7],
        [0.0, 0.05],
        [-0.09, -0.6],
      ] as const) {
        const leg = new THREE.Group()
        leg.position.set(s * 0.05, 0.04, z)
        leg.rotation.y = s * (Math.PI / 2) - s * splay
        // 넓적다리: 위로 살짝 들렸다가
        leg.add(part(cyl(0.007, 0.006, 0.09, 6), dark, [0, 0.015, 0.045], { rot: [Math.PI / 2 - 0.35, 0, 0] }))
        // 종아리: 바닥으로 내려간다
        leg.add(part(cyl(0.005, 0.0025, 0.1, 6), dark, [0, 0.0, 0.12], { rot: [Math.PI / 2 + 0.75, 0, 0] }))
        g.add(leg)
      }
    // 반짝임: 등딱지 위 가는 빛줄기
    g.add(part(sphere(0.012, 10, 8), mat('#ffffff', { rough: 0.1, opacity: 0.35 }), [0.04, 0.094, 0.02], { scale: [0.7, 0.25, 3], shadow: false }))
    return g
  },
  poop: () =>
    group(
      part(torus(0.13, 0.065), mat('#8a5a38', { rough: 0.5 }), [0, 0.06, 0], { rot: [Math.PI / 2, 0, 0] }),
      part(torus(0.09, 0.055), mat('#8a5a38', { rough: 0.5 }), [0, 0.15, 0], { rot: [Math.PI / 2, 0, 0] }),
      part(cone(0.07, 0.14, 14), mat('#8a5a38', { rough: 0.5 }), [0, 0.24, 0]),
      part(sphere(0.022), mat('#ffffff'), [-0.05, 0.16, 0.12]),
      part(sphere(0.022), mat('#ffffff'), [0.05, 0.16, 0.12]),
    ),
  aircon: () =>
    group(
      part(roundBox(0.5, 1.7, 0.38, 0.1), mat('#ffffff', { rough: 0.4 }), [0, 0.85, 0]),
      part(roundBox(0.38, 0.3, 0.02, 0.02), mat('#d7dbe8'), [0, 1.35, 0.19]),
      part(roundBox(0.16, 0.06, 0.02, 0.01), mat('#7fc8ff', { emissive: '#7fc8ff', glow: 0.6 }), [0, 1.1, 0.19]),
      ...[0.4, 0.5, 0.6, 0.7].map((y) => part(box(0.36, 0.015, 0.02), mat('#c9cbd6'), [0, y, 0.19])),
    ),
  fishbowl: () =>
    group(
      part(sphere(0.2, 24, 18), mat('#bfe6ff', { rough: 0.05, opacity: 0.45 }), [0, 0.2, 0], { shadow: false }),
      part(sphere(0.045, 12, 8), mat('#ff8a3d'), [0.04, 0.18, 0], { scale: [1.4, 1, 0.7], name: 'fish' }),
      part(cyl(0.15, 0.12, 0.04, 20), mat('#e8d2a6'), [0, 0.03, 0]),
    ),
}

// ─── 도트 그림 → 입체 (작은 아이템) ───

function voxelize(sprite: Sprite, height: number) {
  const rows = sprite.rows
  const h = rows.length
  const w = rows[0]?.length ?? 0
  const p = height / h
  const depth = Math.max(2, Math.round(w * 0.45)) * p
  const at = (x: number, y: number) => (y < 0 || y >= h || x < 0 || x >= w ? '.' : rows[y][x])
  const geos: THREE.BufferGeometry[] = []
  const color = new THREE.Color()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x]
      if (ch === '.') continue
      // 테두리 선(k)은 빼고, 안쪽 k(눈·무늬)만 남긴다
      if (ch === 'k' && [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some((n) => n === '.')) continue
      const hex = sprite.palette[ch] ?? BASE_PALETTE[ch]
      if (!hex) continue
      const g = new THREE.BoxGeometry(p, p, depth)
      g.translate((x - w / 2 + 0.5) * p, (h - y - 0.5) * p, 0)
      color.set(hex).convertSRGBToLinear()
      const n = g.getAttribute('position').count
      const cols = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) cols.set([color.r, color.g, color.b], i * 3)
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3))
      geos.push(g)
    }
  }
  if (!geos.length) return new THREE.Group()
  const merged = mergeGeometries(geos)!
  for (const g of geos) g.dispose()
  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }))
  mesh.castShadow = true
  mesh.receiveShadow = true
  return group(mesh)
}

/** 도트 아이템 크기 (m, 그림 높이) */
const VOXEL_H: Record<string, number> = {
  ramen: 0.32,
  console: 0.3,
  books: 0.35,
  cat: 0.45,
  phone: 0.32,
  chicken: 0.35,
  tteokbokki: 0.3,
  socks: 0.3,
}

/** 가구·아이템 하나를 만든다 (없는 아이템이면 null) */
export function buildItem3D(item: string): THREE.Group | null {
  const make = BUILDERS[item]
  if (make) {
    const g = make()
    g.userData.item = item
    return g
  }
  const art = artById(item)
  if (!art) return null
  const g = voxelize(art.sprite, VOXEL_H[item] ?? 0.4)
  g.userData.item = item
  return g
}

/** 상호작용할 때 미니미가 설 거리 (가구 앞면에서) */
export function itemDepth(item: string) {
  switch (item) {
    case 'bed':
      return 1.2
    case 'sofa':
      return 0.6
    case 'counter':
    case 'fridge':
    case 'washer':
    case 'wardrobe':
    case 'tv':
    case 'bathtub':
      return 0.55
    default:
      return 0.4
  }
}

