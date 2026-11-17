/**
 * 붕붕레이서 — 노을 지는 언덕길을 달리는 타임어택.
 * 2D 캔버스에 길 조각을 원근으로 그린다 (계산은 race.ts).
 */
import { type PointerEvent as RPointerEvent, useEffect, useRef, useState } from 'react'
import { fitText, GAME_FONT, type GameProps, isMuted, noise, saveScore, sfx, tone, useCanvasLoop } from './kit'
import {
  buildTrack,
  CAM_H,
  CHECK_BONUS,
  checkpointSeg,
  D,
  DRAW_DIST,
  hitCar,
  kmh,
  LANES,
  MAX_SPEED,
  metres,
  moveTraffic,
  OFF_LIMIT,
  overlap,
  PLAYER_W,
  PLAYER_Z,
  project,
  type Proj,
  recycleTraffic,
  resultLine,
  rng,
  ROAD_W,
  RUMBLE,
  SEG_LEN,
  segIndexAt,
  type Seg,
  spawnTraffic,
  START_TIME,
  stepPlayer,
  type Traffic,
} from './race'
import './RaceGame.css'

type Phase = 'ready' | 'count' | 'play' | 'finish' | 'over'

interface G {
  phase: Phase
  t: number
  clock: number
  track: Seg[]
  pos: number
  car: { x: number; speed: number }
  cars: Traffic[]
  rnd: () => number
  time: number
  nextCp: number
  checkpoints: number
  crashes: number
  drift: number
  topSpeed: number
  spin: number
  shake: number
  skyX: number
  steer: number
  off: boolean
  banner: string
  bannerSub: string
  bannerT: number
  bannerColor: string
  pop: string
  popT: number
  puffT: number
  countN: number
  braking: boolean
}

interface Part {
  on: boolean
  x: number
  y: number
  vx: number
  vy: number
  g: number
  life: number
  max: number
  size: number
  kind: number
}

interface Over {
  score: number
  best: boolean
  line: string
  checkpoints: number
  crashes: number
  top: number
}

const CAR_VIS = 0.46
const NONE_INPUT = { left: false, right: false, brake: false }
const BRAKE_INPUT = { left: false, right: false, brake: true }

/** 차 색 [본색, 그늘, 반짝] */
const BODY: readonly (readonly string[])[] = [
  ['#ffd25e', '#d9a12c', '#fff3c4'],
  ['#6cc6ff', '#3a8fd0', '#dcf3ff'],
  ['#b89cff', '#8565d6', '#efe8ff'],
  ['#9be06a', '#5fae3c', '#e6f9d6'],
  ['#ff9b5e', '#d4692f', '#ffe3cf'],
  ['#f4f1ff', '#bdb5d6', '#ffffff'],
]
const PLAYER_PAL = ['#ff6f9a', '#d2427a', '#ffd3e1']
const PART_COL = ['rgba(235,228,245,', 'rgba(110,190,90,', 'rgba(255,220,90,', '', 'rgba(255,255,255,', 'rgba(170,120,80,']
const CONFETTI = ['#ff6f9a', '#ffd25e', '#6cc6ff', '#9be06a', '#b89cff', '#ffffff']
const BOARDS = [
  { bg: '#ff8fb1', fg: '#fff', t: '붕어빵 3개 1000원' },
  { bg: '#6cc6ff', fg: '#fff', t: '방들이 놀러 와요' },
  { bg: '#ffd25e', fg: '#3a2550', t: '천천히 가도 괜찮아' },
  { bg: '#9be06a', fg: '#2c4a20', t: '바닷가 3km →' },
]

// ─── 색 · 안개 ───
const FOG = [242, 170, 150]
const FOG_STEPS = 12
function hexRgb(h: string) {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function fogRamp(hex: string) {
  const c = hexRgb(hex)
  const out: string[] = []
  for (let i = 0; i < FOG_STEPS; i++) {
    const k = (i / (FOG_STEPS - 1)) * 0.72
    out.push(`rgb(${Math.round(c[0] + (FOG[0] - c[0]) * k)},${Math.round(c[1] + (FOG[1] - c[1]) * k)},${Math.round(c[2] + (FOG[2] - c[2]) * k)})`)
  }
  return out
}
const C = {
  grassL: fogRamp('#79c86a'),
  grassD: fogRamp('#68b75e'),
  rumR: fogRamp('#ff6b86'),
  rumW: fogRamp('#fff3ea'),
  roadL: fogRamp('#6f6a86'),
  roadD: fogRamp('#67627d'),
  lane: fogRamp('#fff3ea'),
  chk: fogRamp('#2e2840'),
}

// ─── 먼 배경 (한 번 만들어 둔다) ───
const bgR = rng(99)
const MTN = Array.from({ length: 14 }, () => 0.35 + bgR() * 0.65)
const CITY = Array.from({ length: 26 }, () => ({ w: 0.5 + bgR() * 0.8, h: 0.25 + bgR() * 0.75, win: Math.floor(bgR() * 1000) }))
const HILL = Array.from({ length: 10 }, () => 0.3 + bgR() * 0.7)
const CLOUDS = Array.from({ length: 5 }, () => ({ x: bgR(), y: bgR(), s: 0.6 + bgR() * 0.8 }))

function newGame(seed: number): G {
  return {
    phase: 'ready',
    t: 0,
    clock: 0,
    track: buildTrack(seed),
    pos: 0,
    car: { x: 0, speed: 0 },
    cars: spawnTraffic(12, 0, seed + 1),
    rnd: rng(seed + 2),
    time: START_TIME,
    nextCp: 1,
    checkpoints: 0,
    crashes: 0,
    drift: 0,
    topSpeed: 0,
    spin: 0,
    shake: 0,
    skyX: 0,
    steer: 0,
    off: false,
    banner: '',
    bannerSub: '',
    bannerT: 99,
    bannerColor: '#fff',
    pop: '',
    popT: 99,
    puffT: 0,
    countN: 4,
    braking: false,
  }
}

// ─── 엔진 소리 (속도 따라 음높이가 바뀌는 계속 나는 소리) ───
interface Engine {
  set: (pct: number, on: boolean, now: number) => void
  stop: () => void
}
function createEngine(): Engine | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  const c = new Ctor()
  const out = c.createGain()
  out.gain.value = 0
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 600
  lp.Q.value = 3
  const a = c.createOscillator()
  a.type = 'sawtooth'
  const b = c.createOscillator()
  b.type = 'square'
  const bGain = c.createGain()
  bGain.gain.value = 0.35
  a.connect(lp)
  b.connect(bGain).connect(lp)
  lp.connect(out).connect(c.destination)
  a.frequency.value = 50
  b.frequency.value = 25
  a.start()
  b.start()
  let last = -1
  return {
    set(pct, on, now) {
      if (now - last < 0.05 && now >= last) return
      last = now
      if (c.state === 'suspended') void c.resume()
      const t = c.currentTime
      const f = 46 + pct * 175
      a.frequency.setTargetAtTime(f, t, 0.06)
      b.frequency.setTargetAtTime(f * 0.502, t, 0.06)
      lp.frequency.setTargetAtTime(420 + pct * 1500, t, 0.08)
      out.gain.setTargetAtTime(on && !isMuted() ? 0.045 + pct * 0.04 : 0, t, 0.07)
    },
    stop() {
      try {
        a.stop()
        b.stop()
      } catch {
        /* 이미 멈춤 */
      }
      void c.close()
    },
  }
}

