/**
 * 방들이코인노래방 3D: 어두운 안에 유리 칸막이 부스 셋 (화면 · 미러볼 · 소파 · 마이크 · 탬버린),
 * 북동 구석 동전교환기, 입구 옆 카운터. 부스 조명 색은 tick에서 천천히 바뀐다.
 * 골목 건물: 분홍 벽 + 보라 네온 + 마이크 간판 · "1곡 500원" 포스터.
 */
import * as THREE from 'three'
import type { AvatarLook } from '../../art/avatar'
import {
  BOOTH_FRONT_Z,
  BOOTH_W,
  boothX0,
  COIN,
  COUNTER,
  MIC_DX,
  MIC_Z,
  SING_HD,
  SING_HW,
  SING_SHOP,
  SING_SONGS,
  SOFA_DX,
  SOFA_Z,
  TAMB_DX,
  TAMB_Z,
} from '../../lib/shop/sing'
import { bakeStatic, box, cyl, mat, part, roundBox, sphere, torus } from '../kit'
import { FONT, type ShopArt, shopFront, shopKit, shopRoom } from './common'

const DEF = SING_SHOP
const SOFA_COLORS = ['#ff5fa2', '#7a5cff', '#2fbfa0']

function interior() {
  const g = new THREE.Group()
  const owned: { dispose(): void }[] = []
  shopRoom(
    DEF,
    {
      // 어두운 보라 카펫 + 반짝이 점
      floor: (ctx, w, h) => {
        ctx.fillStyle = '#2b2140'
        ctx.fillRect(0, 0, w, h)
        const dots = ['#ff5fa2', '#7fd0ff', '#ffd94a', '#b48cff']
        for (let i = 0; i < 14; i++) {
          ctx.fillStyle = dots[i % dots.length]
          ctx.fillRect((i * 37) % w, (i * 53 + 11) % h, 4, 4)
        }
      },
      wall: '#3a2b57',
      trim: '#ff5fa2',
      matText: '또 오세요 ♪',
      matColor: '#b48cff',
      frame: '#2a2238',
    },
    g,
    owned,
  )
  const { tex, texMat, label, glow, hit } = shopKit(g, owned)
  const W = SING_HW
  const D = SING_HD
  const frame = mat('#2a2238', { rough: 0.5 })
  const glass = mat('#cfe8ff', { rough: 0.05, opacity: 0.22 })
  const metal = mat('#c9ccd6', { metal: 0.6, rough: 0.3 })
  const dark = mat('#1d1828', { rough: 0.5 })

  // 북쪽 벽 위 간판 · 서쪽 벽 인기곡 판
  g.add(part(box(4.2, 0.4, 0.05), texMat(label('방들이코인노래방', '#1d1828', '#ff8fd0', 512, 64, 42), { glow: 0.9 }), [-2.5, 2.78, -D + 0.03]))
  g.add(
    part(
      new THREE.PlaneGeometry(1.4, 1.1),
      texMat(
        tex(256, 200, (ctx, w, h) => {
          ctx.fillStyle = '#1d1828'
          ctx.fillRect(0, 0, w, h)
          ctx.strokeStyle = '#ff5fa2'
          ctx.lineWidth = 6
          ctx.strokeRect(4, 4, w - 8, h - 8)
          ctx.fillStyle = '#ffd94a'
          ctx.font = `700 26px ${FONT}`
          ctx.textAlign = 'center'
          ctx.fillText('이번 주 인기곡', w / 2, 40)
          ctx.font = `700 20px ${FONT}`
          ctx.textAlign = 'left'
          ;['방들이 블루스', '편의점 앞에서', '새벽 세 시의 컵라면', '우리 동네 골목길'].forEach((s, i) => {
            ctx.fillStyle = i === 0 ? '#ff8fd0' : '#ffffff'
            ctx.fillText(`${i + 1}. ${s}`, 22, 80 + i * 32)
          })
        }),
        { glow: 0.7 },
      ),
      [-W + 0.02, 1.7, 1.4],
      { rot: [0, Math.PI / 2, 0], shadow: false },
    ),
  )

  // ─── 부스 셋 ───
  const leds: THREE.MeshStandardMaterial[] = []
  const lamps: THREE.PointLight[] = []
  const balls: THREE.Object3D[] = []
  const scores: THREE.Object3D[] = []
  for (let n = 0; n < 3; n++) {
    const x0 = boothX0(n)
    const cx = x0 + BOOTH_W / 2
    const led = glow('#ff5fa2', 1.4)
    leds.push(led)
    // 칸막이: 아래 판 + 유리 + 윗띠 LED (서쪽은 첫 부스만 벽)
    const pane = (x: number, z: number, w: number, d: number) => {
      g.add(part(box(w, 0.5, d), dark, [x, 0.25, z]))
      g.add(part(box(Math.max(w - 0.02, 0.02), 1.1, Math.max(d - 0.02, 0.02)), glass, [x, 1.05, z], { shadow: false }))
      g.add(part(box(w + 0.02, 0.05, d + 0.02), led, [x, 1.62, z], { shadow: false }))
    }
    if (n > 0) pane(x0, -D / 2, 0.06, D)
    pane(x0 + 0.5, BOOTH_FRONT_Z, 1.0, 0.06)
    // 문틀 (문 자리 양옆 기둥 + 방 번호)
    g.add(part(box(0.06, 1.9, 0.08), frame, [x0 + 1.0, 0.95, BOOTH_FRONT_Z]))
    g.add(part(box(0.5, 0.22, 0.04), texMat(label(`${n + 1}번방`, '#1d1828', '#ffd94a', 128, 56, 34), { glow: 0.8 }), [x0 + 0.5, 1.82, BOOTH_FRONT_Z + 0.02]))

    // 화면 (북쪽 벽): 가짜 곡 제목 + 가사 자리 (노래 가사는 넣지 않는다)
    const song = SING_SONGS[n]
    const scr = tex(512, 288, (ctx, w, h) => {
      const grd = ctx.createLinearGradient(0, 0, w, h)
      grd.addColorStop(0, ['#3b1f6e', '#1f3b6e', '#6e1f4f'][n])
      grd.addColorStop(1, '#120d1f')
      ctx.fillStyle = grd
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 40px ${FONT}`
      ctx.textAlign = 'center'
      ctx.fillText(song, w / 2, 90)
      ctx.font = `400 24px ${FONT}`
      ctx.fillStyle = '#b9b3d6'
      ctx.fillText('노래 방들이 · 작곡 미니미', w / 2, 130)
      // 가사 줄 (랄라 흥얼)
      ctx.font = `700 30px ${FONT}`
      ctx.fillStyle = '#7fd0ff'
      ctx.fillText('라 라 라 ~ 랄 라 라 ♪', w / 2, 210)
      ctx.fillStyle = '#ff8fd0'
      ctx.fillRect(110, 228, 180, 6)
      ctx.fillStyle = '#5a4f7a'
      ctx.fillRect(290, 228, 112, 6)
      ctx.fillStyle = '#ffd94a'
      ctx.font = `700 22px ${FONT}`
      ctx.textAlign = 'left'
      ctx.fillText(`No.${1024 + n * 317}`, 16, 32)
    })
    g.add(part(roundBox(1.75, 1.05, 0.08, 0.03), dark, [cx + 0.15, 1.75, -D + 0.05]))
    g.add(part(new THREE.PlaneGeometry(1.6, 0.9), texMat(scr, { glow: 1.0, rough: 0.3 }), [cx + 0.15, 1.75, -D + 0.1], { shadow: false }))
    // "100점!" 배지 (통통 튄다)
    const score = part(new THREE.PlaneGeometry(0.62, 0.26), texMat(label('100점!', '#ff3b5c', '#ffffff', 192, 80, 46), { glow: 0.9 }), [cx + 0.75, 2.35, -D + 0.12], {
      shadow: false,
      name: 'score',
    })
    g.add(score)
    scores.push(score)
    // 스피커 둘
    for (const sx of [cx - 0.9, cx + 1.1]) {
      g.add(part(roundBox(0.26, 0.4, 0.22, 0.03), dark, [sx, 2.2, -D + 0.12]))
      g.add(part(cyl(0.08, 0.08, 0.02, 14), mat('#4a3f66'), [sx, 2.15, -D + 0.24], { rot: [Math.PI / 2, 0, 0] }))
    }
    // 노래방 기계 (화면 아래 받침)
    g.add(part(roundBox(0.9, 0.5, 0.35, 0.03), dark, [cx + 0.15, 0.25, -D + 0.2]))
    g.add(part(box(0.5, 0.06, 0.02), glow('#7fd0ff', 1.0), [cx + 0.15, 0.4, -D + 0.38], { shadow: false }))

    // 미러볼 (천장에 매단 줄)
    g.add(part(cyl(0.008, 0.008, 0.4, 4), metal, [cx, 2.8, -1.6], { shadow: false }))
    const ball = part(sphere(0.16, 10, 8), mat('#e6e9f2', { metal: 0.9, rough: 0.15, emissive: '#ffffff', glow: 0.25 }), [cx, 2.55, -1.6], { name: 'mirrorball' })
    g.add(ball)
    balls.push(ball)

    // 소파 (서쪽, 동쪽을 본다)
    const sc = SOFA_COLORS[n]
    const sx = x0 + SOFA_DX
    g.add(part(roundBox(0.5, 0.42, 1.2, 0.06), mat(sc, { rough: 0.7 }), [sx, 0.21, SOFA_Z]))
    g.add(part(roundBox(0.16, 0.55, 1.2, 0.06), mat(sc, { rough: 0.7 }), [sx - 0.18, 0.62, SOFA_Z]))
    for (const dz of [-0.62, 0.62]) g.add(part(roundBox(0.5, 0.2, 0.1, 0.04), mat(sc, { rough: 0.7 }), [sx, 0.5, SOFA_Z + dz]))
    hit(`sing/sofa${n}`, sx, SOFA_Z, 0.6, 0.9, 1.3)

    // 마이크 스탠드 둘 (마이크 머리가 은은히 빛난다)
    for (const [i, dx] of MIC_DX.entries()) {
      const mx = x0 + dx
      g.add(part(cyl(0.14, 0.16, 0.03, 14), dark, [mx, 0.015, MIC_Z]))
      g.add(part(cyl(0.015, 0.015, 1.25, 6), metal, [mx, 0.64, MIC_Z]))
      g.add(part(cyl(0.035, 0.02, 0.16, 10), dark, [mx, 1.32, MIC_Z + 0.04], { rot: [0.5, 0, 0] }))
      g.add(part(sphere(0.05, 10, 8), mat(i ? '#ff8fd0' : '#7fd0ff', { emissive: i ? '#ff8fd0' : '#7fd0ff', glow: 0.5, rough: 0.4 }), [mx, 1.41, MIC_Z - 0.01]))
      hit(`sing/mic${n}:${i}`, mx, MIC_Z, 0.4, 1.5, 0.4)
    }

    // 탬버린 탁자 (북서 구석)
    const tx = x0 + TAMB_DX
    g.add(part(roundBox(0.44, 0.5, 0.3, 0.03), mat('#4a3f66'), [tx, 0.25, TAMB_Z]))
    g.add(part(torus(0.1, 0.025), mat('#ffd94a', { rough: 0.4 }), [tx - 0.05, 0.53, TAMB_Z], { rot: [Math.PI / 2, 0, 0] }))
    g.add(part(cyl(0.1, 0.1, 0.01, 14), mat('#fff3c4'), [tx - 0.05, 0.535, TAMB_Z]))
    // 노래책 (탁자 위)
    g.add(part(box(0.16, 0.04, 0.22), mat('#ff5fa2'), [tx + 0.12, 0.52, TAMB_Z]))
    hit(`sing/tamb${n}`, tx, TAMB_Z, 0.5, 0.8, 0.4)

    // 부스 조명 (색이 천천히 바뀐다)
    const lamp = new THREE.PointLight('#ff5fa2', 2.2, 3.6, 1.6)
    lamp.position.set(cx, 2.2, -1.7)
    g.add(lamp)
    lamps.push(lamp)
  }
  // 마지막 부스 동쪽 칸막이
  {
    const x = boothX0(3)
    g.add(part(box(0.06, 0.5, D), dark, [x, 0.25, -D / 2]))
    g.add(part(box(0.04, 1.1, D - 0.02), glass, [x, 1.05, -D / 2], { shadow: false }))
    g.add(part(box(0.08, 0.05, D + 0.02), leds[2], [x, 1.62, -D / 2], { shadow: false }))
  }

  // ─── 동전교환기 (북동 구석) ───
  {
    g.add(part(roundBox(0.7, 1.45, 0.5, 0.05), mat('#ffd94a', { rough: 0.5 }), [COIN.x, 0.725, COIN.z]))
    g.add(part(box(0.5, 0.36, 0.02), texMat(label('동전교환', '#ff3b5c', '#ffffff', 192, 128, 40), { glow: 0.6 }), [COIN.x, 1.15, COIN.z + 0.26]))
    g.add(part(box(0.24, 0.08, 0.02), dark, [COIN.x - 0.1, 0.8, COIN.z + 0.26]))
    g.add(part(box(0.3, 0.12, 0.08), metal, [COIN.x, 0.35, COIN.z + 0.27]))
    for (let i = 0; i < 3; i++) g.add(part(cyl(0.035, 0.035, 0.01, 10), mat('#d9b25a', { metal: 0.7, rough: 0.3 }), [COIN.x - 0.06 + i * 0.06, 0.42, COIN.z + 0.28], { rot: [Math.PI / 2, 0, 0] }))
    hit('sing/coin', COIN.x, COIN.z, 0.8, 1.6, 0.6)
  }

  // ─── 카운터 (입구 옆, 사장님은 동쪽 뒤) ───
  {
    const cx = COUNTER.x
    const zc = COUNTER.z
    g.add(part(roundBox(0.5, 1.0, 1.7, 0.04), mat('#7a5cff', { rough: 0.6 }), [cx, 0.5, zc]))
    g.add(part(roundBox(0.62, 0.06, 1.8, 0.03), mat('#c98f5a', { rough: 0.5 }), [cx, 1.03, zc]))
    g.add(part(new THREE.PlaneGeometry(1.4, 0.28), texMat(label('1곡 500원 · 서비스 팍팍', '#7a5cff', '#ffffff', 512, 64, 34)), [cx - 0.256, 0.7, zc], { rot: [0, -Math.PI / 2, 0], shadow: false }))
    // 마이크 덮개 바구니 · 음료 몇 개
    g.add(part(cyl(0.14, 0.12, 0.14, 12), mat('#ff8fd0'), [cx, 1.13, zc - 0.5]))
    for (let i = 0; i < 3; i++) g.add(part(cyl(0.04, 0.04, 0.16, 8), mat(['#ff5a4f', '#59c26b', '#5aa9e6'][i], { rough: 0.3 }), [cx + 0.05, 1.14, zc + 0.3 + i * 0.12]))
  }

  // ─── 대기 의자 (서쪽) ───
  g.add(part(roundBox(0.5, 0.42, 1.3, 0.06), mat('#ff8fd0', { rough: 0.7 }), [-4.6, 0.21, 2.0]))
  g.add(part(roundBox(0.14, 0.45, 1.3, 0.06), mat('#ff8fd0', { rough: 0.7 }), [-4.8, 0.6, 2.0]))
  // 서쪽 끝 화분
  g.add(part(cyl(0.16, 0.12, 0.3, 12), mat('#c98f5a'), [-4.6, 0.15, 3.1]))
  g.add(part(sphere(0.25, 12, 8), mat('#59c26b', { rough: 0.9 }), [-4.6, 0.5, 3.1]))

  bakeStatic(g)
  const col = new THREE.Color()
  return {
    group: g,
    tick(t: number) {
      for (let n = 0; n < 3; n++) {
        col.setHSL((t * 0.04 + n / 3) % 1, 0.85, 0.6)
        leds[n].color.copy(col)
        leds[n].emissive.copy(col)
        lamps[n].color.copy(col)
        balls[n].rotation.y = t * 0.9 + n
        scores[n].scale.setScalar(1 + Math.max(0, Math.sin(t * 3 + n * 2)) * 0.12)
      }
    },
    dispose() {
      for (const o of owned) o.dispose()
    },
  }
}

/** 노래방 사장님 (줄무늬 티 · 꼬불머리) */
const BOSS_LOOK: AvatarLook = {
  hair: 'curly',
  hairColor: '#5a3a2a',
  skin: '#ffe0cc',
  eyes: 'smile',
  top: 'stripe',
  topColor: '#b48cff',
  bottom: 'pants',
  bottomColor: '#2b2233',
  hat: 'none',
  hatColor: '#ff5fa2',
}

export const SING_ART: ShopArt = {
  interior,
  exterior: (a) =>
    shopFront(
      'sing',
      {
        name: '♪ 방들이코인노래방 ♪',
        wall: '#ffc9e0',
        signBg: '#2b1f45',
        signFg: '#ff8fd0',
        accent: '#b48cff',
        window: '#c86bff',
        deco: (d, an) => {
          // 보라 네온 띠 (간판 위아래 · 문 위)
          const neon = new THREE.MeshStandardMaterial({ color: '#c08cff', emissive: '#b06bff', emissiveIntensity: 0.6, roughness: 0.4 })
          an.owned.push(neon)
          an.glows.push({ mat: neon, day: 0.6, night: 2.0 })
          d.add(part(box(9.6, 0.05, 0.05), neon, [0, 3.32, 0.14], { shadow: false }))
          d.add(part(box(9.6, 0.05, 0.05), neon, [0, 2.38, 0.14], { shadow: false }))
          for (const x of [-4.8, 4.8]) d.add(part(box(0.05, 0.99, 0.05), neon, [x, 2.85, 0.14], { shadow: false }))
          // 돌출 마이크 간판 (문 오른쪽 벽, 둥근 판 양면 · 골목에서 보이게 살짝 비스듬히)
          const micT = new THREE.CanvasTexture(
            (() => {
              const c = document.createElement('canvas')
              c.width = c.height = 128
              const ctx = c.getContext('2d')!
              ctx.fillStyle = '#2b1f45'
              ctx.beginPath()
              ctx.arc(64, 64, 62, 0, Math.PI * 2)
              ctx.fill()
              ctx.strokeStyle = '#ff5fa2'
              ctx.lineWidth = 6
              ctx.stroke()
              // 마이크 그림
              ctx.fillStyle = '#ff8fd0'
              ctx.beginPath()
              ctx.arc(64, 46, 20, 0, Math.PI * 2)
              ctx.fill()
              ctx.fillStyle = '#e6e9f2'
              ctx.fillRect(57, 62, 14, 40)
              ctx.fillStyle = '#ffd94a'
              ctx.font = `700 28px ${FONT}`
              ctx.fillText('♪', 90, 40)
              return c
            })(),
          )
          micT.colorSpace = THREE.SRGBColorSpace
          an.owned.push(micT)
          const micMat = new THREE.MeshStandardMaterial({ map: micT, emissive: '#ffffff', emissiveMap: micT, emissiveIntensity: 0.3, roughness: 0.5, side: THREE.DoubleSide })
          an.owned.push(micMat)
          an.glows.push({ mat: micMat, day: 0.3, night: 1.2 })
          d.add(part(box(0.05, 0.05, 0.5), mat('#2a2238'), [4.1, 2.2, 0.25]))
          d.add(part(new THREE.CircleGeometry(0.42, 24), micMat, [4.1, 1.7, 0.5], { rot: [0, 0.9, 0], shadow: false }))
          d.add(part(torus(0.42, 0.025), neon, [4.1, 1.7, 0.5], { rot: [0, 0.9, 0], shadow: false }))
          // "1곡 500원" 가짜 포스터 (문 오른쪽 벽)
          const posT = new THREE.CanvasTexture(
            (() => {
              const c = document.createElement('canvas')
              c.width = 128
              c.height = 176
              const ctx = c.getContext('2d')!
              ctx.fillStyle = '#ffd94a'
              ctx.fillRect(0, 0, 128, 176)
              ctx.fillStyle = '#ff3b5c'
              ctx.fillRect(0, 0, 128, 40)
              ctx.fillStyle = '#ffffff'
              ctx.font = `700 22px ${FONT}`
              ctx.textAlign = 'center'
              ctx.fillText('코인노래', 64, 28)
              ctx.fillStyle = '#2b2233'
              ctx.font = `700 34px ${FONT}`
              ctx.fillText('1곡', 64, 86)
              ctx.fillText('500원', 64, 126)
              ctx.font = `400 16px ${FONT}`
              ctx.fillText('2,000원 = 5곡', 64, 158)
              return c
            })(),
          )
          posT.colorSpace = THREE.SRGBColorSpace
          an.owned.push(posT)
          const posMat = new THREE.MeshStandardMaterial({ map: posT, roughness: 0.7 })
          an.owned.push(posMat)
          d.add(part(new THREE.PlaneGeometry(0.6, 0.82), posMat, [3.9, 1.05, 0.02], { shadow: false }))
          // 네온이 살짝 깜빡인다 (밤에 더 밝게)
          an.tick.push((t, night) => {
            const base = night ? 2.0 : 0.6
            neon.emissiveIntensity = base * (0.85 + 0.15 * Math.sin(t * 2.2))
          })
        },
      },
      a,
    ),
  npcLook: BOSS_LOOK,
}
