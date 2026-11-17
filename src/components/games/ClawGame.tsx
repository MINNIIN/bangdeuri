/**
 * 집게왕 인형뽑기 — 동전 3개로 한 판. ←/→(버튼·키보드·끌기)로 집게를 옮기고 '뽑기!'로 내린다.
 * 가운데를 잡을수록 꽉 잡고, 무거운 인형은 옮기다 미끄러지기도 한다. 로직은 claw.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import './ClawGame.css'
import { fitText, GAME_FONT, noise, saveScore, sfx, tone, useCanvasLoop, type GameProps } from './kit'
import {
  CHUTE_EDGE,
  COINS,
  FLOOR,
  HOME_X,
  makePile,
  mulberry32,
  pickTarget,
  PLUSH_INFO,
  prizeScore,
  restY,
  resultLine,
  rollGrab,
  type Plush,
  type PlushKind,
} from './claw'

// ─── 상수 ───
const REACH = 0.075 // 집게 반폭
const REST_Y = 0.14 // 쉴 때 집게 머리 높이
const AIM_TIME = 15
const MOVE_SPEED = 0.42
const CTRL_H = 104
const X_MIN = 0.07
const X_MAX = 0.93

type Phase = 'ready' | 'aim' | 'down' | 'close' | 'up' | 'carry' | 'open' | 'settle' | 'miss' | 'result'
type P = Plush & { wob: number }
interface Fall {
  p: P
  vy: number
  vr: number
  chute: boolean
  bounced: boolean
}
interface Part {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  kind: 'dust' | 'spark' | 'conf'
  rot: number
  vr: number
}
interface FloatText {
  text: string
  x: number
  y: number
  t: number
  color: string
}
interface Lay {
  w: number
  h: number
  cx: number
  cy: number
  cw: number
  ch: number
  mH: number
  bodyY: number
  bodyH: number
  f: number
  gx: number
  gy: number
  gw: number
  gh: number
  s: number
  ox: number
  oy: number
  side: number
}
interface G {
  phase: Phase
  t: number
  time: number
  coins: number
  prizes: PlushKind[]
  /** 뽑은 인형의 색 (prizes와 같은 순서) */
  prizeVar: number[]
  pile: P[]
  clawX: number
  vx: number
  ropeY: number
  open: number
  sw: number
  swV: number
  held: { p: P; hang: number; slipAt: number | null } | null
  target: P | null
  stopY: number
  total: number
  done: number
  wonThisTry: boolean
  falls: Fall[]
  parts: Part[]
  conf: Part[]
  texts: FloatText[]
  shake: number
  timer: number
  lastTick: number
  keys: { l: boolean; r: boolean }
  btn: number
  dragX: number | null
  popup: { kind: PlushKind; variant: number; t: number } | null
  score: number
  newBest: boolean
  flap: number
  whirr: number
  L: Lay | null
}

function newG(): G {
  return {
    phase: 'ready',
    t: 0,
    time: 0,
    coins: COINS,
    prizes: [],
    prizeVar: [],
    pile: makePile(mulberry32(20261117)).map((p) => ({ ...p, wob: 0 })),
    clawX: HOME_X,
    vx: 0,
    ropeY: REST_Y,
    open: 0.4,
    sw: 0,
    swV: 0,
    held: null,
    target: null,
    stopY: REST_Y,
    total: 1,
    done: 0,
    wonThisTry: false,
    falls: [],
    parts: [],
    conf: [],
    texts: [],
    shake: 0,
    timer: AIM_TIME,
    lastTick: 99,
    keys: { l: false, r: false },
    btn: 0,
    dragX: null,
    popup: null,
    score: 0,
    newBest: false,
    flap: 0,
    whirr: 0,
    L: null,
  }
}