// ─── 그리기 도우미 ───
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)))
  ctx.fill()
}
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2)
  ctx.fill()
}
function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath()
  ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2)
  ctx.fill()
}
function quad(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, col: string) {
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.lineTo(x4, y4)
  ctx.closePath()
  ctx.fill()
}
/** 테두리 있는 글씨 (넘치면 줄여서) */
function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, px: number, fill: string, stroke = '#2b1a45') {
  ctx.font = `700 ${px}px ${GAME_FONT}`
  const w = ctx.measureText(text).width
  const size = w > maxW ? Math.max(6, Math.floor((px * maxW) / w)) : px
  ctx.font = `700 ${size}px ${GAME_FONT}`
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(3, size * 0.2)
  ctx.strokeStyle = stroke
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  fitText(ctx, text, x, y, maxW, px)
}

/** 뒤에서 본 통통한 차. (cx, by) = 바닥 가운데, W = 폭 */
function drawCar(ctx: CanvasRenderingContext2D, cx: number, by: number, W: number, pal: readonly string[], kind: number, tilt: number, brake: boolean, player: boolean) {
  if (W < 3) return
  const H = W * (kind === 1 ? 0.84 : kind === 2 ? 0.62 : 0.74)
  ctx.save()
  ctx.translate(cx, by)
  if (tilt) ctx.rotate(tilt)
  // 그림자
  ctx.fillStyle = 'rgba(30,15,50,0.32)'
  ellipse(ctx, 0, -W * 0.01, W * 0.58, W * 0.085)
  if (W < 10) {
    ctx.fillStyle = pal[0]
    rr(ctx, -W / 2, -H * 0.8, W, H * 0.8, W * 0.2)
    ctx.restore()
    return
  }
  // 바퀴
  ctx.fillStyle = '#2a2438'
  rr(ctx, -W * 0.47, -H * 0.3, W * 0.24, H * 0.3, W * 0.07)
  rr(ctx, W * 0.23, -H * 0.3, W * 0.24, H * 0.3, W * 0.07)
  ctx.fillStyle = '#4a4360'
  rr(ctx, -W * 0.42, -H * 0.27, W * 0.08, H * 0.08, W * 0.03)
  rr(ctx, W * 0.34, -H * 0.27, W * 0.08, H * 0.08, W * 0.03)
  // 지붕 (캐빈)
  const cw = kind === 2 ? W * 0.68 : W * 0.78
  const ch = kind === 1 ? H * 0.5 : H * 0.44
  const ctop = -H
  ctx.fillStyle = pal[1]
  rr(ctx, -cw / 2, ctop, cw, ch + H * 0.1, kind === 1 ? W * 0.12 : W * 0.26)
  ctx.fillStyle = pal[0]
  rr(ctx, -cw / 2 + W * 0.02, ctop, cw - W * 0.04, ch + H * 0.06, kind === 1 ? W * 0.11 : W * 0.25)
  // 뒷유리
  const gw = cw * 0.76
  const gy = ctop + ch * 0.2
  const gh = ch * 0.62
  ctx.fillStyle = '#4b4f8f'
  rr(ctx, -gw / 2, gy, gw, gh, W * 0.1)
  ctx.fillStyle = '#7f9ee0'
  rr(ctx, -gw / 2, gy, gw, gh * 0.45, W * 0.1)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.beginPath()
  ctx.moveTo(-gw * 0.2, gy + gh)
  ctx.lineTo(-gw * 0.02, gy)
  ctx.lineTo(gw * 0.1, gy)
  ctx.lineTo(-gw * 0.08, gy + gh)
  ctx.closePath()
  ctx.fill()
  // 몸통
  const bt = -H * 0.6
  const bb = -H * 0.1
  ctx.fillStyle = pal[1]
  rr(ctx, -W / 2, bt, W, bb - bt, W * 0.2)
  ctx.fillStyle = pal[0]
  rr(ctx, -W / 2, bt, W, (bb - bt) * 0.76, W * 0.2)
  ctx.fillStyle = pal[2]
  rr(ctx, -W * 0.38, bt + H * 0.04, W * 0.76, H * 0.055, H * 0.03)
  // 범퍼
  ctx.fillStyle = '#3a3350'
  rr(ctx, -W * 0.44, -H * 0.2, W * 0.88, H * 0.1, H * 0.05)
  // 꼬리등
  if (brake) {
    ctx.fillStyle = 'rgba(255,60,90,0.3)'
    ellipse(ctx, -W * 0.36, -H * 0.44, W * 0.15, H * 0.12)
    ellipse(ctx, W * 0.36, -H * 0.44, W * 0.15, H * 0.12)
  }
  ctx.fillStyle = brake ? '#ff3358' : '#ff7088'
  rr(ctx, -W * 0.46, -H * 0.5, W * 0.19, H * 0.13, H * 0.065)
  rr(ctx, W * 0.27, -H * 0.5, W * 0.19, H * 0.13, H * 0.065)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  rr(ctx, -W * 0.43, -H * 0.48, W * 0.06, H * 0.04, H * 0.02)
  rr(ctx, W * 0.3, -H * 0.48, W * 0.06, H * 0.04, H * 0.02)
  if (player) {
    // 번호판
    ctx.fillStyle = '#fffaf0'
    rr(ctx, -W * 0.14, -H * 0.43, W * 0.28, H * 0.14, H * 0.04)
    ctx.fillStyle = '#3a2550'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fitText(ctx, '붕붕', 0, -H * 0.355, W * 0.24, Math.max(6, H * 0.1))
    // 안테나 + 별
    ctx.strokeStyle = '#3a3350'
    ctx.lineWidth = Math.max(1, W * 0.015)
    ctx.beginPath()
    ctx.moveTo(cw * 0.3, ctop + H * 0.06)
    ctx.quadraticCurveTo(cw * 0.36, ctop - H * 0.15, cw * 0.28 - tilt * W * 0.6, ctop - H * 0.32)
    ctx.stroke()
    ctx.fillStyle = '#ffd25e'
    star(ctx, cw * 0.28 - tilt * W * 0.6, ctop - H * 0.32, W * 0.055)
    // 머플러
    ctx.fillStyle = '#8a8499'
    rr(ctx, W * 0.12, -H * 0.13, W * 0.08, H * 0.06, H * 0.03)
  }
  ctx.restore()
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 ? r * 0.45 : r
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad)
  }
  ctx.closePath()
  ctx.fill()
}

/** 길가 장식. (x, y) = 바닥, u = 그 거리에서 길 반폭(px) */
function drawDeco(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, u: number, side: number, idx: number, clock: number) {
  if (u < 1.5) return
  switch (kind) {
    case D.TREE: {
      const pink = idx % 5 === 0
      ctx.fillStyle = 'rgba(30,15,50,0.22)'
      ellipse(ctx, x, y, u * 0.28, u * 0.06)
      ctx.fillStyle = '#8a5a44'
      rr(ctx, x - u * 0.05, y - u * 0.4, u * 0.1, u * 0.4, u * 0.03)
      ctx.fillStyle = pink ? '#e47aa8' : '#3f9a5a'
      circle(ctx, x - u * 0.17, y - u * 0.5, u * 0.22)
      circle(ctx, x + u * 0.17, y - u * 0.5, u * 0.22)
      circle(ctx, x, y - u * 0.68, u * 0.3)
      ctx.fillStyle = pink ? '#ffb6d3' : '#69c46a'
      circle(ctx, x - u * 0.08, y - u * 0.76, u * 0.17)
      circle(ctx, x - u * 0.2, y - u * 0.55, u * 0.1)
      if (u > 20) {
        ctx.fillStyle = pink ? '#fff0f6' : '#a6e38e'
        circle(ctx, x - u * 0.12, y - u * 0.82, u * 0.05)
      }
      return
    }
    case D.PINE: {
      ctx.fillStyle = 'rgba(30,15,50,0.22)'
      ellipse(ctx, x, y, u * 0.22, u * 0.05)
      ctx.fillStyle = '#7a4f3c'
      rr(ctx, x - u * 0.04, y - u * 0.3, u * 0.08, u * 0.3, u * 0.02)
      for (let k = 0; k < 3; k++) {
        const by = y - u * (0.22 + k * 0.28)
        const hw = u * (0.3 - k * 0.07)
        ctx.fillStyle = '#2f7d5b'
        ctx.beginPath()
        ctx.moveTo(x - hw, by)
        ctx.lineTo(x + hw, by)
        ctx.lineTo(x, by - u * 0.42)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#46a06f'
        ctx.beginPath()
        ctx.moveTo(x - hw, by)
        ctx.lineTo(x - hw * 0.15, by)
        ctx.lineTo(x, by - u * 0.42)
        ctx.closePath()
        ctx.fill()
      }
      return
    }
    case D.BUSH: {
      ctx.fillStyle = '#4fa75a'
      ellipse(ctx, x, y - u * 0.1, u * 0.28, u * 0.14)
      ctx.fillStyle = '#6cc46b'
      ellipse(ctx, x - u * 0.06, y - u * 0.15, u * 0.16, u * 0.08)
      if (u > 8) {
        ctx.fillStyle = idx % 2 ? '#ffd25e' : '#ff8fb1'
        circle(ctx, x - u * 0.15, y - u * 0.14, u * 0.035)
        circle(ctx, x + u * 0.08, y - u * 0.2, u * 0.035)
        circle(ctx, x + u * 0.18, y - u * 0.08, u * 0.035)
      }
      return
    }
    case D.LAMP: {
      const top = y - u * 1.25
      const arm = -side * u * 0.28
      ctx.fillStyle = 'rgba(255,220,140,0.16)'
      ellipse(ctx, x + arm, y, u * 0.35, u * 0.07)
      ctx.fillStyle = '#4a4560'
      rr(ctx, x - u * 0.025, top, u * 0.05, u * 1.25, u * 0.02)
      ctx.strokeStyle = '#4a4560'
      ctx.lineWidth = Math.max(1, u * 0.035)
      ctx.beginPath()
      ctx.moveTo(x, top + u * 0.05)
      ctx.quadraticCurveTo(x, top - u * 0.08, x + arm, top - u * 0.02)
      ctx.stroke()
      const flick = 0.85 + Math.sin(clock * 3 + idx) * 0.05
      ctx.fillStyle = `rgba(255,214,120,${0.22 * flick})`
      circle(ctx, x + arm, top + u * 0.04, u * 0.2)
      ctx.fillStyle = '#ffe7a3'
      rr(ctx, x + arm - u * 0.07, top - u * 0.02, u * 0.14, u * 0.07, u * 0.03)
      return
    }
    case D.CHEV_L:
    case D.CHEV_R: {
      const dir = kind === D.CHEV_R ? 1 : -1
      const bw = u * 0.55
      const bh = u * 0.24
      const top = y - u * 0.55
      ctx.fillStyle = '#4a4560'
      rr(ctx, x - u * 0.02, top, u * 0.04, u * 0.55, u * 0.02)
      ctx.fillStyle = '#2b1a45'
      rr(ctx, x - bw / 2 - u * 0.02, top - bh - u * 0.02, bw + u * 0.04, bh + u * 0.04, u * 0.05)
      ctx.fillStyle = '#ffcf3f'
      rr(ctx, x - bw / 2, top - bh, bw, bh, u * 0.04)
      if (u > 6) {
        ctx.strokeStyle = '#2b1a45'
        ctx.lineWidth = Math.max(1, u * 0.045)
        ctx.lineJoin = 'round'
        for (let k = -1; k <= 1; k++) {
          const ax = x + k * bw * 0.28
          ctx.beginPath()
          ctx.moveTo(ax - dir * bw * 0.08, top - bh * 0.8)
          ctx.lineTo(ax + dir * bw * 0.08, top - bh * 0.5)
          ctx.lineTo(ax - dir * bw * 0.08, top - bh * 0.2)
          ctx.stroke()
        }
      }
      return
    }
    case D.BOARD: {
      const b = BOARDS[idx % BOARDS.length]
      const bw = u * 1.15
      const bh = u * 0.5
      const top = y - u * 1.05
      ctx.fillStyle = '#4a4560'
      rr(ctx, x - bw * 0.32, top + bh, u * 0.05, y - top - bh, u * 0.02)
      rr(ctx, x + bw * 0.32 - u * 0.05, top + bh, u * 0.05, y - top - bh, u * 0.02)
      ctx.fillStyle = '#2b1a45'
      rr(ctx, x - bw / 2 - u * 0.03, top - u * 0.03, bw + u * 0.06, bh + u * 0.06, u * 0.08)
      ctx.fillStyle = b.bg
      rr(ctx, x - bw / 2, top, bw, bh, u * 0.06)
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      rr(ctx, x - bw / 2 + u * 0.04, top + u * 0.04, bw - u * 0.08, bh * 0.25, u * 0.04)
      if (u > 26) {
        ctx.fillStyle = b.fg
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        fitText(ctx, b.t, x, top + bh * 0.56, bw * 0.86, bh * 0.36)
      }
      return
    }
    case D.HOUSE: {
      const hw = u * 0.9
      const hh = u * 0.55
      const roof = ['#d9668a', '#5f86d9', '#e0904a'][idx % 3]
      ctx.fillStyle = 'rgba(30,15,50,0.2)'
      ellipse(ctx, x, y, hw * 0.6, u * 0.06)
      ctx.fillStyle = '#fbe9d8'
      rr(ctx, x - hw / 2, y - hh, hw, hh, u * 0.03)
      ctx.fillStyle = roof
      ctx.beginPath()
      ctx.moveTo(x - hw * 0.6, y - hh)
      ctx.lineTo(x + hw * 0.6, y - hh)
      ctx.lineTo(x, y - hh - u * 0.4)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#ffd36b'
      rr(ctx, x - hw * 0.34, y - hh * 0.75, hw * 0.22, hh * 0.32, u * 0.02)
      ctx.fillStyle = '#9a6a52'
      rr(ctx, x + hw * 0.1, y - hh * 0.62, hw * 0.2, hh * 0.62, u * 0.02)
      return
    }
  }
}

function drawArch(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, label: string, clock: number) {
  const span = u * 1.32
  const ph = u * 1.35
  const bh = u * 0.32
  for (const s of [-1, 1]) {
    const px = x + s * span
    ctx.fillStyle = '#2b1a45'
    rr(ctx, px - u * 0.07, y - ph, u * 0.14, ph, u * 0.04)
    ctx.fillStyle = '#fff3ea'
    rr(ctx, px - u * 0.05, y - ph, u * 0.1, ph, u * 0.03)
    ctx.fillStyle = '#ff6b86'
    for (let k = 0; k < 5; k++) rr(ctx, px - u * 0.05, y - ph + (k * 2 + 1) * (ph / 10), u * 0.1, ph / 10, 0)
    // 깃발
    ctx.fillStyle = CONFETTI[(k3(clock) + (s > 0 ? 1 : 0)) % 4]
    ctx.beginPath()
    ctx.moveTo(px, y - ph - u * 0.32)
    ctx.lineTo(px + u * 0.22, y - ph - u * 0.24 + Math.sin(clock * 8) * u * 0.03)
    ctx.lineTo(px, y - ph - u * 0.16)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#2b1a45'
    rr(ctx, px - u * 0.015, y - ph - u * 0.34, u * 0.03, u * 0.36, 0)
  }
  ctx.fillStyle = '#2b1a45'
  rr(ctx, x - span - u * 0.04, y - ph - u * 0.02, span * 2 + u * 0.08, bh + u * 0.04, u * 0.08)
  ctx.fillStyle = '#ff8a5e'
  rr(ctx, x - span, y - ph, span * 2, bh, u * 0.06)
  // 체크 무늬 띠
  const cs = bh / 4
  if (cs > 1.5) {
    for (let k = 0; k * cs < span * 2; k++) {
      ctx.fillStyle = k % 2 ? '#2b1a45' : '#fff3ea'
      ctx.fillRect(x - span + k * cs, y - ph + bh - cs, Math.min(cs, x + span - (x - span + k * cs)), cs)
    }
  }
  if (u > 18) {
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fitText(ctx, label, x, y - ph + bh * 0.4, span * 1.7, bh * 0.52)
  }
}
const k3 = (clock: number) => Math.floor(clock * 4)