// ─── 색 ───
function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mix(a: string, b: string, t: number): string {
  const A = hexRgb(a)
  const B = hexRgb(b)
  const m = (i: number) => Math.round(A[i] + (B[i] - A[i]) * t)
  return `#${[m(0), m(1), m(2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
const BASE: Record<PlushKind, string[]> = {
  bear: ['#c98b5a', '#f0a3b5', '#e2c08f'],
  bunny: ['#f7f1f4', '#e3d3f5', '#ffd6e3'],
  chick: ['#ffd84a', '#ffe27a', '#ffcf3a'],
  cat: ['#f5a35c', '#b9bccb', '#f6e7d4'],
  penguin: ['#3d4f86', '#4f5c99', '#36457a'],
  star: ['#ffe066', '#9be8d0', '#ffb3cf'],
  gold: ['#f6c445', '#f6c445', '#f6c445'],
}
const INK = '#3a2a33'
const SHADE = '#2a2140'

const easeOutBack = (t: number) => {
  const c = 1.70158
  const x = t - 1
  return 1 + (c + 1) * x * x * x + c * x * x
}

// ─── 인형 그리기 (중심 0,0 · 반지름 R) ───
function drawPlush(ctx: CanvasRenderingContext2D, kind: PlushKind, variant: number, R: number, dark: number, blink: boolean) {
  const base = BASE[kind][variant % 3]
  const C = (hex: string) => (dark > 0 ? mix(hex, SHADE, dark) : hex)
  const lightC = C(mix(base, '#ffffff', 0.5))
  const deepC = C(mix(base, '#5a3a4a', 0.35))
  const bodyGrad = (r: number) => {
    const g = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.1, 0, 0, r * 1.05)
    g.addColorStop(0, lightC)
    g.addColorStop(0.55, C(base))
    g.addColorStop(1, deepC)
    return g
  }
  const ellipse = (x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, rot = 0) => {
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
  }
  const outline = () => {
    ctx.lineWidth = Math.max(1, R * 0.06)
    ctx.strokeStyle = C('#5a3a4a')
    ctx.globalAlpha *= 0.35
    ctx.stroke()
    ctx.globalAlpha /= 0.35
  }
  const pinkIn = C('#ff9fbf')
  const face = (eyeY = -0.04, spread = 0.32, size = 1) => {
    if (blink) {
      ctx.strokeStyle = C(INK)
      ctx.lineWidth = Math.max(1, R * 0.06)
      ctx.lineCap = 'round'
      for (const sx of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(sx * spread * R - R * 0.07, eyeY * R)
        ctx.lineTo(sx * spread * R + R * 0.07, eyeY * R)
        ctx.stroke()
      }
    } else {
      for (const sx of [-1, 1]) {
        ellipse(sx * spread * R, eyeY * R, R * 0.075 * size, R * 0.09 * size, C(INK))
        ellipse(sx * spread * R + R * 0.025, eyeY * R - R * 0.035, R * 0.028 * size, R * 0.028 * size, '#ffffff')
      }
    }
    ctx.globalAlpha *= 0.55
    for (const sx of [-1, 1]) ellipse(sx * (spread + 0.2) * R, (eyeY + 0.2) * R, R * 0.13, R * 0.075, C('#ff7aa8'))
    ctx.globalAlpha /= 0.55
  }
  const smile = (y: number, w = 0.09) => {
    ctx.strokeStyle = C(INK)
    ctx.lineWidth = Math.max(1, R * 0.05)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(-w * R, y * R, w * R, 0.1 * Math.PI, 0.9 * Math.PI)
    ctx.arc(w * R, y * R, w * R, 0.1 * Math.PI, 0.9 * Math.PI)
    ctx.stroke()
  }
  const body = (r = R) => {
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fillStyle = bodyGrad(r)
    ctx.fill()
    outline()
  }

  switch (kind) {
    case 'bear':
    case 'gold': {
      for (const sx of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(sx * R * 0.64, -R * 0.66, R * 0.31, 0, Math.PI * 2)
        ctx.fillStyle = bodyGrad(R * 0.6)
        ctx.fill()
        outline()
        ellipse(sx * R * 0.64, -R * 0.64, R * 0.16, R * 0.16, kind === 'gold' ? C('#ffe9a8') : pinkIn)
      }
      body()
      ellipse(0, R * 0.24, R * 0.36, R * 0.27, C('#fff3e6'))
      ellipse(0, R * 0.13, R * 0.1, R * 0.07, C(INK))
      smile(0.25, 0.07)
      face(-0.08, 0.34)
      if (kind === 'gold') {
        // 왕관
        ctx.save()
        ctx.translate(0, -R * 0.98)
        ctx.beginPath()
        ctx.moveTo(-R * 0.3, R * 0.12)
        ctx.lineTo(-R * 0.32, -R * 0.14)
        ctx.lineTo(-R * 0.15, 0)
        ctx.lineTo(0, -R * 0.2)
        ctx.lineTo(R * 0.15, 0)
        ctx.lineTo(R * 0.32, -R * 0.14)
        ctx.lineTo(R * 0.3, R * 0.12)
        ctx.closePath()
        ctx.fillStyle = C('#ffde59')
        ctx.fill()
        ctx.strokeStyle = C('#c48a12')
        ctx.lineWidth = Math.max(1, R * 0.05)
        ctx.stroke()
        ellipse(0, R * 0.02, R * 0.05, R * 0.05, C('#ff5c9a'))
        ctx.restore()
      }
      break
    }
    case 'bunny': {
      for (const sx of [-1, 1]) {
        const rot = sx * 0.16
        ctx.beginPath()
        ctx.ellipse(sx * R * 0.34, -R * 1.02, R * 0.21, R * 0.56, rot, 0, Math.PI * 2)
        ctx.fillStyle = bodyGrad(R * 0.9)
        ctx.fill()
        outline()
        ellipse(sx * R * 0.34, -R * 0.98, R * 0.1, R * 0.4, pinkIn, rot)
      }
      body()
      ellipse(0, R * 0.14, R * 0.07, R * 0.05, C('#ff7aa8'))
      smile(0.22, 0.07)
      face(-0.06, 0.33)
      break
    }
    case 'chick': {
      for (const sx of [-1, 1]) ellipse(sx * R * 0.93, R * 0.15, R * 0.18, R * 0.3, C('#f2b82c'), sx * -0.5)
      body()
      // 머리 깃털
      ctx.strokeStyle = C('#f2a81c')
      ctx.lineWidth = Math.max(1.5, R * 0.09)
      ctx.lineCap = 'round'
      for (const a of [-0.35, 0, 0.35]) {
        ctx.beginPath()
        ctx.moveTo(0, -R * 0.92)
        ctx.quadraticCurveTo(Math.sin(a) * R * 0.3, -R * 1.25, Math.sin(a) * R * 0.45, -R * 1.18)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(-R * 0.15, R * 0.1)
      ctx.lineTo(0, -R * 0.02)
      ctx.lineTo(R * 0.15, R * 0.1)
      ctx.lineTo(0, R * 0.26)
      ctx.closePath()
      ctx.fillStyle = C('#ff8a3d')
      ctx.fill()
      face(-0.14, 0.32)
      break
    }
    case 'cat': {
      for (const sx of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(sx * R * 0.25, -R * 0.82)
        ctx.quadraticCurveTo(sx * R * 0.72, -R * 1.4, sx * R * 0.9, -R * 0.42)
        ctx.closePath()
        ctx.fillStyle = bodyGrad(R * 0.9)
        ctx.fill()
        outline()
        ctx.beginPath()
        ctx.moveTo(sx * R * 0.38, -R * 0.78)
        ctx.quadraticCurveTo(sx * R * 0.7, -R * 1.18, sx * R * 0.78, -R * 0.55)
        ctx.closePath()
        ctx.fillStyle = pinkIn
        ctx.fill()
      }
      body()
      ctx.strokeStyle = C(mix(base, '#7a4a2a', 0.45))
      ctx.globalAlpha *= 0.55
      ctx.lineWidth = Math.max(1, R * 0.07)
      ctx.lineCap = 'round'
      for (const x of [-0.18, 0, 0.18]) {
        ctx.beginPath()
        ctx.moveTo(x * R, -R * 0.88)
        ctx.lineTo(x * R, -R * 0.62)
        ctx.stroke()
      }
      ctx.globalAlpha /= 0.55
      ctx.beginPath()
      ctx.moveTo(-R * 0.07, R * 0.1)
      ctx.lineTo(R * 0.07, R * 0.1)
      ctx.lineTo(0, R * 0.18)
      ctx.closePath()
      ctx.fillStyle = C('#ff7aa8')
      ctx.fill()
      smile(0.22, 0.07)
      ctx.strokeStyle = C(INK)
      ctx.globalAlpha *= 0.5
      ctx.lineWidth = Math.max(0.8, R * 0.03)
      for (const sx of [-1, 1])
        for (const dy of [-0.05, 0.07]) {
          ctx.beginPath()
          ctx.moveTo(sx * R * 0.45, R * (0.15 + dy * 0.5))
          ctx.lineTo(sx * R * 0.85, R * (0.12 + dy))
          ctx.stroke()
        }
      ctx.globalAlpha /= 0.5
      face(-0.08, 0.34)
      break
    }
    case 'penguin': {
      for (const sx of [-1, 1]) ellipse(sx * R * 0.92, R * 0.2, R * 0.17, R * 0.36, C(base), sx * -0.4)
      for (const sx of [-1, 1]) ellipse(sx * R * 0.32, R * 0.95, R * 0.2, R * 0.1, C('#ff9a3d'))
      body()
      ctx.beginPath()
      ctx.arc(-R * 0.26, -R * 0.06, R * 0.42, 0, Math.PI * 2)
      ctx.arc(R * 0.26, -R * 0.06, R * 0.42, 0, Math.PI * 2)
      ctx.ellipse(0, R * 0.32, R * 0.6, R * 0.52, 0, 0, Math.PI * 2)
      ctx.fillStyle = C('#fbf7ff')
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(-R * 0.12, R * 0.08)
      ctx.lineTo(R * 0.12, R * 0.08)
      ctx.lineTo(0, R * 0.24)
      ctx.closePath()
      ctx.fillStyle = C('#ff9a3d')
      ctx.fill()
      face(-0.08, 0.3)
      break
    }
    case 'star': {
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const rr = i % 2 === 0 ? R * 1.12 : R * 0.6
        ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * rr, Math.sin(a) * rr + R * 0.08)
      }
      ctx.closePath()
      ctx.lineJoin = 'round'
      ctx.lineWidth = R * 0.28
      ctx.strokeStyle = bodyGrad(R)
      ctx.fillStyle = bodyGrad(R)
      ctx.stroke()
      ctx.fill()
      ctx.lineJoin = 'miter'
      // 바느질 선
      ctx.setLineDash([R * 0.08, R * 0.08])
      ctx.lineWidth = Math.max(0.8, R * 0.035)
      ctx.strokeStyle = C('#ffffff')
      ctx.globalAlpha *= 0.6
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const rr = i % 2 === 0 ? R * 0.92 : R * 0.52
        ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * rr, Math.sin(a) * rr + R * 0.08)
      }
      ctx.closePath()
      ctx.stroke()
      ctx.globalAlpha /= 0.6
      ctx.setLineDash([])
      smile(0.24, 0.07)
      face(0.06, 0.26, 0.9)
      break
    }
  }
}

function star4(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.quadraticCurveTo(x, y, x, y + r)
  ctx.quadraticCurveTo(x, y, x - r, y)
  ctx.quadraticCurveTo(x, y, x, y - r)
  ctx.fill()
}

// ─── 인형 그림 미리 구워두기 (매 프레임 그리면 무겁다) ───
let DPR = 1
const sprites = new Map<string, HTMLCanvasElement>()
const SP_W = 2.7
const SP_H = 3
const SP_X = 1.35
const SP_Y = 1.65

/** 인형 하나를 (0,0) 중심에 그린다 — 미리 구운 그림 + 살아있는 반짝이 */
function drawPlushFast(ctx: CanvasRenderingContext2D, kind: PlushKind, variant: number, R: number, dark: number, time: number, seed: number) {
  if (R < 0.5) return
  const blink = (time * 0.9 + seed * 0.37) % 4 < 0.12
  // 크기는 1/4 옥타브 단위로 묶어서 굽고, 그릴 때 살짝 줄인다
  const Rq = Math.pow(2, Math.ceil(Math.log2(Math.max(4, R)) * 4) / 4)
  const dq = Math.round(dark * 20) / 20
  const key = `${kind}|${variant % 3}|${Rq.toFixed(2)}|${dq}|${blink ? 1 : 0}|${DPR}`
  let cv = sprites.get(key)
  if (!cv) {
    if (sprites.size > 240) sprites.clear()
    cv = document.createElement('canvas')
    cv.width = Math.ceil(Rq * SP_W * DPR)
    cv.height = Math.ceil(Rq * SP_H * DPR)
    const x = cv.getContext('2d')!
    x.setTransform(DPR, 0, 0, DPR, Rq * SP_X * DPR, Rq * SP_Y * DPR)
    drawPlush(x, kind, variant, Rq, dq, blink)
    sprites.set(key, cv)
  }
  const k = R / Rq
  ctx.drawImage(cv, -SP_X * R, -SP_Y * R, (cv.width / DPR) * k, (cv.height / DPR) * k)
  if (kind === 'gold') {
    const s = (Math.sin(time * 4 + seed) + 1) / 2
    ctx.fillStyle = `rgba(255,255,255,${(0.5 + s * 0.5) * (1 - dark)})`
    star4(ctx, R * 0.62, -R * 0.2, R * (0.12 + s * 0.1))
    star4(ctx, -R * 0.5, R * 0.45, R * (0.08 + (1 - s) * 0.08))
  }
}

/** 인형 아이콘 (화면 좌표) */
function plushIcon(ctx: CanvasRenderingContext2D, kind: PlushKind, variant: number, x: number, y: number, R: number, time: number, seed = 0, tilt = 0) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  drawPlushFast(ctx, kind, variant, R, 0, time, seed)
  ctx.restore()
}

// ─── 레이아웃 ───
function layout(w: number, h: number): Lay {
  const availW = w - 24
  const availH = h - CTRL_H - 14
  // 기계 비율 ≈ 너비 : 높이 = 1 : 1.6
  let cw = Math.min(availW, 540)
  let ch = cw * 1.62
  if (ch > availH) {
    ch = availH
    cw = ch / 1.62
  }
  const cx = (w - cw) / 2
  const cy = 8 + (availH - ch) / 2
  const mH = ch * 0.105
  const bodyH = ch * 0.165
  const bodyY = cy + ch - bodyH
  const f = Math.max(9, cw * 0.045)
  const gx = cx + f
  const gw = cw - 2 * f
  const gy = cy + mH + 4
  const gh = bodyY - gy
  const s = Math.min(gw, (gh - 6) / (FLOOR + 0.02))
  const ox = gx + (gw - s) / 2
  const oy = gy + gh - 4 - FLOOR * s
  const side = w - cw > 2 * 210 ? Math.min(250, (w - cw) / 2 - 44) : 0
  return { w, h, cx, cy, cw, ch, mH, bodyY, bodyH, f, gx, gy, gw, gh, s, ox, oy, side }
}

export default function ClawGame({ onResult, onClose }: GameProps) {
  const [g] = useState(newG)
  const [ui, setUi] = useState<'ready' | 'play' | 'result'>('ready')
  const [canAim, setCanAim] = useState(false)
  const [held, setHeld] = useState(0)
  const uiRef = useRef({ ui: 'ready', canAim: false })
  const cacheRef = useRef<{ key: string; cv: HTMLCanvasElement } | null>(null)
  const resultRef = useRef(onResult)
  useEffect(() => {
    resultRef.current = onResult
  }, [onResult])

  const U = (x: number) => g.L!.ox + x * g.L!.s
  const V = (y: number) => g.L!.oy + y * g.L!.s

  const say = (text: string, x: number, y: number, color = '#ff5c9a') => g.texts.push({ text, x, y, t: 0, color })
  const burst = (x: number, y: number, n: number, colors: string[], kind: Part['kind'] = 'spark', speed = 0.5) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const v = speed * (0.3 + Math.random())
      g.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, life: 0, max: 0.5 + Math.random() * 0.5, size: 0.012 + Math.random() * 0.012, color: colors[i % colors.length], kind, rot: a, vr: (Math.random() - 0.5) * 8 })
    }
  }
  const confetti = (n: number) => {
    const L = g.L
    if (!L) return
    const cols = ['#ff5c9a', '#7fdcc3', '#ffe066', '#b79cff', '#ffffff', '#ff9a3d']
    for (let i = 0; i < n; i++) {
      g.conf.push({ x: L.w / 2 + (Math.random() - 0.5) * 60, y: L.h * 0.42, vx: (Math.random() - 0.5) * 900, vy: -300 - Math.random() * 600, life: 0, max: 1.8 + Math.random(), size: 5 + Math.random() * 6, color: cols[i % cols.length], kind: 'conf', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14 })
    }
  }

  const beginTry = () => {
    g.coins -= 1
    g.timer = AIM_TIME
    g.lastTick = 99
    g.wonThisTry = false
    g.held = null
    g.target = null
    g.phase = 'aim'
    g.t = 0
    g.open = 0.4
    sfx.coin()
  }
  const startRound = useCallback(() => {
    g.coins = COINS
    g.prizes = []
    g.prizeVar = []
    g.score = 0
    g.newBest = false
    g.pile = makePile(mulberry32((Math.random() * 1e9) | 0)).map((p) => ({ ...p, wob: 0 }))
    g.falls = []
    g.popup = null
    g.clawX = HOME_X
    g.ropeY = REST_Y
    g.vx = 0
    beginTry()
  }, [g])
  const drop = useCallback(() => {
    if (g.phase !== 'aim') return
    g.phase = 'down'
    g.t = 0
    g.vx = 0
    g.target = pickTarget(g.pile, g.clawX, REACH)
    g.stopY = Math.max(REST_Y, g.target ? g.target.y - g.target.r - 0.035 : FLOOR - 0.11)
    sfx.click()
  }, [g])
  const finish = () => {
    g.phase = 'result'
    g.t = 0
    g.score = prizeScore(g.prizes)
    g.newBest = saveScore('claw', g.score)
    resultRef.current({ score: g.score, line: resultLine(g.prizes) })
    if (g.prizes.length) {
      confetti(60)
      sfx.win()
    } else sfx.lose()
  }
  const endTry = () => {
    if (g.coins > 0) beginTry()
    else finish()
  }
  const tapAnywhere = useCallback(() => {
    if (g.phase === 'ready') startRound()
    else if (g.popup && g.popup.t > 0.6) g.popup = null
  }, [g, startRound])

  // 키보드
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') g.keys.l = true
      else if (e.key === 'ArrowRight' || e.key === 'd') g.keys.r = true
      else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') {
        if (g.phase === 'aim') drop()
        else if (g.phase === 'result' && g.t > 0.8) startRound()
        else tapAnywhere()
      } else return
      e.preventDefault()
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') g.keys.l = false
      else if (e.key === 'ArrowRight' || e.key === 'd') g.keys.r = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [g, drop, startRound, tapAnywhere])

  // ─── 갱신 ───
  const update = (dt: number) => {
    g.time += dt
    g.t += dt
    g.shake = Math.max(0, g.shake - dt * 30)
    g.flap = Math.max(0, g.flap - dt * 1.6)
    for (const p of g.pile) p.wob = Math.max(0, p.wob - dt * 1.5)

    const prevVx = g.vx
    switch (g.phase) {
      case 'ready':
        g.clawX = 0.5 + Math.sin(g.time * 0.6) * 0.3
        g.vx = 0.18 * Math.cos(g.time * 0.6)
        break
      case 'aim': {
        g.timer -= dt
        const sec = Math.ceil(g.timer)
        if (sec <= 3 && sec !== g.lastTick && sec > 0) {
          g.lastTick = sec
          tone(880, 0.06, { wave: 'square', vol: 0.07 })
        }
        let dir = (g.keys.r || g.btn === 1 ? 1 : 0) - (g.keys.l || g.btn === -1 ? 1 : 0)
        let max = MOVE_SPEED
        if (g.dragX !== null && dir === 0) {
          const d = g.dragX - g.clawX
          dir = Math.sign(d)
          max = Math.min(MOVE_SPEED * 1.2, Math.abs(d) * 8)
        }
        const want = dir * max
        g.vx += (want - g.vx) * Math.min(1, dt * 9)
        g.clawX += g.vx * dt
        if (g.clawX < X_MIN || g.clawX > X_MAX) {
          g.clawX = Math.max(X_MIN, Math.min(X_MAX, g.clawX))
          g.vx = 0
        }
        if (Math.abs(g.vx) > 0.05) {
          g.whirr -= dt
          if (g.whirr <= 0) {
            g.whirr = 0.075
            tone(110 + Math.abs(g.vx) * 120, 0.07, { wave: 'sawtooth', vol: 0.035 })
          }
        }
        if (g.timer <= 0) {
          say('시간 끝!', g.clawX, REST_Y + 0.12, '#ffb020')
          drop()
        }
        break
      }
      case 'down': {
        g.open = Math.min(1, g.open + dt * 3)
        g.ropeY += 0.5 * dt
        g.whirr -= dt
        if (g.whirr <= 0) {
          g.whirr = 0.08
          sfx.rise(1 - (g.ropeY - REST_Y) / (FLOOR - REST_Y))
        }
        if (g.ropeY >= g.stopY) {
          g.ropeY = g.stopY
          g.phase = 'close'
          g.t = 0
          const tg = g.target
          tone(200, 0.09, { wave: 'square', vol: 0.1 })
          noise(0.08, { vol: 0.18, lowpass: 1600, delay: 0.25 })
          if (tg) {
            const off = tg.x - g.clawX
            const res = rollGrab(off, REACH + tg.r * 0.6, PLUSH_INFO[tg.kind].weight, Math.random)
            const k = Math.abs(off) / (REACH + tg.r * 0.6)
            if (res.grabbed) {
              g.pile = g.pile.filter((p) => p !== tg)
              g.held = { p: tg, hang: tg.y - g.ropeY, slipAt: res.slipAt }
              say(k < 0.25 ? '정중앙!' : k < 0.55 ? '잡았다!' : '아슬아슬…', g.clawX, g.ropeY - 0.05, k < 0.25 ? '#ff5c9a' : '#8a5cff')
            } else {
              tg.wob = 1
            }
          }
        }
        break
      }
      case 'close': {
        g.open = Math.max(g.held ? 0.22 : 0, g.open - dt * 2.6)
        if (g.held) {
          const p = g.held.p
          p.x += (g.clawX - p.x) * Math.min(1, dt * 5)
          p.tilt *= 1 - Math.min(1, dt * 3)
        }
        if (g.t > 0.55) {
          g.phase = 'up'
          g.t = 0
          g.total = g.ropeY - REST_Y + Math.abs(g.clawX - HOME_X)
          g.done = 0
          if (!g.held && g.target) say('헛손질…', g.clawX, g.ropeY - 0.05, '#7a6a99')
        }
        break
      }
      case 'up': {
        const dy = Math.min(g.ropeY - REST_Y, 0.4 * dt)
        g.ropeY -= dy
        g.done += dy
        g.whirr -= dt
        if (g.whirr <= 0) {
          g.whirr = 0.09
          sfx.rise((g.ropeY - REST_Y) / (FLOOR - REST_Y))
        }
        if (g.ropeY <= REST_Y + 1e-4) {
          g.phase = 'carry'
          g.t = 0
        }
        break
      }
      case 'carry': {
        const d = HOME_X - g.clawX
        const step = Math.sign(d) * Math.min(Math.abs(d), 0.36 * dt)
        g.clawX += step
        g.vx = step / Math.max(dt, 1e-4)
        g.done += Math.abs(step)
        g.whirr -= dt
        if (g.whirr <= 0) {
          g.whirr = 0.075
          tone(120, 0.07, { wave: 'sawtooth', vol: 0.035 })
        }
        if (Math.abs(d) < 1e-4) {
          g.vx = 0
          g.phase = 'open'
          g.t = 0
          tone(300, 0.08, { wave: 'triangle', vol: 0.1 })
        }
        break
      }
      case 'open': {
        g.open = Math.min(1, g.open + dt * 2.5)
        if (g.held && g.open > 0.5) release(false)
        if (g.t > 0.5) {
          g.phase = 'settle'
          g.t = 0
        }
        break
      }
      case 'settle': {
        g.open += (0.4 - g.open) * Math.min(1, dt * 4)
        if (g.falls.length === 0 && !g.popup && g.t > 0.35) {
          if (!g.wonThisTry) {
            g.phase = 'miss'
            g.t = 0
            say(g.coins > 0 ? '아깝다!' : '마지막도 아깝다!', 0.6, 0.45, '#7a6a99')
            sfx.lose()
          } else endTry()
        }
        break
      }
      case 'miss':
        if (g.t > 1.1) endTry()
        break
      case 'result':
        break
    }
    // 놓치기
    if (g.held && g.held.slipAt !== null && (g.phase === 'up' || g.phase === 'carry') && g.done / Math.max(1e-3, g.total) >= g.held.slipAt) {
      release(true)
    }

    // 흔들림 (집게 + 매달린 인형)
    const acc = (g.vx - prevVx) / Math.max(dt, 1e-4)
    g.swV += (-g.sw * 28 - g.swV * 2.2 - acc * 0.9) * dt
    g.sw += g.swV * dt
    g.sw = Math.max(-0.5, Math.min(0.5, g.sw))

    if (g.held) {
      const p = g.held.p
      if (g.phase !== 'close') {
        p.x = g.clawX + Math.sin(g.sw) * (g.ropeY - 0.02) * 0.6
        p.tilt = -g.sw * 0.8
      }
      p.y = g.ropeY + g.held.hang
    }

    // 떨어지는 인형
    for (const f of g.falls) {
      const p = f.p
      f.vy += 3.4 * dt
      p.y += f.vy * dt
      p.tilt += f.vr * dt
      if (f.chute) {
        if (p.y - p.r > FLOOR + 0.03) {
          f.p = p
          g.falls = g.falls.filter((x) => x !== f)
          g.prizes.push(p.kind)
          g.prizeVar.push(p.id)
          g.wonThisTry = true
          g.flap = 1
          g.shake = 5
          noise(0.15, { vol: 0.35, lowpass: 700 })
          g.popup = { kind: p.kind, variant: p.id, t: 0 }
          confetti(p.kind === 'gold' ? 110 : 70)
          sfx.win()
          if (p.kind === 'gold') [1319, 1568, 2093].forEach((hz, i) => tone(hz, 0.2, { wave: 'triangle', vol: 0.08, delay: 0.4 + i * 0.08 }))
        }
      } else {
        const ry = restY(p.x, p.r, g.pile)
        if (p.y >= ry) {
          p.y = ry
          if (!f.bounced && f.vy > 0.6) {
            f.bounced = true
            f.vy = -f.vy * 0.28
            f.vr *= -0.5
            g.shake = 7
            noise(0.14, { vol: 0.3, lowpass: 650 })
            burst(p.x, p.y + p.r, 8, ['#ffffff', '#ffe1ef'], 'dust', 0.35)
          } else {
            p.tilt = Math.max(-0.4, Math.min(0.4, p.tilt))
            p.wob = 1
            p.depth = 0.6
            g.pile.push(p)
            g.falls = g.falls.filter((x) => x !== f)
          }
        }
      }
    }

    // 파티클
    for (const q of g.parts) {
      q.life += dt
      q.vy += (q.kind === 'dust' ? 0.3 : 0.9) * dt
      q.x += q.vx * dt
      q.y += q.vy * dt
      q.vx *= 1 - dt * 2
      q.rot += q.vr * dt
    }
    g.parts = g.parts.filter((q) => q.life < q.max)
    for (const q of g.conf) {
      q.life += dt
      q.vy += 900 * dt
      q.vx *= 1 - dt * 1.6
      q.vy *= 1 - dt * 1.2
      q.x += q.vx * dt
      q.y += q.vy * dt
      q.rot += q.vr * dt
    }
    g.conf = g.conf.filter((q) => q.life < q.max)
    for (const t of g.texts) t.t += dt
    g.texts = g.texts.filter((t) => t.t < 1.3)
    if (g.popup) {
      g.popup.t += dt
      if (g.popup.t > 2.6) g.popup = null
    }
  }

  function release(slip: boolean) {
    if (!g.held) return
    const p = g.held.p
    g.held = null
    let chute = p.x < CHUTE_EDGE - 0.02
    if (!chute && p.x - p.r < CHUTE_EDGE + 0.01) {
      // 칸막이에 걸치면 굴러서 더미 쪽으로
      if (p.x < CHUTE_EDGE + 0.01) chute = true
      else p.x = CHUTE_EDGE + p.r + 0.012
    }
    g.falls.push({ p, vy: slip ? 0.1 : 0, vr: (Math.random() - 0.5) * 3, chute, bounced: false })
    if (slip) {
      g.shake = 4
      say(chute ? '어? 들어간다!' : '앗, 놓쳤다!', g.clawX, g.ropeY + 0.02, chute ? '#ff5c9a' : '#ff7a3d')
      tone(520, 0.25, { wave: 'triangle', vol: 0.1, to: 180 })
    } else noise(0.1, { vol: 0.15, lowpass: 2000 })
  }

  // ─── 그리기 ───
  const draw = (ctx: CanvasRenderingContext2D, dt: number, w: number, h: number) => {
    const L = layout(w, h)
    g.L = L
    DPR = Math.min(2, window.devicePixelRatio || 1)
    update(dt)
    const want = g.phase === 'ready' ? 'ready' : g.phase === 'result' ? 'result' : 'play'
    const aimNow = g.phase === 'aim'
    if (uiRef.current.ui !== want) {
      uiRef.current.ui = want
      setUi(want)
    }
    if (uiRef.current.canAim !== aimNow) {
      uiRef.current.canAim = aimNow
      setCanAim(aimNow)
      if (!aimNow) {
        g.btn = 0
        setHeld(0)
      }
    }

    const bg = staticLayer(ctx, L)
    ctx.fillStyle = '#17132a'
    ctx.fillRect(0, 0, w, h)
    ctx.save()
    if (g.shake > 0) ctx.translate((Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake)
    ctx.drawImage(bg, 0, 0, w, h)
    drawCabinet(ctx, L)
    ctx.restore()
    if (L.side > 0) drawSides(ctx, L)
    // 색종이
    for (const q of g.conf) {
      ctx.save()
      ctx.translate(q.x, q.y)
      ctx.rotate(q.rot)
      ctx.globalAlpha = Math.min(1, (q.max - q.life) * 2)
      ctx.fillStyle = q.color
      ctx.fillRect(-q.size / 2, -q.size * 0.3, q.size, q.size * 0.6 * Math.abs(Math.cos(q.rot * 1.7)) + 1)
      ctx.restore()
    }
    if (g.popup) drawPopup(ctx, L)
    if (g.phase === 'ready') drawReady(ctx, L)
    if (g.phase === 'result') drawResult(ctx, L)
  }

  /** 크기가 바뀔 때만 다시 그리는 정적 배경 (오락실 벽 · 기계 몸통 · 유리 안) */
  function staticLayer(ctx: CanvasRenderingContext2D, L: Lay): HTMLCanvasElement {
    const dpr = ctx.getTransform().a || 1
    const key = `${L.w}x${L.h}@${dpr}`
    const c = cacheRef.current
    if (c && c.key === key) return c.cv
    const cv = c?.cv ?? document.createElement('canvas')
    cv.width = Math.round(L.w * dpr)
    cv.height = Math.round(L.h * dpr)
    const x = cv.getContext('2d')!
    x.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawBackdrop(x, L)
    cacheRef.current = { key, cv }
    return cv
  }

  function drawBackdrop(ctx: CanvasRenderingContext2D, L: Lay) {
    const { w, h } = L
    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#231a3d')
    bg.addColorStop(0.7, '#17132a')
    bg.addColorStop(1, '#100d1c')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    // 벽 네온 줄
    ctx.save()
    ctx.lineCap = 'round'
    const neon = (y: number, color: string, ph: number) => {
      const k = 0.65 + 0.35 * Math.sin(g.time * 2 + ph)
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.25 * k
      ctx.lineWidth = 10
      ctx.beginPath()
      ctx.moveTo(-10, y)
      ctx.lineTo(w + 10, y)
      ctx.stroke()
      ctx.globalAlpha = 0.85 * k
      ctx.lineWidth = 2.5
      ctx.stroke()
    }
    neon(h * 0.06, '#ff5c9a', 0)
    neon(h * 0.06 + 12, '#5ce0ff', 1.3)
    ctx.restore()
    // 동글동글 불빛
    for (let i = 0; i < 14; i++) {
      const x = ((i * 137.5) % 100) / 100
      const y = 0.14 + (((i * 61.8) % 100) / 100) * 0.55
      const r = 18 + ((i * 7) % 5) * 9
      const k = 0.5 + 0.5 * Math.sin(g.time * 0.8 + i)
      const gr = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r)
      const c = ['255,92,154', '92,224,255', '255,224,102', '183,156,255'][i % 4]
      gr.addColorStop(0, `rgba(${c},${0.18 * k})`)
      gr.addColorStop(1, `rgba(${c},0)`)
      ctx.fillStyle = gr
      ctx.fillRect(x * w - r, y * h - r, r * 2, r * 2)
    }
    // 바닥 (체크무늬)
    const fy = L.cy + L.ch - 6
    const fl = ctx.createLinearGradient(0, fy, 0, h)
    fl.addColorStop(0, '#2b2148')
    fl.addColorStop(1, '#151122')
    ctx.fillStyle = fl
    ctx.fillRect(0, fy, w, h - fy)
    ctx.save()
    ctx.globalAlpha = 0.12
    ctx.fillStyle = '#b79cff'
    const tile = 26
    for (let yy = 0; yy < (h - fy) / tile + 1; yy++)
      for (let xx = 0; xx < w / tile + 1; xx++) if ((xx + yy) % 2 === 0) ctx.fillRect(xx * tile, fy + yy * tile, tile, tile)
    ctx.restore()
    drawCabinetStatic(ctx, L)
  }

  /** 움직이지 않는 기계 몸통 · 유리 안 배경 */
  function drawCabinetStatic(ctx: CanvasRenderingContext2D, L: Lay) {
    const { cx, cy, cw, ch, mH, gx, gy, gw, gh, s } = L
    // 그림자
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.beginPath()
    ctx.ellipse(cx + cw / 2, cy + ch + 2, cw * 0.56, 12, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // 몸통 (분홍 기둥)
    const frame = ctx.createLinearGradient(cx, 0, cx + cw, 0)
    frame.addColorStop(0, '#e9508e')
    frame.addColorStop(0.08, '#ff8fbc')
    frame.addColorStop(0.5, '#ffa3c8')
    frame.addColorStop(0.92, '#ff8fbc')
    frame.addColorStop(1, '#d9437f')
    ctx.fillStyle = frame
    ctx.beginPath()
    ctx.roundRect(cx, cy + mH * 0.4, cw, ch - mH * 0.4, [10, 10, 16, 16])
    ctx.fill()
    drawMarquee(ctx, L, true)

    // 유리 안
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(gx, gy, gw, gh, 8)
    ctx.clip()
    const ib = ctx.createLinearGradient(0, gy, 0, gy + gh)
    ib.addColorStop(0, '#fff6fb')
    ib.addColorStop(0.6, '#ffe4f0')
    ib.addColorStop(1, '#f6d2ea')
    ctx.fillStyle = ib
    ctx.fillRect(gx, gy, gw, gh)
    // 뒷벽 하트 무늬
    ctx.fillStyle = 'rgba(255,143,188,0.16)'
    const step = Math.max(22, s * 0.11)
    for (let yy = 0; yy * step < gh; yy++)
      for (let xx = 0; xx * step < gw + step; xx++) {
        const px = gx + xx * step + (yy % 2) * step * 0.5
        const py = gy + yy * step + step * 0.5
        heart(ctx, px, py, step * 0.13)
      }
    // 바닥 판
    const fb = V(FLOOR - 0.17)
    const flr = ctx.createLinearGradient(0, fb, 0, V(FLOOR))
    flr.addColorStop(0, '#c9eadf')
    flr.addColorStop(1, '#9fd9c6')
    ctx.fillStyle = flr
    ctx.fillRect(gx, fb, gw, gy + gh - fb)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillRect(gx, fb, gw, 2)
    // 위 조명
    const led = ctx.createLinearGradient(0, gy, 0, gy + s * 0.2)
    led.addColorStop(0, 'rgba(255,252,224,0.9)')
    led.addColorStop(1, 'rgba(255,252,224,0)')
    ctx.fillStyle = led
    ctx.fillRect(gx, gy, gw, s * 0.2)

    // 상품 구멍 (왼쪽 앞)
    const hx0 = U(0.015)
    const hx1 = U(CHUTE_EDGE - 0.012)
    const hole = ctx.createLinearGradient(0, fb, 0, V(FLOOR))
    hole.addColorStop(0, '#3b2752')
    hole.addColorStop(1, '#1b1028')
    ctx.fillStyle = hole
    ctx.beginPath()
    ctx.roundRect(hx0, fb + 3, hx1 - hx0, V(FLOOR) - fb + 10, 6)
    ctx.fill()
    ctx.fillStyle = '#ff8fbc'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fitText(ctx, '상품', (hx0 + hx1) / 2, fb + 3 + (V(FLOOR) - fb) * 0.28, hx1 - hx0 - 8, Math.max(10, s * 0.04))
    ctx.restore()
  }

  function drawCabinet(ctx: CanvasRenderingContext2D, L: Lay) {
    const { cx, cw, bodyY, bodyH, f, gx, gy, gw, gh, s } = L
    const fb = V(FLOOR - 0.17)
    const hx0 = U(0.015)
    const hx1 = U(CHUTE_EDGE - 0.012)
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(gx, gy, gw, gh, 8)
    ctx.clip()
    // 구멍 안 화살표
    ctx.fillStyle = `rgba(255,224,102,${0.35 + 0.35 * Math.sin(g.time * 5)})`
    const ax = (hx0 + hx1) / 2
    const ay = (fb + V(FLOOR)) / 2
    const as = s * 0.035
    ctx.beginPath()
    ctx.moveTo(ax - as, ay - as * 0.4)
    ctx.lineTo(ax + as, ay - as * 0.4)
    ctx.lineTo(ax, ay + as * 0.8)
    ctx.closePath()
    ctx.fill()

    // 인형 더미 (뒤→앞)
    const sorted = [...g.pile].sort((a, b) => a.depth - b.depth || a.y - b.y)
    for (const p of sorted) {
      if (p.y + p.r > FLOOR - 0.03) {
        ctx.fillStyle = 'rgba(60,40,80,0.18)'
        ctx.beginPath()
        ctx.ellipse(U(p.x), V(Math.min(FLOOR, p.y + p.r)), p.r * s * 0.85, p.r * s * 0.2, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      drawP(ctx, p, 0)
    }

    // 조준 불빛
    if (g.phase === 'aim' || g.phase === 'ready') {
      const tx = U(g.clawX)
      const beam = ctx.createLinearGradient(0, V(REST_Y), 0, V(FLOOR))
      beam.addColorStop(0, 'rgba(255,255,220,0.0)')
      beam.addColorStop(1, 'rgba(255,255,220,0.22)')
      ctx.fillStyle = beam
      ctx.beginPath()
      ctx.moveTo(tx - REACH * s * 0.4, V(REST_Y + 0.08))
      ctx.lineTo(tx + REACH * s * 0.4, V(REST_Y + 0.08))
      ctx.lineTo(tx + REACH * s * 1.1, V(FLOOR))
      ctx.lineTo(tx - REACH * s * 1.1, V(FLOOR))
      ctx.closePath()
      ctx.fill()
      if (g.phase === 'aim') {
        const tg = pickTarget(g.pile, g.clawX, REACH)
        if (tg) {
          ctx.strokeStyle = `rgba(255,92,154,${0.45 + 0.3 * Math.sin(g.time * 8)})`
          ctx.lineWidth = 2
          ctx.setLineDash([4, 4])
          ctx.beginPath()
          ctx.ellipse(U(tg.x), V(tg.y - tg.r - 0.01), tg.r * s * 0.55, tg.r * s * 0.16, 0, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
        }
      }
    }

    // 떨어지는 인형 (상품 구멍으로 들어가는 건 바닥에서 잘림)
    for (const fl of g.falls) {
      ctx.save()
      if (fl.chute) {
        ctx.beginPath()
        ctx.rect(gx, gy, U(CHUTE_EDGE) - gx, V(FLOOR) - gy - 2)
        ctx.clip()
      }
      drawP(ctx, fl.p, 0)
      ctx.restore()
    }

    // 레일
    const railY = V(0.02)
    const rail = ctx.createLinearGradient(0, railY - 5, 0, railY + 5)
    rail.addColorStop(0, '#f4f2fa')
    rail.addColorStop(0.5, '#a9a3bf')
    rail.addColorStop(1, '#6e6788')
    ctx.fillStyle = rail
    ctx.fillRect(gx, railY - 4, gw, 8)

    drawClaw(ctx, L)

    // 칸막이 (투명 아크릴)
    const dvx = U(CHUTE_EDGE)
    const dvTop = V(FLOOR - 0.3)
    ctx.fillStyle = 'rgba(200,240,255,0.35)'
    ctx.fillRect(dvx - 4, dvTop, 8, V(FLOOR) - dvTop + 6)
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.fillRect(dvx - 3, dvTop, 2, V(FLOOR) - dvTop)
    ctx.fillStyle = 'rgba(200,240,255,0.18)'
    ctx.fillRect(gx, dvTop, dvx - gx, 3)

    // 떠오르는 글씨
    for (const t of g.texts) {
      const k = t.t / 1.3
      const sc = t.t < 0.2 ? easeOutBack(t.t / 0.2) : 1
      ctx.save()
      ctx.translate(U(t.x), V(t.y) - k * s * 0.08)
      ctx.scale(sc, sc)
      ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `700 ${Math.max(13, s * 0.07)}px ${GAME_FONT}`
      ctx.lineWidth = 5
      ctx.strokeStyle = '#ffffff'
      ctx.lineJoin = 'round'
      const tw = Math.min(ctx.measureText(t.text).width, gw - 20)
      const xShift = Math.max(gx + 10 + tw / 2 - U(t.x), Math.min(0, gx + gw - 10 - tw / 2 - U(t.x)))
      ctx.strokeText(t.text, xShift, 0, gw - 20)
      ctx.fillStyle = t.color
      ctx.fillText(t.text, xShift, 0, gw - 20)
      ctx.restore()
    }
    // 파티클
    for (const q of g.parts) {
      ctx.globalAlpha = 1 - q.life / q.max
      ctx.fillStyle = q.color
      if (q.kind === 'spark') star4(ctx, U(q.x), V(q.y), q.size * s * 1.4)
      else {
        ctx.beginPath()
        ctx.arc(U(q.x), V(q.y), q.size * s * (1 + q.life), 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1

    // 유리 반사
    ctx.fillStyle = 'rgba(255,255,255,0.13)'
    ctx.beginPath()
    ctx.moveTo(gx + gw * 0.55, gy)
    ctx.lineTo(gx + gw * 0.75, gy)
    ctx.lineTo(gx + gw * 0.35, gy + gh)
    ctx.lineTo(gx + gw * 0.15, gy + gh)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.09)'
    ctx.beginPath()
    ctx.moveTo(gx + gw * 0.82, gy)
    ctx.lineTo(gx + gw * 0.87, gy)
    ctx.lineTo(gx + gw * 0.47, gy + gh)
    ctx.lineTo(gx + gw * 0.42, gy + gh)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // 유리 테두리 (민트)
    ctx.strokeStyle = '#8fe3cc'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.roundRect(gx - 2, gy - 2, gw + 4, gh + 4, 10)
    ctx.stroke()

    drawMarquee(ctx, L, false)
    drawBody(ctx, cx, bodyY, cw, bodyH, f)
  }

  function drawP(ctx: CanvasRenderingContext2D, p: P, extraDark: number) {
    const s = g.L!.s
    const wob = p.wob > 0 ? Math.sin(p.wob * 18) * p.wob : 0
    ctx.save()
    ctx.translate(U(p.x), V(p.y + p.r))
    ctx.rotate(p.tilt + wob * 0.15)
    ctx.scale(1 + wob * 0.08, 1 - wob * 0.08)
    ctx.translate(0, -p.r * s)
    const dark = Math.min(0.6, (p.depth === 0 ? 0.28 : p.depth < 1 ? 0.1 : 0) + extraDark)
    drawPlushFast(ctx, p.kind, p.id, p.r * s, dark, g.time, p.id)
    ctx.restore()
  }

  function drawClaw(ctx: CanvasRenderingContext2D, L: Lay) {
    const { s } = L
    const cxp = U(g.clawX)
    const railY = V(0.02)
    const len = (g.ropeY - 0.02) * s
    const hx = cxp + Math.sin(g.sw) * len
    const hy = railY + Math.cos(g.sw) * len
    // 캐리지
    const cw = s * 0.12
    const car = ctx.createLinearGradient(0, railY - 10, 0, railY + 14)
    car.addColorStop(0, '#ff9cc2')
    car.addColorStop(1, '#e64284')
    ctx.fillStyle = car
    ctx.beginPath()
    ctx.roundRect(cxp - cw / 2, railY - s * 0.03, cw, s * 0.06, 6)
    ctx.fill()
    ctx.fillStyle = '#ffe066'
    ctx.beginPath()
    ctx.arc(cxp, railY, s * 0.012, 0, Math.PI * 2)
    ctx.fill()
    // 줄
    ctx.strokeStyle = '#5b5470'
    ctx.lineWidth = Math.max(1.5, s * 0.008)
    ctx.beginPath()
    ctx.moveTo(cxp, railY + s * 0.02)
    ctx.lineTo(hx, hy - s * 0.02)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.save()
    ctx.translate(hx, hy)
    ctx.rotate(-g.sw)
    const prong = (side: number, back: boolean) => {
      const a = side * (0.1 + g.open * 0.62)
      const L1 = s * 0.065
      const L2 = s * 0.055
      const px = side * s * 0.028
      const py = s * 0.022
      const x1 = px + Math.sin(a) * L1
      const y1 = py + Math.cos(a) * L1
      const a2 = a - side * 0.75
      const x2 = x1 + Math.sin(a2) * L2
      const y2 = y1 + Math.cos(a2) * L2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = back ? '#6f6888' : '#4a4360'
      ctx.lineWidth = s * 0.022
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.strokeStyle = back ? '#b4aec8' : '#e9e6f3'
      ctx.lineWidth = s * 0.012
      ctx.stroke()
      ctx.fillStyle = back ? '#c9a63a' : '#ffd84a'
      ctx.beginPath()
      ctx.arc(x2, y2, s * 0.012, 0, Math.PI * 2)
      ctx.fill()
    }
    // 뒤 발
    ctx.save()
    ctx.scale(0.55, 1)
    prong(1, true)
    ctx.restore()
    ctx.restore()

    // 매달린 인형 (발 사이)
    if (g.held) drawP(ctx, g.held.p, 0)

    ctx.save()
    ctx.translate(hx, hy)
    ctx.rotate(-g.sw)
    prong(-1, false)
    prong(1, false)
    // 머리
    const hub = ctx.createLinearGradient(0, -s * 0.03, 0, s * 0.03)
    hub.addColorStop(0, '#fff3b0')
    hub.addColorStop(0.5, '#ffd84a')
    hub.addColorStop(1, '#d9a21a')
    ctx.fillStyle = hub
    ctx.beginPath()
    ctx.roundRect(-s * 0.05, -s * 0.03, s * 0.1, s * 0.055, s * 0.02)
    ctx.fill()
    ctx.fillStyle = '#ff5c9a'
    ctx.beginPath()
    ctx.arc(0, -s * 0.003, s * 0.011, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  function drawMarquee(ctx: CanvasRenderingContext2D, L: Lay, still: boolean) {
    const { cx, cy, cw, mH } = L
    const x = cx - cw * 0.02
    const w = cw * 1.04
    const label = () => fitText(ctx, '★ 집게왕 ★', cx + cw / 2, cy + mH * 0.47, w - 60, Math.min(34, mH * 0.5))
    if (!still) {
      drawBulbs(ctx)
      // 글씨 반짝임
      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.globalAlpha = 0.45 * Math.max(0, Math.sin(g.time * 3))
      ctx.fillStyle = '#ffffff'
      label()
      ctx.restore()
      return
    }
    // 빛 번짐
    ctx.save()
    ctx.shadowColor = 'rgba(255,92,154,0.7)'
    ctx.shadowBlur = 24
    const mg = ctx.createLinearGradient(0, cy, 0, cy + mH)
    mg.addColorStop(0, '#ff7fb0')
    mg.addColorStop(1, '#e33f80')
    ctx.fillStyle = mg
    ctx.beginPath()
    ctx.roundRect(x, cy, w, mH, [mH * 0.5, mH * 0.5, 10, 10])
    ctx.fill()
    ctx.restore()
    // 안쪽 판
    const ip = 6
    ctx.fillStyle = '#3a1d4f'
    ctx.beginPath()
    ctx.roundRect(x + ip + 6, cy + ip, w - 2 * ip - 12, mH - 2 * ip, [mH * 0.4, mH * 0.4, 6, 6])
    ctx.fill()
    // 글씨 (빛 번짐은 정적 층에서 한 번만)
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(255,240,140,0.9)'
    ctx.shadowBlur = 16
    ctx.fillStyle = '#fff3a6'
    label()
    ctx.restore()
  }

  function drawBulbs(ctx: CanvasRenderingContext2D) {
    const { cx, cy, cw, mH } = g.L!
    const x = cx - cw * 0.02
    const w = cw * 1.04
    const n = Math.max(8, Math.floor(w / 22))
    for (let i = 0; i < n; i++) {
      const bx = x + 12 + ((w - 24) * i) / (n - 1)
      const on = (Math.floor(g.time * 6) + i) % 3 !== 0
      if (on) {
        ctx.fillStyle = 'rgba(255,243,166,0.35)'
        ctx.beginPath()
        ctx.arc(bx, cy + mH - 3.5, 5.5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = on ? '#fff6b8' : '#b5527e'
      ctx.beginPath()
      ctx.arc(bx, cy + mH - 3.5, 2.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function drawBody(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: number) {
    const bg = ctx.createLinearGradient(0, y, 0, y + h)
    bg.addColorStop(0, '#9fe8d4')
    bg.addColorStop(1, '#66c7ad')
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.roundRect(x + f * 0.4, y + 4, w - f * 0.8, h - 8, 12)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillRect(x + f * 0.4 + 10, y + 6, w - f * 0.8 - 20, 2)

    const pad = Math.max(8, w * 0.03)
    const ix = x + f * 0.4 + pad
    const iw = w - f * 0.8 - pad * 2
    const iy = y + 4 + pad * 0.8
    const ih = h - 8 - pad * 1.6
    // 상품 꺼내는 문
    const dw = iw * 0.27
    ctx.fillStyle = '#2a1c3c'
    ctx.beginPath()
    ctx.roundRect(ix, iy, dw, ih, 8)
    ctx.fill()
    ctx.save()
    const flapA = Math.sin(g.flap * Math.PI * 3) * g.flap * 0.6
    ctx.translate(ix + dw / 2, iy + 3)
    ctx.scale(1, Math.cos(flapA))
    const fg = ctx.createLinearGradient(0, 0, 0, ih)
    fg.addColorStop(0, 'rgba(200,240,255,0.55)')
    fg.addColorStop(1, 'rgba(160,200,230,0.35)')
    ctx.fillStyle = fg
    ctx.beginPath()
    ctx.roundRect(-dw / 2 + 3, 0, dw - 6, ih - 6, 6)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fitText(ctx, 'PUSH', 0, (ih - 6) / 2, dw - 12, Math.min(14, ih * 0.3))
    ctx.restore()

    // 동전 · 점수
    const mx = ix + dw + pad
    const tw = iw * 0.27
    const mw = iw - dw - tw - pad * 2
    ctx.fillStyle = 'rgba(40,90,80,0.22)'
    ctx.beginPath()
    ctx.roundRect(mx, iy, mw, ih, 8)
    ctx.fill()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#1f4d43'
    const fs = Math.min(15, ih * 0.27)
    const used = g.phase === 'ready' ? 0 : COINS - g.coins
    fitText(ctx, '동전', mx + 8, iy + ih * 0.3, mw * 0.36, fs)
    const cr = Math.min(ih * 0.15, mw * 0.08)
    for (let i = 0; i < COINS; i++) {
      const ccx = mx + mw * 0.44 + i * cr * 2.5 + cr
      const ccy = iy + ih * 0.3
      const active = i >= used
      ctx.fillStyle = active ? '#ffd84a' : 'rgba(30,60,55,0.35)'
      ctx.beginPath()
      ctx.arc(ccx, ccy, cr, 0, Math.PI * 2)
      ctx.fill()
      if (active) {
        ctx.strokeStyle = '#d9a21a'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = '#fff6c8'
        ctx.beginPath()
        ctx.arc(ccx - cr * 0.3, ccy - cr * 0.3, cr * 0.3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.fillStyle = '#1f4d43'
    fitText(ctx, `점수 ${prizeScore(g.prizes)}`, mx + 8, iy + ih * 0.74, mw - 16, fs)

    // 타이머
    const tx = ix + iw - tw
    ctx.fillStyle = '#16232a'
    ctx.beginPath()
    ctx.roundRect(tx, iy, tw, ih, 8)
    ctx.fill()
    const sec = g.phase === 'aim' ? Math.max(0, Math.ceil(g.timer)) : g.phase === 'ready' ? AIM_TIME : 0
    const hurry = g.phase === 'aim' && g.timer < 4
    ctx.textAlign = 'center'
    ctx.fillStyle = hurry ? (Math.floor(g.time * 6) % 2 ? '#ff6b8f' : '#ffb3c6') : '#7dffd6'
    ctx.save()
    fitText(ctx, g.phase === 'aim' || g.phase === 'ready' ? String(sec).padStart(2, '0') : '--', tx + tw / 2, iy + ih * 0.42, tw - 12, Math.min(30, ih * 0.5))
    ctx.restore()
    ctx.fillStyle = 'rgba(125,255,214,0.6)'
    fitText(ctx, '초', tx + tw / 2, iy + ih * 0.82, tw - 12, Math.min(11, ih * 0.2), 400)
  }

  function drawSides(ctx: CanvasRenderingContext2D, L: Lay) {
    const sw = L.side
    const top = L.cy + L.mH + 4
    const ph = Math.min(L.ch - L.mH - 4, 7 * 46 + 70)
    // 왼쪽: 상품 안내
    const lx = L.cx - sw - 30
    board(ctx, lx, top, sw, ph, '상품 안내')
    const kinds: PlushKind[] = ['gold', 'star', 'cat', 'penguin', 'bear', 'bunny', 'chick']
    const rowH = Math.min(46, (ph - 60) / kinds.length)
    kinds.forEach((k, i) => {
      const y = top + 52 + i * rowH + rowH / 2
      plushIcon(ctx, k, 0, lx + 30, y + rowH * 0.06, rowH * 0.3, g.time, i)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = k === 'gold' ? '#ffd84a' : '#f3ecff'
      fitText(ctx, PLUSH_INFO[k].name, lx + 56, y, sw - 130, 14)
      ctx.textAlign = 'right'
      ctx.fillStyle = k === 'gold' ? '#ffd84a' : '#7dffd6'
      fitText(ctx, `${PLUSH_INFO[k].points}점`, lx + sw - 14, y, 64, 14)
    })
    // 오른쪽: 이번 판
    const rx = L.cx + L.cw + 30
    const rh = Math.min(ph, 300)
    board(ctx, rx, top, sw, rh, '이번 판')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffd84a'
    fitText(ctx, `${prizeScore(g.prizes)}점`, rx + sw / 2, top + 84, sw - 24, 34)
    ctx.fillStyle = '#c9bce6'
    const left = g.phase === 'ready' ? COINS : g.coins
    fitText(ctx, `남은 동전 ${left}개`, rx + sw / 2, top + 124, sw - 24, 14, 400)
    const slots = COINS
    const sz = Math.min(58, (sw - 40) / slots)
    for (let i = 0; i < slots; i++) {
      const bx = rx + sw / 2 + (i - (slots - 1) / 2) * (sz + 8)
      const by = top + 186
      ctx.fillStyle = 'rgba(255,255,255,0.07)'
      ctx.beginPath()
      ctx.roundRect(bx - sz / 2, by - sz / 2, sz, sz, 12)
      ctx.fill()
      const k = g.prizes[i]
      if (k) plushIcon(ctx, k, g.prizeVar[i], bx, by + sz * 0.06, sz * 0.3, g.time, i)
      else {
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        fitText(ctx, '?', bx, by, sz, 18)
      }
    }
    ctx.fillStyle = '#9d8fc2'
    fitText(ctx, '←→ 이동 · 스페이스 뽑기', rx + sw / 2, top + rh - 30, sw - 24, 12, 400)
  }

  function board(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string) {
    ctx.save()
    ctx.fillStyle = 'rgba(38,28,66,0.85)'
    ctx.strokeStyle = 'rgba(183,156,255,0.45)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 16)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#ff8fbc'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fitText(ctx, title, x + w / 2, y + 26, w - 24, 17)
    ctx.fillStyle = 'rgba(255,143,188,0.35)'
    ctx.fillRect(x + 16, y + 44, w - 32, 2)
    ctx.restore()
  }

  function card(ctx: CanvasRenderingContext2D, L: Lay, ch: number, dim: number) {
    const cw = Math.min(L.w - 32, 380)
    const areaH = L.h - CTRL_H
    const x = (L.w - cw) / 2
    const y = Math.max(10, (areaH - ch) / 2)
    ctx.fillStyle = `rgba(16,12,30,${dim})`
    ctx.fillRect(0, 0, L.w, L.h)
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.beginPath()
    ctx.roundRect(x - 2, y + 6, cw + 4, ch + 8, 26)
    ctx.fill()
    const cg = ctx.createLinearGradient(0, y, 0, y + ch)
    cg.addColorStop(0, '#fffafd')
    cg.addColorStop(1, '#ffe9f3')
    ctx.fillStyle = cg
    ctx.beginPath()
    ctx.roundRect(x, y, cw, ch, 24)
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = '#ffb3cf'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(x + 6, y + 6, cw - 12, ch - 12, 19)
    ctx.stroke()
    return { x, y, cw }
  }

  function drawReady(ctx: CanvasRenderingContext2D, L: Lay) {
    const ch = Math.min(330, L.h - CTRL_H - 20)
    const { x, y, cw } = card(ctx, L, ch, 0.45)
    const cxm = x + cw / 2
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#e64284'
    fitText(ctx, '집게왕 인형뽑기', cxm, y + 38, cw - 40, 26)
    const kinds: PlushKind[] = ['bunny', 'bear', 'gold', 'cat', 'chick']
    const iconR = Math.min(22, cw / 16)
    kinds.forEach((k, i) => {
      const bob = Math.sin(g.time * 3 + i * 0.9) * 4
      plushIcon(ctx, k, i, cxm + (i - 2) * iconR * 2.9, y + 98 + bob, iconR * (k === 'gold' ? 1.15 : 1), g.time, i, Math.sin(g.time * 2 + i) * 0.12)
    })
    const lines = ['← → 로 집게를 옮기고', '뽑기! 를 누르면 쑥 내려가요', '가운데를 잡을수록 꽉 잡아요', `동전 ${COINS}개 · 한 번에 ${AIM_TIME}초`]
    const lh = Math.min(26, (ch - 220) / lines.length)
    ctx.fillStyle = '#5a4470'
    lines.forEach((t, i) => fitText(ctx, t, cxm, y + 150 + i * lh, cw - 48, 15, 400))
    // 시작 단추
    const k = 1 + Math.sin(g.time * 4) * 0.04
    const by = y + ch - 46
    ctx.save()
    ctx.translate(cxm, by)
    ctx.scale(k, k)
    const bw = Math.min(220, cw - 60)
    const bg = ctx.createLinearGradient(0, -24, 0, 24)
    bg.addColorStop(0, '#ff9cc2')
    bg.addColorStop(1, '#ff5c9a')
    ctx.fillStyle = '#b02763'
    ctx.beginPath()
    ctx.roundRect(-bw / 2, -22, bw, 50, 25)
    ctx.fill()
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.roundRect(-bw / 2, -26, bw, 48, 24)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    fitText(ctx, '누르면 시작', 0, -2, bw - 30, 20)
    ctx.restore()
  }

  function drawPopup(ctx: CanvasRenderingContext2D, L: Lay) {
    const p = g.popup!
    const t = p.t
    const fade = t > 2.2 ? Math.max(0, 1 - (t - 2.2) / 0.4) : Math.min(1, t * 5)
    const areaH = L.h - CTRL_H
    const cxm = L.w / 2
    const cym = areaH * 0.44
    ctx.save()
    ctx.globalAlpha = fade
    ctx.fillStyle = 'rgba(16,12,30,0.55)'
    ctx.fillRect(0, 0, L.w, L.h)
    const R = Math.min(L.w, areaH) * 0.15
    // 햇살
    ctx.save()
    ctx.translate(cxm, cym)
    ctx.rotate(g.time * 0.6)
    const gold = p.kind === 'gold'
    ctx.fillStyle = gold ? 'rgba(255,216,74,0.35)' : 'rgba(255,179,207,0.3)'
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(-R * 0.35, -R * 2.6)
      ctx.lineTo(R * 0.35, -R * 2.6)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
    const sc = t < 0.5 ? easeOutBack(t / 0.5) : 1 + Math.sin(t * 5) * 0.03
    plushIcon(ctx, p.kind, p.variant, cxm, cym - R * 0.1, R * Math.max(0.01, sc), g.time, 1, Math.sin(t * 3) * 0.08)
    // 반짝이
    ctx.fillStyle = '#fffbe0'
    for (let i = 0; i < 6; i++) {
      const a = g.time * 1.4 + (i * Math.PI) / 3
      const k = (Math.sin(g.time * 6 + i * 2) + 1) / 2
      star4(ctx, cxm + Math.cos(a) * R * 1.7, cym + Math.sin(a) * R * 1.4, 4 + k * 6)
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const ty = cym + R * 1.65
    ctx.font = `700 30px ${GAME_FONT}`
    ctx.lineJoin = 'round'
    ctx.lineWidth = 7
    ctx.strokeStyle = gold ? '#a86a00' : '#c2366f'
    const label = `${PLUSH_INFO[p.kind].name} GET!`
    const maxW = L.w - 40
    ctx.save()
    ctx.translate(cxm, ty)
    const ts = t < 0.6 ? easeOutBack(Math.max(0, (t - 0.1) / 0.5)) : 1
    ctx.scale(ts, ts)
    ctx.font = `700 ${Math.min(32, Math.floor((32 * maxW) / Math.max(1, measure(ctx, label, 32))))}px ${GAME_FONT}`
    ctx.strokeText(label, 0, 0)
    ctx.fillStyle = gold ? '#ffe066' : '#ffffff'
    ctx.fillText(label, 0, 0)
    ctx.restore()
    ctx.fillStyle = '#ffe066'
    fitText(ctx, `+${PLUSH_INFO[p.kind].points}점${gold ? ' · 레어!' : ''}`, cxm, ty + 38, maxW, 20)
    ctx.restore()
  }

  function measure(ctx: CanvasRenderingContext2D, text: string, px: number) {
    ctx.font = `700 ${px}px ${GAME_FONT}`
    return ctx.measureText(text).width
  }

  function drawResult(ctx: CanvasRenderingContext2D, L: Lay) {
    const cwGuess = Math.min(L.w - 32, 380)
    const ch = Math.min(Math.min(92, (cwGuess - 60) / 3) + 240 + (g.newBest ? 34 : 0), L.h - CTRL_H - 20)
    const appear = Math.min(1, g.t * 3)
    ctx.save()
    const { x, y, cw } = card(ctx, L, ch, 0.55 * appear)
    const cxm = x + cw / 2
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#e64284'
    fitText(ctx, '오늘의 수확', cxm, y + 36, cw - 40, 24)
    // 상품 칸
    const sz = Math.min(92, (cw - 60) / 3)
    for (let i = 0; i < COINS; i++) {
      const bx = cxm + (i - 1) * (sz + 10)
      const by = y + 76 + sz / 2
      const k = g.prizes[i]
      ctx.fillStyle = k ? (k === 'gold' ? '#fff1b8' : '#ffffff') : 'rgba(150,120,180,0.08)'
      ctx.strokeStyle = k ? '#ffb3cf' : 'rgba(150,120,180,0.35)'
      ctx.lineWidth = 2
      if (!k) ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.roundRect(bx - sz / 2, by - sz / 2, sz, sz, 16)
      ctx.fill()
      ctx.stroke()
      ctx.setLineDash([])
      if (k) {
        const pop = easeOutBack(Math.min(1, Math.max(0, g.t * 2.5 - i * 0.4)))
        plushIcon(ctx, k, g.prizeVar[i], bx, by - sz * 0.06, sz * 0.27 * Math.max(0.01, pop), g.time, i, Math.sin(g.time * 2 + i) * 0.1)
        ctx.fillStyle = '#5a4470'
        fitText(ctx, PLUSH_INFO[k].name, bx, by + sz * 0.38, sz - 10, 12)
      } else {
        ctx.fillStyle = 'rgba(120,100,150,0.55)'
        fitText(ctx, '꽝', bx, by, sz - 10, 18)
      }
    }
    const sy = y + 76 + sz + 44
    ctx.fillStyle = '#3b2a4a'
    fitText(ctx, `${g.score}점`, cxm, sy, cw - 40, 40)
    if (g.newBest) {
      ctx.save()
      ctx.translate(cxm, sy + 38)
      ctx.rotate(Math.sin(g.time * 4) * 0.05)
      ctx.scale(1 + Math.sin(g.time * 6) * 0.04, 1 + Math.sin(g.time * 6) * 0.04)
      ctx.fillStyle = '#ffd84a'
      ctx.beginPath()
      ctx.roundRect(-50, -15, 100, 30, 15)
      ctx.fill()
      ctx.fillStyle = '#a3570f'
      fitText(ctx, '최고 기록!', 0, 1, 88, 15)
      ctx.restore()
    }
    // 말풍선
    const line = resultLine(g.prizes)
    const bw = cw - 50
    const by2 = sy + 52 + (g.newBest ? 34 : 0)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#e8d6f0'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(cxm - bw / 2, by2 - 22, bw, 44, 22)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#7a5a8f'
    fitText(ctx, `“${line}”`, cxm, by2 + 1, bw - 24, 16)
    ctx.restore()
  }

  function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x, y + r * 0.9)
    ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.4)
    ctx.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9)
    ctx.fill()
  }

  const ref = useCanvasLoop(draw)

  const toUnitX = (clientX: number, el: HTMLElement) => {
    const L = g.L
    if (!L) return null
    const r = el.getBoundingClientRect()
    return (clientX - r.left - L.ox) / L.s
  }

  const hold = (dir: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault()
      if (g.phase !== 'aim') return
      e.currentTarget.setPointerCapture?.(e.pointerId)
      g.btn = dir
      setHeld(dir)
    },
    onPointerUp: () => {
      g.btn = 0
      setHeld(0)
    },
    onPointerCancel: () => {
      g.btn = 0
      setHeld(0)
    },
    onLostPointerCapture: () => {
      g.btn = 0
      setHeld(0)
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  })

  return (
    <div className="claw-root">
      <canvas
        ref={ref}
        onPointerDown={(e) => {
          e.preventDefault()
          if (g.phase === 'aim') {
            e.currentTarget.setPointerCapture?.(e.pointerId)
            g.dragX = toUnitX(e.clientX, e.currentTarget)
          } else tapAnywhere()
        }}
        onPointerMove={(e) => {
          if (g.dragX !== null && g.phase === 'aim') g.dragX = toUnitX(e.clientX, e.currentTarget)
        }}
        onPointerUp={() => (g.dragX = null)}
        onPointerCancel={() => (g.dragX = null)}
        onContextMenu={(e) => e.preventDefault()}
      />
      {ui === 'play' && (
        <div className="claw-ctrl">
          <button className={`claw-btn claw-arrow${held === -1 ? ' on' : ''}`} aria-label="왼쪽으로" disabled={!canAim} {...hold(-1)}>
            ◀
          </button>
          <button
            className="claw-btn claw-go"
            disabled={!canAim}
            onPointerDown={(e) => {
              e.preventDefault()
              drop()
            }}
          >
            뽑기!
          </button>
          <button className={`claw-btn claw-arrow${held === 1 ? ' on' : ''}`} aria-label="오른쪽으로" disabled={!canAim} {...hold(1)}>
            ▶
          </button>
        </div>
      )}
      {ui === 'result' && (
        <div className="claw-ctrl">
          <button className="claw-btn claw-res again" onClick={() => startRound()}>
            한 판 더
          </button>
          <button className="claw-btn claw-res quit" onClick={onClose}>
            그만하기
          </button>
        </div>
      )}
    </div>
  )
}