// ─── 하늘 · 먼 배경 ───
let skyCache: { h: number; cy: number; g: CanvasGradient | null; ctx: CanvasRenderingContext2D | null } = { h: 0, cy: 0, g: null, ctx: null }

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, cy: number, skyX: number, clock: number) {
  if (skyCache.h !== h || skyCache.cy !== cy || skyCache.ctx !== ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, cy)
    g.addColorStop(0, '#2c2163')
    g.addColorStop(0.35, '#6a3d8f')
    g.addColorStop(0.7, '#d9688d')
    g.addColorStop(1, '#ffb27a')
    skyCache = { h, cy, g, ctx }
  }
  ctx.fillStyle = skyCache.g!
  ctx.fillRect(0, 0, w, cy + 2)
  // 별 몇 개
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  for (let i = 0; i < 18; i++) {
    const sx = (((i * 97.3 + skyX * w * 0.05) % w) + w) % w
    const sy = ((i * 53.7) % (cy * 0.45)) + 4
    const tw = 0.5 + Math.sin(clock * 2 + i) * 0.5
    ctx.globalAlpha = 0.25 + tw * 0.5
    ctx.fillRect(sx, sy, 2, 2)
  }
  ctx.globalAlpha = 1
  // 해
  const P = w * 2.2
  const sunX = ((((w * 0.62 - skyX * w * 0.12) % P) + P) % P) - w * 0.3
  const sunR = Math.min(w, h) * 0.13
  const sunY = cy - sunR * 0.55
  ctx.fillStyle = 'rgba(255,200,120,0.18)'
  circle(ctx, sunX, sunY, sunR * 1.7)
  ctx.fillStyle = 'rgba(255,210,130,0.25)'
  circle(ctx, sunX, sunY, sunR * 1.3)
  ctx.fillStyle = '#ffe08f'
  circle(ctx, sunX, sunY, sunR)
  ctx.fillStyle = '#fff1c2'
  circle(ctx, sunX - sunR * 0.25, sunY - sunR * 0.25, sunR * 0.45)
  // 구름
  for (const c of CLOUDS) {
    const cw = w * 0.18 * c.s
    const cx = ((((c.x * w * 1.6 - skyX * w * 0.2) % (w * 1.6)) + w * 1.6) % (w * 1.6)) - cw
    const cyy = cy * (0.18 + c.y * 0.42)
    ctx.fillStyle = 'rgba(255,190,200,0.55)'
    ellipse(ctx, cx, cyy, cw * 0.5, cw * 0.12)
    ellipse(ctx, cx - cw * 0.15, cyy - cw * 0.08, cw * 0.22, cw * 0.12)
    ellipse(ctx, cx + cw * 0.12, cyy - cw * 0.06, cw * 0.18, cw * 0.1)
  }
  // 먼 산
  const unit = Math.max(w, h * 0.9)
  layer(ctx, w, cy, skyX * 0.25, unit * 1.8, MTN, unit * 0.16, '#9a5f9e', true)
  // 도시
  {
    const P2 = unit * 2
    const off = ((skyX * 0.45 * w) % P2 + P2) % P2
    const bw = P2 / CITY.length
    for (let rep = -1; rep < Math.ceil(w / P2) + 1; rep++) {
      for (let i = 0; i < CITY.length; i++) {
        const b = CITY[i]
        const bx = rep * P2 + i * bw - off
        if (bx > w || bx + bw < 0) continue
        const bh = unit * 0.06 * b.h
        const ww = bw * b.w
        ctx.fillStyle = '#7a4a8e'
        ctx.fillRect(bx, cy - bh, ww * 0.8, bh + 2)
        if (bh > 14) {
          ctx.fillStyle = '#ffd98a'
          for (let k = 0; k < 6; k++) {
            if ((b.win >> k) & 1) ctx.fillRect(bx + ww * (0.14 + (k % 2) * 0.36), cy - bh + 4 + Math.floor(k / 2) * (bh / 4), Math.max(1.5, ww * 0.12), Math.max(1.5, bh * 0.08))
          }
        }
      }
    }
  }
  // 가까운 언덕 (아래까지 채움)
  layer(ctx, w, cy, skyX * 0.7, unit * 1.4, HILL, unit * 0.06, '#4f9a68', false, h)
}

function layer(ctx: CanvasRenderingContext2D, w: number, cy: number, sx: number, period: number, hs: number[], amp: number, col: string, peaks: boolean, bottom = cy + 2) {
  const n = hs.length
  const step = period / n
  const off = ((sx * w) % period + period) % period
  const i0 = Math.floor(off / step) - 1
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.moveTo(-10, bottom)
  let px = 0
  let py = 0
  for (let i = i0; ; i++) {
    const x = i * step - off
    const y = cy - amp * hs[((i % n) + n) % n]
    if (i === i0) ctx.lineTo(x, y)
    else if (peaks) ctx.lineTo(x, y)
    else ctx.quadraticCurveTo(px + step / 2, py, (px + x) / 2 + step / 4, (py + y) / 2)
    px = x
    py = y
    if (x > w + step) break
  }
  ctx.lineTo(w + 10, bottom)
  ctx.closePath()
  ctx.fill()
}

// ─── 컴포넌트 ───
export default function RaceGame({ onResult, onClose }: GameProps) {
  const [over, setOver] = useState<Over | null>(null)
  const gRef = useRef<G>(null as unknown as G)
  if (!gRef.current) gRef.current = newGame((Math.random() * 1e9) | 0)
  // 개발 중 화면 확인용 (배포본에선 빠진다)
  if (import.meta.env.DEV) (window as unknown as { __race?: typeof gRef }).__race = gRef
  const parts = useRef<Part[]>(Array.from({ length: 180 }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, size: 1, kind: 0 })))
  const keys = useRef({ left: false, right: false, brake: false })
  const ptrs = useRef(new Map<number, number>())
  const engine = useRef<Engine | null>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult
  const touchUI = useRef(typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches)
  const proj = useRef<Proj>({ sx: 0, sy: 0, sw: 0, scale: 0 })
  const proj2 = useRef<Proj>({ sx: 0, sy: 0, sw: 0, scale: 0 })
  const input = useRef({ left: false, right: false, brake: false })
  const stageW = useRef(0)

  const emit = (kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number, grav = 0) => {
    const ps = parts.current
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]
      if (p.on) continue
      p.on = true
      p.x = x
      p.y = y
      p.vx = vx
      p.vy = vy
      p.life = life
      p.max = life
      p.size = size
      p.kind = kind
      p.g = grav
      return
    }
  }

  const start = () => {
    const g = gRef.current
    if (g.phase !== 'ready') return
    if (!engine.current) engine.current = createEngine()
    g.phase = 'count'
    g.t = 0
    g.countN = 4
    sfx.click()
  }

  const again = () => {
    gRef.current = newGame((Math.random() * 1e9) | 0)
    for (const p of parts.current) p.on = false
    setOver(null)
    start()
  }

  // 키보드
  useEffect(() => {
    const set = (e: KeyboardEvent, v: boolean) => {
      const k = e.key
      let hit = true
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.current.left = v
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.current.right = v
      else if (k === 'ArrowDown' || k === 's' || k === 'S' || k === ' ') keys.current.brake = v
      else hit = false
      if (v && gRef.current.phase === 'ready' && (hit || k === 'Enter' || k === 'ArrowUp')) {
        start()
        hit = true
      }
      if (hit) e.preventDefault()
    }
    const down = (e: KeyboardEvent) => set(e, true)
    const up = (e: KeyboardEvent) => set(e, false)
    const blur = () => {
      keys.current.left = keys.current.right = keys.current.brake = false
      ptrs.current.clear()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  // 엔진 소리 정리
  useEffect(
    () => () => {
      engine.current?.stop()
      engine.current = null
    },
    [],
  )

  const finishRun = () => {
    const g = gRef.current
    g.phase = 'over'
    const score = metres(g.pos)
    const best = saveScore('race', score)
    const line = resultLine({ metres: score, crashes: g.crashes, drift: g.drift, checkpoints: g.checkpoints })
    if (best) sfx.win()
    else sfx.lose()
    onResultRef.current({ score, line })
    setOver({ score, best, line, checkpoints: g.checkpoints, crashes: g.crashes, top: kmh(g.topSpeed) })
  }

  const crash = (g: G, cx: number, cy: number, carW: number, tree: boolean) => {
    g.spin = 0.8
    g.shake = 1
    g.crashes++
    g.pop = tree ? '쿵!' : '빵빵!'
    g.popT = 0
    noise(0.25, { vol: 0.5, lowpass: 700 })
    tone(260, 0.3, { wave: 'sawtooth', vol: 0.12, to: 70 })
    tone(1200, 0.12, { wave: 'square', vol: 0.06, delay: 0.05, to: 600 })
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      emit(2, cx, cy - carW * 0.4, Math.cos(a) * 160, Math.sin(a) * 160 - 60, 0.6, carW * 0.06, 200)
    }
    if (tree) for (let i = 0; i < 14; i++) emit(1, cx + (Math.random() - 0.5) * carW, cy - carW * 0.3, (Math.random() - 0.5) * 300, -Math.random() * 300, 0.8, carW * 0.04, 600)
  }

  const canvasRef = useCanvasLoop((ctx, dt, w, h) => {
    const g = gRef.current
    stageW.current = w
    g.clock += dt
    g.t += dt
    const L = g.track.length
    const car = g.car
    const pct = car.speed / MAX_SPEED

    // ─── 배치 ───
    const portrait = h > w * 1.05
    const pads = portrait || touchUI.current
    const cy = portrait ? h * 0.37 : h * 0.43
    const carY = portrait ? h - 122 : pads ? h - 96 : h - 34
    const halfRoad = portrait ? w * 0.66 : Math.min(w * 0.42, h * 0.78)
    const kx = halfRoad / (ROAD_W / CAM_H)
    const ky = carY - cy
    const carW = halfRoad * CAR_VIS

    // ─── 입력 ───
    const inp = input.current
    let pl = keys.current.left
    let pr = keys.current.right
    for (const side of ptrs.current.values()) {
      if (side < 0) pl = true
      else pr = true
    }
    inp.brake = keys.current.brake || (pl && pr)
    inp.left = pl && !inp.brake
    inp.right = pr && !inp.brake

    // ─── 업데이트 ───
    const playerAbs = g.pos + PLAYER_Z
    const pseg = g.track[segIndexAt(playerAbs, L)]
    if (g.phase === 'count') {
      const n = 3 - Math.floor(g.t)
      if (n !== g.countN) {
        g.countN = n
        if (n > 0) tone(523, 0.18, { wave: 'square', vol: 0.12 })
        else {
          tone(1047, 0.4, { wave: 'square', vol: 0.13 })
          g.phase = 'play'
          g.t = 0
          g.banner = '출발!'
          g.bannerSub = ''
          g.bannerT = 0
          g.bannerColor = '#ffe46b'
        }
      }
    }
    if (g.phase === 'play' || g.phase === 'finish') {
      let use = g.phase === 'finish' ? BRAKE_INPUT : inp
      if (g.spin > 0) {
        g.spin -= dt
        use = NONE_INPUT
        car.speed *= 1 - dt * 1.4
      }
      g.braking = use.brake
      const off = stepPlayer(car, use, pseg.curve, dt)
      g.off = off
      g.pos += car.speed * dt
      g.topSpeed = Math.max(g.topSpeed, car.speed)
      moveTraffic(g.cars, dt)
      recycleTraffic(g.cars, g.pos + PLAYER_Z, g.rnd)
      const target = use.left ? -1 : use.right ? 1 : 0
      g.steer += (target - g.steer) * Math.min(1, dt * 8)
      g.skyX += pseg.curve * pct * dt * 0.06

      if (g.phase === 'play' && g.spin <= 0) {
        const hi = hitCar(g.cars, g.pos + PLAYER_Z, car.x, car.speed)
        if (hi >= 0) {
          const other = g.cars[hi]
          car.speed = other.speed * 0.55
          other.z += SEG_LEN * 1.2
          other.speed = Math.min(MAX_SPEED * 0.6, other.speed * 1.2)
          crash(g, w / 2, carY, carW, false)
        } else if (off && car.speed > OFF_LIMIT * 0.5) {
          for (let k = 0; k < 2; k++) {
            const kind = k ? pseg.dr : pseg.dl
            if (kind === D.NONE || kind === D.BUSH || kind === D.HOUSE) continue
            if (overlap(car.x, PLAYER_W, k ? pseg.drx : pseg.dlx, 0.3)) {
              car.speed *= 0.25
              car.x -= Math.sign(car.x) * 0.25
              crash(g, w / 2, carY, carW, true)
              break
            }
          }
        }
        // 드리프트 (빠르게 굽은 길을 길 위에서)
        if (!off && Math.abs(pseg.curve) >= 3 && pct > 0.75) {
          g.drift += dt
          if (Math.random() < dt * 30) emit(4, w / 2 - Math.sign(pseg.curve) * carW * 0.4, carY - 4, -Math.sign(pseg.curve) * 60, -30, 0.45, carW * 0.04, -40)
        }
        // 체크포인트
        const absSeg = Math.floor((g.pos + PLAYER_Z) / SEG_LEN)
        if (absSeg >= checkpointSeg(g.nextCp)) {
          g.nextCp++
          g.checkpoints++
          g.time += CHECK_BONUS
          g.banner = '체크포인트!'
          g.bannerSub = `+${CHECK_BONUS}초`
          g.bannerT = 0
          g.bannerColor = '#7dffb0'
          sfx.coin()
          tone(1568, 0.25, { wave: 'triangle', vol: 0.1, delay: 0.18 })
          for (let i = 0; i < 40; i++) emit(3, w * Math.random(), cy * 0.6 + Math.random() * 40, (Math.random() - 0.5) * 220, Math.random() * 120, 1.6, 4 + Math.random() * 4, 260)
        }
        g.time -= dt
        if (g.time <= 0) {
          g.time = 0
          g.phase = 'finish'
          g.t = 0
          g.banner = '타임 오버!'
          g.bannerSub = ''
          g.bannerT = 0
          g.bannerColor = '#ffb3c8'
          sfx.lose()
        }
      }
      if (g.phase === 'finish' && (g.t > 1.8 || (car.speed < 50 && g.t > 0.8))) finishRun()

      // 배기 · 풀 · 흙
      g.puffT -= dt
      if (g.puffT <= 0 && (g.phase as Phase) !== 'over') {
        g.puffT = 0.07 + (1 - pct) * 0.06
        emit(0, w / 2 + carW * 0.16, carY - carW * 0.07, (Math.random() - 0.5) * 30 - g.steer * 40, 20 + Math.random() * 20, 0.5, carW * (0.025 + pct * 0.015), -50)
      }
      if (off && car.speed > 300) {
        for (let k = 0; k < 2; k++) {
          const sx = w / 2 + (k ? 1 : -1) * carW * 0.38
          emit(Math.random() < 0.7 ? 1 : 5, sx, carY - 4, (Math.random() - 0.5) * 220, -80 - Math.random() * 220 * pct, 0.6, carW * (0.025 + Math.random() * 0.025), 700)
        }
      }
    } else {
      g.steer *= 0.9
      g.braking = false
    }
    g.shake = Math.max(0, g.shake - dt * 2.5)
    g.bannerT += dt
    g.popT += dt

    // 엔진
    const eng = engine.current
    if (eng) {
      const running = g.phase === 'count' || g.phase === 'play' || g.phase === 'finish'
      const rev = g.phase === 'count' ? 0.08 + Math.max(0, Math.sin(g.t * Math.PI * 2)) * 0.12 : pct
      eng.set(rev, running, g.clock)
    }

    // ─── 그리기 ───
    ctx.save()
    if (g.shake > 0) {
      const s = g.shake * g.shake * 10
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s)
    }
    drawSky(ctx, w, h, cy, g.skyX, g.clock)

    const baseAbs = Math.floor(g.pos / SEG_LEN)
    const basePct = (g.pos % SEG_LEN) / SEG_LEN
    const baseSeg = g.track[segIndexAt(g.pos, L)]
    const pPct = (playerAbs % SEG_LEN) / SEG_LEN
    const playerY = pseg.y1 + (pseg.y2 - pseg.y1) * pPct
    const camX = car.x * ROAD_W
    const camY = playerY + CAM_H
    let maxy = h
    let x = 0
    let dx = -(baseSeg.curve * basePct)
    const p1 = proj.current
    const p2 = proj2.current
    const cpAbs = checkpointSeg(g.nextCp)
    for (let n = 0; n < DRAW_DIST; n++) {
      const abs = baseAbs + n
      const s = g.track[((abs % L) + L) % L]
      const z1 = abs * SEG_LEN
      project(p1, 0, s.y1, z1, camX - x, camY, g.pos, w / 2, cy, kx, ky)
      project(p2, 0, s.y2, z1 + SEG_LEN, camX - x - dx, camY, g.pos, w / 2, cy, kx, ky)
      x += dx
      dx += s.curve
      s.sx1 = p1.sx
      s.sy1 = p1.sy
      s.sw1 = p1.sw
      s.sc1 = z1 - g.pos > 1 ? p1.scale : 0
      s.sx2 = p2.sx
      s.sy2 = p2.sy
      s.sw2 = p2.sw
      s.clip = maxy
      s.vis = false
      if (z1 - g.pos <= 1 || p2.sy >= p1.sy || p2.sy >= maxy) continue
      s.vis = true
      const fi = Math.min(FOG_STEPS - 1, Math.floor(Math.pow(n / DRAW_DIST, 1.6) * FOG_STEPS))
      const alt = Math.floor(abs / RUMBLE) % 2 === 0
      const y1 = p1.sy + 1
      const y2 = p2.sy
      ctx.fillStyle = (alt ? C.grassL : C.grassD)[fi]
      ctx.fillRect(0, y2, w, y1 - y2)
      const r1 = p1.sw / 6
      const r2 = p2.sw / 6
      const rc = (alt ? C.rumR : C.rumW)[fi]
      quad(ctx, p1.sx - p1.sw - r1, y1, p1.sx - p1.sw, y1, p2.sx - p2.sw, y2, p2.sx - p2.sw - r2, y2, rc)
      quad(ctx, p1.sx + p1.sw + r1, y1, p1.sx + p1.sw, y1, p2.sx + p2.sw, y2, p2.sx + p2.sw + r2, y2, rc)
      quad(ctx, p1.sx - p1.sw, y1, p1.sx + p1.sw, y1, p2.sx + p2.sw, y2, p2.sx - p2.sw, y2, (alt ? C.roadL : C.roadD)[fi])
      if (abs === cpAbs || abs === 12) {
        // 체크 무늬 선
        const cells = 10
        for (let k = 0; k < cells; k += 2) {
          const a = -1 + (2 * k) / cells
          const b = -1 + (2 * (k + 1)) / cells
          quad(ctx, p1.sx + p1.sw * a, y1, p1.sx + p1.sw * b, y1, p2.sx + p2.sw * b, y2, p2.sx + p2.sw * a, y2, C.chk[fi])
        }
      } else if (alt) {
        const l1 = p1.sw / 40
        const l2 = p2.sw / 40
        for (let k = 1; k < LANES; k++) {
          const lx1 = p1.sx - p1.sw + ((p1.sw * 2) / LANES) * k
          const lx2 = p2.sx - p2.sw + ((p2.sw * 2) / LANES) * k
          quad(ctx, lx1 - l1, y1, lx1 + l1, y1, lx2 + l2, y2, lx2 - l2, y2, C.lane[fi])
        }
      }
      maxy = p1.sy
    }

    // 장식 · 차 (먼 것부터)
    const playerN = Math.floor(playerAbs / SEG_LEN) - baseAbs
    const tilt = g.steer * 0.07 + (g.spin > 0 ? Math.sin(g.spin * 22) * g.spin * 0.45 : 0)
    for (let n = DRAW_DIST - 1; n >= 0; n--) {
      const abs = baseAbs + n
      const s = g.track[((abs % L) + L) % L]
      if (s.sc1 > 0) {
        const fade = n > DRAW_DIST * 0.75 ? 1 - (n - DRAW_DIST * 0.75) / (DRAW_DIST * 0.25) : 1
        const needClip = s.sy1 > s.clip
        if (needClip) {
          ctx.save()
          ctx.beginPath()
          ctx.rect(-50, -50, w + 100, s.clip + 50)
          ctx.clip()
        }
        ctx.globalAlpha = fade
        const u = s.sw1
        if (s.dl) drawDeco(ctx, s.dl, s.sx1 + u * s.dlx, s.sy1, u, -1, abs, g.clock)
        if (s.dr) drawDeco(ctx, s.dr, s.sx1 + u * s.drx, s.sy1, u, 1, abs, g.clock)
        if (abs === cpAbs) drawArch(ctx, s.sx1, s.sy1, u, `체크포인트 ${g.nextCp}`, g.clock)
        if (abs === 12) drawArch(ctx, s.sx1, s.sy1, u, '출발', g.clock)
        const z1 = abs * SEG_LEN
        for (let i = 0; i < g.cars.length; i++) {
          const c = g.cars[i]
          if (c.z < z1 || c.z >= z1 + SEG_LEN) continue
          const k = (c.z - z1) / SEG_LEN
          const sw = s.sw1 + (s.sw2 - s.sw1) * k
          const cx = s.sx1 + (s.sx2 - s.sx1) * k + sw * c.x
          const cyy = s.sy1 + (s.sy2 - s.sy1) * k
          drawCar(ctx, cx, cyy, sw * CAR_VIS, BODY[c.color], c.kind, 0, false, false)
        }
        ctx.globalAlpha = 1
        if (needClip) ctx.restore()
      }
      if (n === playerN) {
        const bob = g.phase === 'play' || g.phase === 'finish' ? Math.sin(g.clock * 34) * pct * 1.2 + (g.off ? (Math.random() - 0.5) * 4 * pct : 0) : Math.sin(g.clock * 9) * 0.6
        drawCar(ctx, w / 2 + (g.spin > 0 ? Math.sin(g.spin * 18) * carW * 0.05 : 0), carY + bob, carW, PLAYER_PAL, 0, tilt, g.braking || g.phase === 'ready' || g.phase === 'count', true)
      }
    }

    // 입자
    const ps = parts.current
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]
      if (!p.on) continue
      p.life -= dt
      if (p.life <= 0) {
        p.on = false
        continue
      }
      p.vy += p.g * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      const k = p.life / p.max
      if (p.kind === 3) {
        ctx.fillStyle = CONFETTI[i % CONFETTI.length]
        ctx.globalAlpha = Math.min(1, k * 2)
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.life * 8 + i)
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      } else if (p.kind === 2) {
        ctx.globalAlpha = Math.min(1, k * 1.5)
        ctx.fillStyle = '#ffe46b'
        star(ctx, p.x, p.y, p.size * (0.6 + k * 0.6))
      } else {
        const grow = p.kind === 0 || p.kind === 4 ? 1 + (1 - k) * 1.6 : 1
        ctx.globalAlpha = p.kind === 0 || p.kind === 4 ? k * 0.45 : Math.min(1, k * 2)
        ctx.fillStyle = PART_COL[p.kind] + '1)'
        circle(ctx, p.x, p.y, p.size * grow)
      }
    }
    ctx.globalAlpha = 1

    // 속도선
    if (pct > 0.82 && (g.phase === 'play' || g.phase === 'finish')) {
      const a = (pct - 0.82) / 0.18
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * a})`
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i < 16; i++) {
        const ang = Math.random() * Math.PI * 2
        const r0 = Math.max(w, h) * (0.35 + Math.random() * 0.2)
        const r1 = r0 + Math.max(w, h) * 0.2
        const ca = Math.cos(ang)
        const sa = Math.sin(ang)
        if (sa < -0.2 && Math.abs(ca) < 0.5) continue
        ctx.moveTo(w / 2 + ca * r0, cy + sa * r0 * 0.7)
        ctx.lineTo(w / 2 + ca * r1, cy + sa * r1 * 0.7)
      }
      ctx.stroke()
    }
    ctx.restore()

    // ─── HUD ───
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const showHud = g.phase !== 'ready'
    if (showHud) drawHud(ctx, g, w, h, pads, pct)
    if (pads && g.phase !== 'over') {
      const r = Math.max(32, Math.min(42, w * 0.1))
      const by = h - 16 - r
      drawPad(ctx, 16 + r, by, r, -1, inp.left || inp.brake)
      drawPad(ctx, w - 16 - r, by, r, 1, inp.right || inp.brake)
    }

    // 쿵! 글씨
    if (g.popT < 0.7) {
      const k = g.popT / 0.7
      const s = 1 + Math.sin(Math.min(1, k * 3) * Math.PI) * 0.3
      ctx.globalAlpha = 1 - k * k
      outlined(ctx, g.pop, w / 2, carY - carW * 0.9 - k * 30, w * 0.5, Math.round(carW * 0.3 * s), '#ffe46b')
      ctx.globalAlpha = 1
    }
    // 큰 알림
    if (g.bannerT < 1.6 && g.banner && g.phase !== 'over') {
      const k = g.bannerT
      const pop = k < 0.25 ? 0.4 + (k / 0.25) * 0.8 : k < 0.4 ? 1.2 - ((k - 0.25) / 0.15) * 0.2 : 1
      const alpha = k > 1.25 ? 1 - (k - 1.25) / 0.35 : 1
      const by = portrait ? h * 0.24 : h * 0.26
      ctx.globalAlpha = Math.max(0, alpha)
      outlined(ctx, g.banner, w / 2, by, w * 0.86, Math.round(Math.min(56, w * 0.11) * pop), g.bannerColor)
      if (g.bannerSub) outlined(ctx, g.bannerSub, w / 2, by + Math.min(56, w * 0.11) * 0.95, w * 0.6, Math.round(Math.min(40, w * 0.08) * pop), '#ffffff')
      ctx.globalAlpha = 1
    }
    // 카운트다운
    if (g.phase === 'count' && g.countN > 0 && g.countN <= 3) {
      const k = g.t % 1
      const s = 1.6 - Math.min(1, k * 4) * 0.6
      ctx.globalAlpha = 1 - Math.max(0, k - 0.7) / 0.3
      outlined(ctx, String(g.countN), w / 2, cy - h * 0.02, w * 0.4, Math.round(Math.min(110, w * 0.24) * s), ['#7dffb0', '#ffe46b', '#ff8fb1'][g.countN - 1])
      ctx.globalAlpha = 1
    }
    if (g.phase === 'ready') drawReady(ctx, g, w, h, portrait, pads)
    if (g.phase === 'over') {
      ctx.fillStyle = 'rgba(20,10,40,0.25)'
      ctx.fillRect(0, 0, w, h)
    }
  })

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.race-result')) return
    if (e.pointerType === 'touch') touchUI.current = true
    const g = gRef.current
    if (g.phase === 'ready') {
      start()
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    ptrs.current.set(e.pointerId, e.clientX - rect.left < rect.width / 2 ? -1 : 1)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 무시 */
    }
  }
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!ptrs.current.has(e.pointerId)) return
    const rect = e.currentTarget.getBoundingClientRect()
    ptrs.current.set(e.pointerId, e.clientX - rect.left < rect.width / 2 ? -1 : 1)
  }
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    ptrs.current.delete(e.pointerId)
  }

  return (
    <div className="race" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onUp} onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} aria-label="붕붕레이서 화면" />
      {over && (
        <div className="race-result">
          <div className="race-card" role="dialog" aria-label="결과">
            {over.best && <span className="race-badge">최고 기록!</span>}
            <div className="race-card-head">타임 오버 · 달린 거리</div>
            <div className="race-card-score">
              {over.score.toLocaleString()}
              <small>m</small>
            </div>
            <div className="race-card-line">{over.line}</div>
            <div className="race-stats">
              <span>🏁 체크 {over.checkpoints}</span>
              <span>💥 쾅 {over.crashes}</span>
              <span>⚡ {over.top}km/h</span>
            </div>
            <div className="race-btns">
              <button className="race-again" onClick={again}>
                한 판 더
              </button>
              <button className="race-quit" onClick={onClose}>
                그만하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
  ctx.fillStyle = 'rgba(20,10,40,0.35)'
  rr(ctx, x, y + 3, w, h, h / 2.4)
  ctx.fillStyle = fill
  rr(ctx, x, y, w, h, h / 2.4)
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(x + 1, y + 1, w - 2, h - 2, h / 2.4)
  ctx.stroke()
}

function drawHud(ctx: CanvasRenderingContext2D, g: G, w: number, h: number, pads: boolean, pct: number) {
  const pw = Math.min(130, w * 0.32)
  const ph = 50
  // 시간
  const low = g.time < 10 && g.phase === 'play'
  const beat = low ? 1 + Math.max(0, Math.sin(g.clock * Math.PI * 4)) * 0.06 : 1
  pill(ctx, 12, 12, pw, ph, low ? 'rgba(200,40,80,0.85)' : 'rgba(43,26,69,0.78)')
  ctx.fillStyle = '#ffc6d8'
  fitText(ctx, '남은 시간', 12 + pw / 2, 12 + 14, pw - 16, 11)
  const sec = Math.ceil(g.time)
  ctx.save()
  ctx.translate(12 + pw / 2, 12 + 34)
  ctx.scale(beat, beat)
  ctx.fillStyle = '#ffffff'
  fitText(ctx, `${sec}초`, 0, 0, pw - 16, 22)
  ctx.restore()
  // 거리
  pill(ctx, w - 12 - pw, 12, pw, ph, 'rgba(43,26,69,0.78)')
  ctx.fillStyle = '#c6e6ff'
  fitText(ctx, '거리', w - 12 - pw / 2, 12 + 14, pw - 16, 11)
  ctx.fillStyle = '#ffffff'
  fitText(ctx, `${metres(g.pos).toLocaleString()}m`, w - 12 - pw / 2, 12 + 34, pw - 16, 20)
  // 다음 체크포인트까지
  const prevSeg = g.nextCp > 1 ? checkpointSeg(g.nextCp - 1) : 0
  const nextSeg = checkpointSeg(g.nextCp)
  const cur = (g.pos + PLAYER_Z) / SEG_LEN
  const prog = Math.max(0, Math.min(1, (cur - prevSeg) / (nextSeg - prevSeg)))
  const left = Math.max(0, Math.round((nextSeg - cur) * 2))
  const wide = w >= 640
  const bw = wide ? Math.min(340, w - 2 * pw - 80) : w - 24
  const bx = (w - bw) / 2
  const by = wide ? 22 : 12 + ph + 14
  ctx.fillStyle = 'rgba(20,10,40,0.45)'
  rr(ctx, bx, by, bw, 12, 6)
  ctx.fillStyle = '#7dffb0'
  rr(ctx, bx + 2, by + 2, Math.max(8, (bw - 4) * prog), 8, 4)
  // 깃발
  ctx.fillStyle = '#fff'
  rr(ctx, bx + bw - 3, by - 8, 3, 22, 1)
  ctx.fillStyle = '#ff6b86'
  ctx.beginPath()
  ctx.moveTo(bx + bw, by - 8)
  ctx.lineTo(bx + bw + 12, by - 3)
  ctx.lineTo(bx + bw, by + 2)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.globalAlpha = 0.9
  fitText(ctx, `체크포인트까지 ${left.toLocaleString()}m`, w / 2, by + 26, bw, 12)
  ctx.globalAlpha = 1

  // 속도계
  const r = pads ? Math.min(50, w * 0.13) : Math.min(70, h * 0.11)
  const cx = pads ? w / 2 : w - r - 28
  const cyy = pads ? h - 16 : h - 22
  ctx.fillStyle = 'rgba(20,10,40,0.35)'
  ctx.beginPath()
  ctx.arc(cx, cyy + 3, r + 10, Math.PI, 0)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(43,26,69,0.85)'
  ctx.beginPath()
  ctx.arc(cx, cyy, r + 10, Math.PI, 0)
  ctx.closePath()
  ctx.fill()
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(6, r * 0.16)
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.beginPath()
  ctx.arc(cx, cyy, r - 2, Math.PI * 1.05, Math.PI * 1.95)
  ctx.stroke()
  if (pct > 0.01) {
    ctx.strokeStyle = pct > 0.85 ? '#ff6f9a' : pct > 0.5 ? '#ffd25e' : '#7dffb0'
    ctx.beginPath()
    ctx.arc(cx, cyy, r - 2, Math.PI * 1.05, Math.PI * (1.05 + 0.9 * pct))
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
  const na = Math.PI * (1.05 + 0.9 * pct)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx, cyy)
  ctx.lineTo(cx + Math.cos(na) * r * 0.78, cyy + Math.sin(na) * r * 0.78)
  ctx.stroke()
  ctx.fillStyle = '#ff6f9a'
  circle(ctx, cx, cyy, 5)
  outlined(ctx, String(kmh(g.car.speed)), cx, cyy - r * 0.42, r * 0.9, Math.round(r * 0.36), '#ffffff')
  ctx.fillStyle = '#c9b8e8'
  fitText(ctx, 'km/h', cx, cyy - r * 0.12, r * 0.8, Math.max(9, Math.round(r * 0.18)))
  if (!pads) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.textAlign = 'left'
    fitText(ctx, '← → 핸들 · ↓ 브레이크', 20, h - 22, w * 0.5, 14)
    ctx.textAlign = 'center'
  }
  if (g.braking && g.phase === 'play') {
    ctx.fillStyle = '#ff8fa8'
    fitText(ctx, '브레이크!', cx, cyy - r - 22, 120, 13)
  }
}

function drawPad(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, dir: number, on: boolean) {
  const s = on ? 0.93 : 1
  ctx.fillStyle = 'rgba(20,10,40,0.35)'
  circle(ctx, x, y + 4, r)
  ctx.fillStyle = on ? 'rgba(255,143,177,0.85)' : 'rgba(43,26,69,0.6)'
  circle(ctx, x, y + (on ? 3 : 0), r * s)
  ctx.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(x, y + (on ? 3 : 0), r * s - 2, 0, Math.PI * 2)
  ctx.stroke()
  const t = r * 0.38
  const yy = y + (on ? 3 : 0)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(x + dir * t, yy)
  ctx.lineTo(x - dir * t * 0.6, yy - t)
  ctx.lineTo(x - dir * t * 0.6, yy + t)
  ctx.closePath()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 4
  ctx.strokeStyle = '#fff'
  ctx.stroke()
  ctx.fill()
}

function drawReady(ctx: CanvasRenderingContext2D, g: G, w: number, h: number, portrait: boolean, pads: boolean) {
  ctx.fillStyle = 'rgba(25,12,50,0.35)'
  ctx.fillRect(0, 0, w, h)
  const pw = Math.min(w - 32, 420)
  const ph = Math.min(portrait ? 300 : 290, h - 140)
  const px = (w - pw) / 2
  const py = portrait ? h * 0.1 : Math.max(16, h * 0.12)
  ctx.fillStyle = 'rgba(20,10,40,0.45)'
  rr(ctx, px, py + 8, pw, ph, 24)
  ctx.fillStyle = '#fff8f2'
  rr(ctx, px, py, pw, ph, 24)
  ctx.strokeStyle = '#3a2550'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.roundRect(px, py, pw, ph, 24)
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const bounce = Math.sin(g.clock * 3) * 3
  outlined(ctx, '붕붕레이서', w / 2, py + 40 + bounce, pw - 40, 36, '#ff6f9a', '#3a2550')
  ctx.fillStyle = '#a2537a'
  fitText(ctx, '노을 언덕길 타임어택', w / 2, py + 76, pw - 40, 14)
  const lines = pads
    ? ['◀ ▶ 눌러서 핸들 (화면 반쪽도 OK)', '양쪽 같이 누르면 브레이크', '체크포인트 지나면 +10초!', '빵빵차 · 나무에 박으면 쾅!']
    : ['← → / A D 로 핸들', '↓ 또는 스페이스 = 브레이크', '체크포인트 지나면 +10초!', '빵빵차 · 나무에 박으면 쾅!']
  const lh = Math.min(30, (ph - 160) / lines.length)
  ctx.textAlign = 'left'
  for (let i = 0; i < lines.length; i++) {
    const ly = py + 106 + i * lh
    ctx.fillStyle = CONFETTI[i]
    circle(ctx, px + 30, ly, 6)
    ctx.fillStyle = '#3a2550'
    fitText(ctx, lines[i], px + 46, ly + 1, pw - 70, 15, 400)
  }
  ctx.textAlign = 'center'
  // 시작 버튼
  const blink = 0.75 + Math.sin(g.clock * 5) * 0.25
  const bw = Math.min(pw - 60, 220)
  const bh = 52
  const bx = w / 2 - bw / 2
  const by = py + ph - bh - 18
  ctx.fillStyle = '#3a2550'
  rr(ctx, bx, by + 5, bw, bh, 16)
  ctx.fillStyle = '#ff6f9a'
  rr(ctx, bx, by, bw, bh, 16)
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  rr(ctx, bx + 6, by + 5, bw - 12, bh * 0.35, 10)
  ctx.globalAlpha = blink
  outlined(ctx, '누르면 시작', w / 2, by + bh / 2 + 1, bw - 24, 20, '#fff', '#3a2550')
  ctx.globalAlpha = 1
}
