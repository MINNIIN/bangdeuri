/**
 * 꽝꽝펀치 — 오락실 펀치 기계.
 * 한 판 = 3번. 한 번 = ① 힘 게이지 멈추기 → ② 줄어드는 링이 과녁에 닿을 때 펀치. 한 판 기록은 셋 중 최고.
 * 화면은 전부 캔버스 한 장 — 400×700 가상 좌표로 그리고 화면에 맞춰 늘린다.
 */
import { type PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react'
import { bestScore, clamp01, fitText, GAME_FONT, type GameProps, noise, saveScore, sfx, tone, useCanvasLoop } from './kit'
import {
  accuracyFromRing,
  accuracyGrade,
  gaugePower,
  gaugeSpeed,
  PUNCHES,
  punchScore,
  rankLabel,
  resultLine,
  RING_TARGET,
  ringScale,
  ringSpeed,
  rollValue,
  roundBest,
} from './punch'
import './PunchGame.css'

const VW = 400
const VH = 700

// 패드 (경첩에 매달린 둥근 쿠션)
const HINGE_X = 200
const HINGE_Y = 214
const ARM = 122
const PAD_R = 80
const FOLD = Math.PI / 2 - 0.08

type Phase = 'ready' | 'flip' | 'power' | 'aim' | 'fly' | 'roll' | 'show' | 'fold' | 'result'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  star: boolean
  rot: number
  vr: number
}
interface Pop {
  text: string
  x: number
  y: number
  t: number
  life: number
  size: number
  color: string
}
interface Btn {
  id: 'act' | 'again' | 'quit'
  x: number
  y: number
  w: number
  h: number
}

interface State {
  phase: Phase
  t: number
  clock: number
  punch: number
  scores: number[]
  accs: number[]
  power: number
  ring: number
  acc: number
  score: number
  fold: number
  swing: number
  swingV: number
  shake: number
  flash: number
  waves: number[]
  parts: Particle[]
  pops: Pop[]
  led: number | null
  lastTick: number
  lastRise: number
  newBest: boolean
  best: number
  /** 이 기기 최고 기록 */
  record: number
  btns: Btn[]
  view: { s: number; ox: number; oy: number }
  pressed: Btn['id'] | null
  pressT: number
}

const fresh = (): State => ({
  phase: 'ready',
  t: 0,
  clock: 0,
  punch: 0,
  scores: [],
  accs: [],
  power: 0,
  ring: 1,
  acc: 0,
  score: 0,
  fold: 1,
  swing: 0,
  swingV: 0,
  shake: 0,
  flash: 0,
  waves: [],
  parts: [],
  pops: [],
  led: null,
  lastTick: 0,
  lastRise: 0,
  newBest: false,
  best: 0,
  record: bestScore('punch'),
  btns: [],
  view: { s: 1, ox: 0, oy: 0 },
  pressed: null,
  pressT: 0,
})

// ─── 이징 ───
const easeOutBack = (k: number) => {
  const c = 1.9
  const x = k - 1
  return 1 + (c + 1) * x * x * x + c * x * x
}
const easeInCubic = (k: number) => k * k * k
const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3)
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

const rollDur = (score: number) => 0.9 + (score / 999) * 0.6

export default function PunchGame({ onResult, onClose }: GameProps) {
  const g = useRef<State>(fresh())
  const layers = useRef<{ key: string; bg: HTMLCanvasElement | null; cab: HTMLCanvasElement | null }>({ key: '', bg: null, cab: null })
  const props = useRef({ onResult, onClose })
  props.current = { onResult, onClose }

  // ─── 동작 ───
  const start = () => {
    const s = g.current
    s.phase = 'flip'
    s.t = 0
    s.punch = 0
    s.scores = []
    s.accs = []
    s.led = 0
    s.newBest = false
    sfx.coin()
    noise(0.18, { vol: 0.3, lowpass: 500, delay: 0.32 })
    tone(220, 0.18, { wave: 'triangle', vol: 0.14, to: 90, delay: 0.32 })
  }
  const lockPower = () => {
    const s = g.current
    s.phase = 'aim'
    s.t = 0
    s.ring = 1
    tone(880, 0.06, { wave: 'square', vol: 0.1 })
    tone(1320, 0.1, { wave: 'square', vol: 0.08, delay: 0.05 })
  }
  const throwPunch = () => {
    const s = g.current
    s.acc = accuracyFromRing(s.ring)
    s.phase = 'fly'
    s.t = 0
    noise(0.16, { vol: 0.16, lowpass: 2600 })
  }
  const impact = () => {
    const s = g.current
    s.score = punchScore(s.power, s.acc)
    s.scores.push(s.score)
    s.accs.push(s.acc)
    const k = s.score / 999
    s.swingV = 5 + 13 * k
    s.shake = 6 + 22 * k
    s.flash = 0.35 + 0.45 * k
    s.waves.push(0)
    if (k > 0.6) s.waves.push(-0.08)
    const cx = HINGE_X
    const cy = HINGE_Y + ARM
    const n = 16 + Math.round(k * 34)
    const colors = ['#ffe14d', '#fff6c2', '#ff9f3d', '#ff6fa1', '#ffffff']
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 140 + Math.random() * (220 + 360 * k)
      const max = 0.55 + Math.random() * 0.5
      s.parts.push({
        x: cx + Math.cos(a) * 20,
        y: cy + Math.sin(a) * 20,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 80,
        life: max,
        max,
        size: 4 + Math.random() * (6 + 8 * k),
        color: colors[i % colors.length],
        star: i % 3 !== 2,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 12,
      })
    }
    const word = s.score >= 900 ? '콰쾅!!' : s.score >= 400 ? '쾅!' : '퍽!'
    s.pops.push({ text: word, x: cx, y: cy - 6, t: 0, life: 0.9, size: 46 + 34 * k, color: '#ffe14d' })
    sfx.boom()
    sfx.hit()
    if (k > 0.7) noise(0.35, { vol: 0.3, lowpass: 250, delay: 0.05 })
    s.phase = 'roll'
    s.t = 0
    s.led = 0
  }
  const finishRoll = () => {
    const s = g.current
    s.led = s.score
    s.phase = 'show'
    s.t = 0
    s.pops.push({
      text: accuracyGrade(s.acc),
      x: HINGE_X,
      y: HINGE_Y + ARM + 104,
      t: 0,
      life: 1.4,
      size: 26,
      color: s.acc >= 0.9 ? '#7dffb0' : s.acc >= 0.65 ? '#9fe3ff' : s.acc >= 0.3 ? '#ffffff' : '#ffb3c7',
    })
    if (s.score >= 900) sfx.win()
    else {
      tone(784, 0.1, { wave: 'square', vol: 0.1 })
      tone(1047, 0.18, { wave: 'square', vol: 0.1, delay: 0.09 })
    }
  }
  const next = () => {
    const s = g.current
    if (s.punch < PUNCHES - 1) {
      s.punch++
      s.phase = 'power'
      s.t = 0
      tone(523, 0.08, { wave: 'triangle', vol: 0.1 })
      return
    }
    // 판 끝
    const best = roundBest(s.scores)
    s.best = best
    s.newBest = saveScore('punch', best)
    s.record = Math.max(s.record, best)
    s.phase = 'fold'
    s.t = 0
    props.current.onResult({ score: best, line: resultLine(best) })
    noise(0.15, { vol: 0.2, lowpass: 600 })
  }

  const press = (id: Btn['id'] | null) => {
    const s = g.current
    switch (s.phase) {
      case 'ready':
        start()
        break
      case 'power':
        lockPower()
        break
      case 'aim':
        throwPunch()
        break
      case 'roll':
        finishRoll()
        break
      case 'show':
        if (s.t > 0.25) next()
        break
      case 'result':
        if (s.t < 0.5) return
        if (id === 'quit') {
          sfx.click()
          props.current.onClose()
        } else if (id === 'again') start()
        break
      default:
        break
    }
  }

  const hitBtn = (vx: number, vy: number): Btn['id'] | null => {
    for (const b of g.current.btns) if (vx >= b.x && vx <= b.x + b.w && vy >= b.y && vy <= b.y + b.h) return b.id
    return null
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    const { s, ox, oy } = g.current.view
    const vx = (e.clientX - r.left - ox) / s
    const vy = (e.clientY - r.top - oy) / s
    const id = hitBtn(vx, vy)
    if (g.current.phase === 'result' && !id) return
    if (id) {
      g.current.pressed = id
      g.current.pressT = 0.15
    }
    press(id)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        press(g.current.phase === 'result' ? 'again' : null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // press는 ref만 만진다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── 매 프레임 ───
  const update = (rawDt: number) => {
    const dt = Math.max(0, rawDt) // 첫 프레임은 음수일 수 있다
    const s = g.current
    s.clock += dt
    s.t += dt
    s.pressT = Math.max(0, s.pressT - dt)
    switch (s.phase) {
      case 'flip': {
        const k = clamp01(s.t / 0.6)
        s.fold = 1 - easeOutBack(k)
        if (k >= 1) {
          s.fold = 0
          s.phase = 'power'
          s.t = 0
        }
        break
      }
      case 'power': {
        s.power = gaugePower(s.t, gaugeSpeed(s.punch))
        if (s.clock - s.lastRise > 0.09) {
          s.lastRise = s.clock
          tone(260 + s.power * 640, 0.04, { wave: 'triangle', vol: 0.04 })
        }
        break
      }
      case 'aim': {
        s.ring = ringScale(s.t, ringSpeed(s.punch))
        if (s.ring <= 0) throwPunch()
        break
      }
      case 'fly':
        if (s.t >= 0.2) impact()
        break
      case 'roll': {
        const d = rollDur(s.score)
        const v = rollValue(s.score, s.t / d)
        if (v !== s.led && s.clock - s.lastTick > 0.035) {
          s.lastTick = s.clock
          tone(1100 + (v / 999) * 900, 0.022, { wave: 'square', vol: 0.05 })
        }
        s.led = v
        if (s.t >= d) finishRoll()
        break
      }
      case 'show':
        if (s.t >= 1.7) next()
        break
      case 'fold': {
        const k = clamp01(s.t / 0.5)
        s.fold = easeOutCubic(k)
        if (k >= 1) {
          s.phase = 'result'
          s.t = 0
          if (s.newBest) sfx.win()
          else sfx.coin()
        }
        break
      }
      default:
        break
    }
    // 패드 흔들림 (용수철)
    s.swingV += (-90 * s.swing - 6.5 * s.swingV) * dt
    s.swing += s.swingV * dt
    if (s.swing > 1.3) {
      s.swing = 1.3
      s.swingV = -Math.abs(s.swingV) * 0.45
      noise(0.08, { vol: 0.12, lowpass: 400 })
    }
    if (s.swing < -0.35) {
      s.swing = -0.35
      s.swingV = Math.abs(s.swingV) * 0.4
    }
    s.shake *= Math.pow(0.0025, dt)
    if (s.shake < 0.2) s.shake = 0
    s.flash = Math.max(0, s.flash - dt * 2.4)
    s.waves = s.waves.map((w) => w + dt).filter((w) => w < 0.5)
    for (const p of s.parts) {
      p.vy += 700 * dt
      p.vx *= Math.pow(0.4, dt)
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vr * dt
      p.life -= dt
    }
    s.parts = s.parts.filter((p) => p.life > 0)
    for (const p of s.pops) p.t += dt
    s.pops = s.pops.filter((p) => p.t < p.life)
  }

  const canvasRef = useCanvasLoop((ctx, dt, w, h) => {
    update(dt)
    const s = g.current
    const sc = Math.min(w / VW, h / VH)
    const ox = (w - VW * sc) / 2
    const oy = (h - VH * sc) / 2
    s.view = { s: sc, ox, oy }

    // 안 움직이는 배경·기계는 크기가 바뀔 때만 다시 그린다
    const dpr = ctx.getTransform().a || 1
    const key = `${w}x${h}@${dpr}`
    if (layers.current.key !== key) {
      layers.current = {
        key,
        bg: paintLayer(w * dpr, h * dpr, (c) => {
          c.scale(dpr, dpr)
          paintBackdropStatic(c, w, h)
        }),
        cab: paintLayer((VW + CAB_M * 2) * sc * dpr, (VH + CAB_M * 2) * sc * dpr, (c) => {
          c.scale(sc * dpr, sc * dpr)
          c.translate(CAB_M, CAB_M)
          c.textAlign = 'center'
          c.textBaseline = 'middle'
          paintCabinetStatic(c)
        }),
      }
    }
    const L = layers.current
    if (L.bg) ctx.drawImage(L.bg, 0, 0, w, h)
    drawBokeh(ctx, w, h, s.clock)

    ctx.save()
    const sh = s.shake
    ctx.translate(ox + (Math.random() - 0.5) * sh * sc, oy + (Math.random() - 0.5) * sh * sc)
    ctx.scale(sc, sc)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    s.btns = []
    if (L.cab) ctx.drawImage(L.cab, -CAB_M, -CAB_M, VW + CAB_M * 2, VH + CAB_M * 2)
    drawCabinet(ctx, s)
    drawFx(ctx, s)
    ctx.restore()

    if (s.flash > 0) {
      ctx.fillStyle = `rgba(255,250,230,${s.flash * 0.55})`
      ctx.fillRect(0, 0, w, h)
    }

    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(sc, sc)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // 가로 화면이면 옆 자리에 등급표 · 이번 판 기록
    if (ox / sc > 250) drawSides(ctx, s)
    if (s.phase === 'result') drawResult(ctx, s)
    else drawBottom(ctx, s)
    ctx.restore()
  })

  return <canvas ref={canvasRef} className="punch-canvas" aria-label="꽝꽝펀치 — 누르거나 스페이스로 펀치" onPointerDown={onPointerDown} />
}

// ─── 그리기 도구 ───

/** 기계 둘레 여백 (그림자·빛이 잘리지 않게) */
const CAB_M = 30

function paintLayer(pw: number, ph: number, paint: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, Math.ceil(pw))
  cv.height = Math.max(1, Math.ceil(ph))
  const c = cv.getContext('2d')
  if (!c) return null
  paint(c)
  return cv
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/**
 * fitText + 기억: 같은 글씨·칸이면 맞춘 글꼴을 다시 재지 않는다 (measureText가 매 프레임 꽤 무겁다).
 * 글꼴이 늦게 내려오면 기억을 비운다.
 */
const fontMemo = new Map<string, string>()
if (typeof document !== 'undefined' && document.fonts) document.fonts.addEventListener('loadingdone', () => fontMemo.clear())
function ft(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, px: number, weight = 700) {
  const k = `${weight}|${px}|${maxW}|${text}`
  const f = fontMemo.get(k)
  if (f) {
    ctx.font = f
    ctx.fillText(text, x, y)
    return
  }
  fitText(ctx, text, x, y, maxW, px, weight)
  if (fontMemo.size > 600) fontMemo.clear()
  fontMemo.set(k, ctx.font)
}

/** 그림자 깔린 글씨 (fitText 두 번: 아래 진한 색 + 위 본색) */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, px: number, color: string, shadow = 'rgba(0,0,0,0.55)', off = 2) {
  if (shadow) {
    ctx.fillStyle = shadow
    ft(ctx, text, x, y + off, maxW, px)
  }
  ctx.fillStyle = color
  ft(ctx, text, x, y, maxW, px)
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2
    const rad = i % 2 === 0 ? r : r * 0.45
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad)
  }
  ctx.closePath()
}

// ─── 배경: 오락실 벽 · 네온 · 바닥 ───

function paintBackdropStatic(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#2a1d47')
  bg.addColorStop(0.62, '#1a1530')
  bg.addColorStop(1, '#100d1c')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // 네온 줄
  const ny = h * 0.16
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(255,90,170,0.35)'
  ctx.shadowColor = '#ff5aaa'
  ctx.shadowBlur = 14
  ctx.beginPath()
  ctx.moveTo(0, ny)
  ctx.lineTo(w, ny)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(90,220,255,0.3)'
  ctx.shadowColor = '#5adcff'
  ctx.beginPath()
  ctx.moveTo(0, ny + 12)
  ctx.lineTo(w, ny + 12)
  ctx.stroke()
  ctx.shadowBlur = 0

  // 바닥 격자 (원근)
  const fy = h * 0.8
  const fl = ctx.createLinearGradient(0, fy, 0, h)
  fl.addColorStop(0, '#231a3a')
  fl.addColorStop(1, '#120e20')
  ctx.fillStyle = fl
  ctx.fillRect(0, fy, w, h - fy)
  ctx.strokeStyle = 'rgba(160,120,255,0.13)'
  ctx.lineWidth = 1
  for (let i = -12; i <= 12; i++) {
    ctx.beginPath()
    ctx.moveTo(w / 2 + i * 26, fy)
    ctx.lineTo(w / 2 + i * 150, h)
    ctx.stroke()
  }
  for (let i = 1; i < 6; i++) {
    const y = fy + (h - fy) * Math.pow(i / 6, 1.7)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
}

function drawBokeh(ctx: CanvasRenderingContext2D, w: number, h: number, clock: number) {
  // 둥실 빛망울
  for (let i = 0; i < 14; i++) {
    const x = ((i * 137.5 + clock * (6 + (i % 4) * 3)) % (w + 80)) - 40
    const y = h * (0.08 + ((i * 0.37) % 0.6)) + Math.sin(clock * 0.8 + i) * 10
    const r = 14 + (i % 5) * 9
    const hue = [330, 190, 48, 270][i % 4]
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `hsla(${hue},90%,70%,0.16)`)
    gr.addColorStop(1, `hsla(${hue},90%,70%,0)`)
    ctx.fillStyle = gr
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

}

// ─── 기계 ───

/** 안 움직이는 부분 (크기 바뀔 때 한 번만 그려서 쌓아 둔다) */
function paintCabinetStatic(ctx: CanvasRenderingContext2D) {
  // 바닥 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.beginPath()
  ctx.ellipse(200, 612, 170, 16, 0, 0, Math.PI * 2)
  ctx.fill()

  // 발
  ctx.fillStyle = '#2b2236'
  rr(ctx, 70, 592, 48, 18, 6)
  ctx.fill()
  rr(ctx, 282, 592, 48, 18, 6)
  ctx.fill()

  // 몸통 (빨강)
  const body = ctx.createLinearGradient(40, 0, 360, 0)
  body.addColorStop(0, '#b3172b')
  body.addColorStop(0.12, '#e8344a')
  body.addColorStop(0.5, '#f2475b')
  body.addColorStop(0.88, '#e8344a')
  body.addColorStop(1, '#a11426')
  ctx.fillStyle = body
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 8
  rr(ctx, 40, 90, 320, 510, 26)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.strokeStyle = '#6e0c19'
  ctx.lineWidth = 4
  ctx.stroke()
  // 옆 노란 띠
  ctx.fillStyle = '#ffc93c'
  rr(ctx, 44, 200, 12, 276, 6)
  ctx.fill()
  rr(ctx, 344, 200, 12, 276, 6)
  ctx.fill()
  // 몸통 반짝이
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  rr(ctx, 60, 96, 280, 8, 4)
  ctx.fill()

  paintMarqueeStatic(ctx)
  paintLedStatic(ctx)

  // 패드 창 (움푹)
  const win = ctx.createLinearGradient(0, 206, 0, 470)
  win.addColorStop(0, '#1b1026')
  win.addColorStop(1, '#3a1f3f')
  ctx.fillStyle = win
  rr(ctx, 62, 206, 276, 266, 18)
  ctx.fill()
  ctx.strokeStyle = '#ffc93c'
  ctx.lineWidth = 5
  ctx.stroke()
  // 안쪽 그림자
  const inner = ctx.createLinearGradient(0, 206, 0, 236)
  inner.addColorStop(0, 'rgba(0,0,0,0.55)')
  inner.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = inner
  rr(ctx, 64, 208, 272, 30, 16)
  ctx.fill()
  paintLowerStatic(ctx)
}

function drawCabinet(ctx: CanvasRenderingContext2D, s: State) {
  const c = s.clock
  drawMarquee(ctx, s)
  drawLedPanel(ctx, s)

  // 창 안 조명 (점점)
  for (let i = 0; i < 9; i++) {
    const on = Math.floor(c * 6 + i) % 3 === 0
    ctx.fillStyle = on ? 'rgba(255,220,120,0.5)' : 'rgba(255,220,120,0.12)'
    ctx.beginPath()
    ctx.arc(90 + i * 27.5, 462, 2.6, 0, Math.PI * 2)
    ctx.fill()
  }

  const show = s.phase !== 'ready' && s.phase !== 'result' ? 1 - s.fold * 0.85 : 0
  if (show > 0.02) {
    ctx.globalAlpha = clamp01(show)
    drawLamps(ctx, s)
    drawGauge(ctx, s)
    ctx.globalAlpha = 1
  }

  drawPad(ctx, s)

  if (s.phase === 'ready') drawHowTo(ctx, s)

  drawLowerBody(ctx, s)
  drawFist(ctx, s)
}

function paintMarqueeStatic(ctx: CanvasRenderingContext2D) {
  // 간판 판
  const g = ctx.createLinearGradient(0, 14, 0, 82)
  g.addColorStop(0, '#ffd85a')
  g.addColorStop(1, '#ffae1f')
  ctx.fillStyle = g
  ctx.shadowColor = 'rgba(255,200,60,0.55)'
  ctx.shadowBlur = 22
  rr(ctx, 30, 12, 340, 72, 20)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = '#8a4b00'
  ctx.lineWidth = 4
  ctx.stroke()
  // 안쪽 빨강
  ctx.fillStyle = '#d82640'
  rr(ctx, 44, 24, 312, 48, 14)
  ctx.fill()
  ctx.save()
  ctx.translate(200, 48)
  ctx.rotate(-0.025)
  label(ctx, '꽝꽝펀치', 0, 0, 240, 34, '#fff3b0', '#6e0c19', 3)
  ctx.restore()
}

function drawMarquee(ctx: CanvasRenderingContext2D, s: State) {
  const c = s.clock
  // 전구 (쫓아가며 반짝)
  const n = 22
  for (let i = 0; i < n; i++) {
    const k = i / n
    // 둘레를 따라
    const per = 2 * (340 + 72)
    let d = k * per
    let x: number
    let y: number
    if (d < 340) {
      x = 30 + d
      y = 18
    } else if ((d -= 340) < 72) {
      x = 364
      y = 12 + d
    } else if ((d -= 72) < 340) {
      x = 370 - d
      y = 78
    } else {
      d -= 340
      x = 36
      y = 84 - d
    }
    x = Math.max(40, Math.min(360, x))
    y = Math.max(18, Math.min(78, y))
    const on = (i + Math.floor(c * 8)) % 3 === 0
    if (on) {
      ctx.fillStyle = 'rgba(255,243,160,0.35)'
      ctx.beginPath()
      ctx.arc(x, y, 7, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = on ? '#fffbe0' : '#ffcf6b'
    ctx.beginPath()
    ctx.arc(x, y, on ? 3.6 : 2.8, 0, Math.PI * 2)
    ctx.fill()
  }
  // 양쪽 별
  ctx.fillStyle = '#fff3b0'
  star(ctx, 66, 48, 9, c * 1.5)
  ctx.fill()
  star(ctx, 334, 48, 9, -c * 1.5)
  ctx.fill()
}

const SEG: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
  ' ': '',
}

/** 7-세그먼트 숫자 하나. lit = 켤 세그먼트 글자들 */
function drawDigit(ctx: CanvasRenderingContext2D, x: number, y: number, W: number, H: number, lit: string, color: string) {
  const T = W * 0.2
  const gp = T * 0.14
  const hseg = (x0: number, x1: number, yy: number) => {
    ctx.moveTo(x0 + gp, yy)
    ctx.lineTo(x0 + gp + T / 2, yy - T / 2)
    ctx.lineTo(x1 - gp - T / 2, yy - T / 2)
    ctx.lineTo(x1 - gp, yy)
    ctx.lineTo(x1 - gp - T / 2, yy + T / 2)
    ctx.lineTo(x0 + gp + T / 2, yy + T / 2)
    ctx.closePath()
  }
  const vseg = (xx: number, y0: number, y1: number) => {
    ctx.moveTo(xx, y0 + gp)
    ctx.lineTo(xx + T / 2, y0 + gp + T / 2)
    ctx.lineTo(xx + T / 2, y1 - gp - T / 2)
    ctx.lineTo(xx, y1 - gp)
    ctx.lineTo(xx - T / 2, y1 - gp - T / 2)
    ctx.lineTo(xx - T / 2, y0 + gp + T / 2)
    ctx.closePath()
  }
  const segs: Record<string, () => void> = {
    a: () => hseg(x + T / 2, x + W - T / 2, y + T / 2),
    b: () => vseg(x + W - T / 2, y + T / 2, y + H / 2),
    c: () => vseg(x + W - T / 2, y + H / 2, y + H - T / 2),
    d: () => hseg(x + T / 2, x + W - T / 2, y + H - T / 2),
    e: () => vseg(x + T / 2, y + H / 2, y + H - T / 2),
    f: () => vseg(x + T / 2, y + T / 2, y + H / 2),
    g: () => hseg(x + T / 2, x + W - T / 2, y + H / 2),
  }
  // 꺼진 칸
  ctx.fillStyle = 'rgba(255,70,60,0.09)'
  ctx.beginPath()
  for (const k of 'abcdefg') segs[k]()
  ctx.fill()
  if (!lit) return
  ctx.beginPath()
  for (const k of lit) segs[k]()
  // 번짐 (shadowBlur 대신 굵은 반투명 테두리 — 폰에서도 가볍게)
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.18
  ctx.lineWidth = T * 1.1
  ctx.stroke()
  ctx.globalAlpha = 0.35
  ctx.lineWidth = T * 0.5
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = color
  ctx.fill()
  // 가운데 밝은 심
  ctx.fillStyle = 'rgba(255,230,220,0.55)'
  ctx.save()
  ctx.beginPath()
  for (const k of lit) segs[k]()
  ctx.clip()
  ctx.fillRect(x, y, W, H * 0.06)
  ctx.restore()
}

/** 3자리 LED (value = null이면 대기 화면 무늬) */
function drawLed(ctx: CanvasRenderingContext2D, cx: number, top: number, H: number, value: number | null, clock: number, color = '#ff3b30') {
  const W = H * 0.58
  const gap = W * 0.3
  const total = W * 3 + gap * 2
  ctx.save()
  // 살짝 기울인 숫자
  ctx.translate(cx, top)
  ctx.transform(1, 0, -0.08, 1, 0, 0)
  ctx.translate(-total / 2 + H * 0.04, 0)
  for (let i = 0; i < 3; i++) {
    let lit = ''
    if (value === null) {
      const ring = 'abcdef'
      const j = ((Math.floor(clock * 9 + i * 2) % 6) + 6) % 6
      lit = ring[j] + ring[(j + 1) % 6]
    } else {
      const str = String(Math.max(0, Math.min(999, Math.round(value)))).padStart(3, ' ')
      lit = SEG[str[i]]
    }
    drawDigit(ctx, i * (W + gap), 0, W, H, lit, color)
  }
  ctx.restore()
}

function stripText(s: State): { text: string; color: string } {
  switch (s.phase) {
    case 'ready':
      return { text: '동전 넣고 꽝! · 누르면 시작', color: '#ffcf6b' }
    case 'flip':
      return { text: '패드가 내려와요…', color: '#ffcf6b' }
    case 'power':
      return { text: `${s.punch + 1}/3 · 힘 게이지를 멈춰요!`, color: '#ffcf6b' }
    case 'aim':
      return { text: '링이 과녁에 닿을 때 펀치!', color: '#9fe3ff' }
    case 'fly':
    case 'roll':
      return { text: '측정 중…', color: '#ffcf6b' }
    case 'show':
      return { text: `${accuracyGrade(s.acc)} · ${rankLabel(s.score)}`, color: '#7dffb0' }
    default:
      return { text: s.newBest ? '최고 기록 경신!' : `${rankLabel(s.best)}`, color: '#ffcf6b' }
  }
}

function paintLedStatic(ctx: CanvasRenderingContext2D) {
  // 베젤
  ctx.fillStyle = '#2a1a22'
  rr(ctx, 66, 100, 268, 100, 16)
  ctx.fill()
  const scr = ctx.createLinearGradient(0, 106, 0, 194)
  scr.addColorStop(0, '#0c0507')
  scr.addColorStop(1, '#1c0a0e')
  ctx.fillStyle = scr
  rr(ctx, 74, 106, 252, 88, 11)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,120,100,0.6)'
  ft(ctx, '점', 306, 156, 20, 13)
  ctx.fillStyle = '#26101a'
  rr(ctx, 80, 172, 240, 18, 6)
  ctx.fill()
}

function drawLedPanel(ctx: CanvasRenderingContext2D, s: State) {
  // 숫자
  const roll = s.phase === 'roll'
  const flick = roll && Math.floor(s.clock * 30) % 2 === 0 ? '#ff5a46' : '#ff3b30'
  drawLed(ctx, 200, 113, 52, s.phase === 'ready' ? null : s.led, s.clock, flick)
  const st = stripText(s)
  ctx.fillStyle = st.color
  ft(ctx, st.text, 200, 182, 228, 13)
  // 유리 반사
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.beginPath()
  ctx.moveTo(74, 106)
  ctx.lineTo(180, 106)
  ctx.lineTo(130, 194)
  ctx.lineTo(74, 194)
  ctx.closePath()
  ctx.fill()
}

function drawLamps(ctx: CanvasRenderingContext2D, s: State) {
  for (let i = 0; i < PUNCHES; i++) {
    const y = 250 + i * 66
    // 숫자가 다 굴러가기 전엔 램프에 점수를 안 보여 준다
    const done = i < s.scores.length && !(i === s.scores.length - 1 && (s.phase === 'fly' || s.phase === 'roll'))
    const cur = i === s.punch && !done
    const blink = cur && Math.floor(s.clock * 4) % 2 === 0
    ctx.fillStyle = '#120a18'
    ctx.beginPath()
    ctx.arc(89, y, 17, 0, Math.PI * 2)
    ctx.fill()
    const col = done ? '#ffe14d' : cur ? (blink ? '#ff8a4d' : '#a5482a') : '#3b2a3f'
    if (done || blink) {
      ctx.fillStyle = col
      ctx.globalAlpha *= 0.3
      ctx.beginPath()
      ctx.arc(89, y, 21, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha /= 0.3
    }
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(89, y, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = done ? '#7a4a00' : 'rgba(255,255,255,0.5)'
    ft(ctx, String(i + 1), 89, y + 1, 20, 14)
    if (done) {
      ctx.fillStyle = '#fff3c4'
      ft(ctx, String(s.scores[i]), 89, y + 29, 44, 13)
    }
  }
}

function drawGauge(ctx: CanvasRenderingContext2D, s: State) {
  const x = 297
  const top = 240
  const bot = 448
  const w = 28
  ctx.fillStyle = 'rgba(255,240,200,0.8)'
  ft(ctx, '힘', x + w / 2, 226, 30, 14)
  ctx.fillStyle = '#120a18'
  rr(ctx, x - 3, top - 3, w + 6, bot - top + 6, 12)
  ctx.fill()
  // 눈금 배경
  const bg = ctx.createLinearGradient(0, bot, 0, top)
  bg.addColorStop(0, 'rgba(80,220,120,0.18)')
  bg.addColorStop(0.6, 'rgba(255,210,60,0.18)')
  bg.addColorStop(1, 'rgba(255,60,60,0.22)')
  ctx.fillStyle = bg
  rr(ctx, x, top, w, bot - top, 10)
  ctx.fill()
  const live = s.phase === 'power'
  const p = live ? s.power : s.phase === 'flip' ? 0 : s.power
  const fh = (bot - top) * p
  if (fh > 1) {
    const fg = ctx.createLinearGradient(0, bot, 0, top)
    fg.addColorStop(0, '#4fe08a')
    fg.addColorStop(0.55, '#ffd23c')
    fg.addColorStop(1, '#ff3b3b')
    ctx.fillStyle = fg
    ctx.save()
    rr(ctx, x, top, w, bot - top, 10)
    ctx.clip()
    ctx.fillRect(x, bot - fh, w, fh)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillRect(x + 4, bot - fh, 5, fh)
    ctx.restore()
  }
  // 눈금
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1.5
  for (let i = 1; i < 5; i++) {
    const y = bot - ((bot - top) * i) / 5
    ctx.beginPath()
    ctx.moveTo(x + 2, y)
    ctx.lineTo(x + 9, y)
    ctx.stroke()
  }
  // 표시 화살표
  const my = bot - fh
  const lockedGlow = !live && s.phase !== 'flip'
  ctx.fillStyle = lockedGlow ? '#ffffff' : '#fff3b0'
  ctx.beginPath()
  ctx.moveTo(x - 4, my)
  ctx.lineTo(x - 13, my - 7)
  ctx.lineTo(x - 13, my + 7)
  ctx.closePath()
  ctx.fill()
  if (s.phase === 'aim' && s.t < 0.3) {
    ctx.strokeStyle = `rgba(255,255,255,${1 - s.t / 0.3})`
    ctx.lineWidth = 3
    rr(ctx, x - 6, top - 6, w + 12, bot - top + 12, 14)
    ctx.stroke()
  }
}

function drawPad(ctx: CanvasRenderingContext2D, s: State) {
  const th = s.fold * FOLD + s.swing
  const cth = Math.cos(th)
  const sth = Math.sin(th)
  // 대기 중엔 접힌 패드가 살랑
  const idle = s.phase === 'ready' ? Math.sin(s.clock * 2) * 0.03 : 0
  const cy = HINGE_Y + ARM * Math.cos(th + idle)
  const ry = PAD_R * Math.max(0.06, Math.abs(cth))
  const thick = 18 * sth

  // 팔 (크롬 막대 두 개)
  for (const dx of [-34, 34]) {
    const gr = ctx.createLinearGradient(HINGE_X + dx - 5, 0, HINGE_X + dx + 5, 0)
    gr.addColorStop(0, '#7a7f8c')
    gr.addColorStop(0.5, '#eef1f6')
    gr.addColorStop(1, '#6a6f7c')
    ctx.fillStyle = gr
    rr(ctx, HINGE_X + dx - 5, HINGE_Y, 10, Math.max(4, cy - HINGE_Y), 4)
    ctx.fill()
  }

  // 옆면 (두께)
  ctx.fillStyle = '#8f1222'
  ctx.beginPath()
  ctx.ellipse(HINGE_X, cy + thick, PAD_R, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(HINGE_X - PAD_R, Math.min(cy, cy + thick), PAD_R * 2, Math.abs(thick))

  // 앞면
  const face = ctx.createRadialGradient(HINGE_X - 22, cy - ry * 0.35, 6, HINGE_X, cy, PAD_R)
  face.addColorStop(0, '#ff8a8f')
  face.addColorStop(0.45, '#f23a4c')
  face.addColorStop(1, '#b8162b')
  ctx.fillStyle = face
  ctx.beginPath()
  ctx.ellipse(HINGE_X, cy, PAD_R, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  if (ry > 10) {
    // 바느질
    ctx.setLineDash([6, 5])
    ctx.strokeStyle = 'rgba(255,220,220,0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(HINGE_X, cy, PAD_R * 0.86, ry * 0.86, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    // 과녁
    const tr = PAD_R * RING_TARGET
    const aiming = s.phase === 'aim'
    ctx.fillStyle = aiming ? 'rgba(255,240,150,0.95)' : 'rgba(255,240,200,0.85)'
    ctx.beginPath()
    ctx.ellipse(HINGE_X, cy, tr, tr * (ry / PAD_R), 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#e8344a'
    ctx.beginPath()
    ctx.ellipse(HINGE_X, cy, tr * 0.45, tr * 0.45 * (ry / PAD_R), 0, 0, Math.PI * 2)
    ctx.fill()
    // 광택
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.beginPath()
    ctx.ellipse(HINGE_X - 28, cy - ry * 0.48, 26, ry * 0.16, -0.4, 0, Math.PI * 2)
    ctx.fill()

    // 정확도 링
    if (aiming || (s.phase === 'fly' && s.t < 0.2)) {
      const rs = s.ring
      const acc = accuracyFromRing(rs)
      const col = acc >= 0.9 ? '#7dffb0' : acc >= 0.5 ? '#ffe14d' : '#9fe3ff'
      ctx.strokeStyle = col
      ctx.beginPath()
      ctx.ellipse(HINGE_X, cy, Math.max(1, PAD_R * rs), Math.max(1, ry * rs), 0, 0, Math.PI * 2)
      ctx.globalAlpha = 0.25 + acc * 0.25
      ctx.lineWidth = 12 + acc * 8
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.lineWidth = 5
      ctx.stroke()
      if (aiming) {
        // 과녁 테두리 숨쉬기
        ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(s.clock * 10)})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.ellipse(HINGE_X, cy, tr + 3, (tr + 3) * (ry / PAD_R), 0, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }
  // 경첩
  const hg = ctx.createLinearGradient(0, HINGE_Y - 9, 0, HINGE_Y + 9)
  hg.addColorStop(0, '#f4f6fa')
  hg.addColorStop(0.5, '#a9aebb')
  hg.addColorStop(1, '#5d6270')
  ctx.fillStyle = hg
  rr(ctx, HINGE_X - 56, HINGE_Y - 9, 112, 18, 9)
  ctx.fill()
}

function drawHowTo(ctx: CanvasRenderingContext2D, s: State) {
  const y0 = 258
  const bob = Math.sin(s.clock * 2.2) * 2
  ctx.save()
  ctx.translate(0, bob)
  ctx.fillStyle = 'rgba(20,12,30,0.88)'
  ctx.strokeStyle = 'rgba(255,201,60,0.7)'
  ctx.lineWidth = 2
  rr(ctx, 80, y0, 240, 192, 16)
  ctx.fill()
  ctx.stroke()
  label(ctx, '이렇게 쳐요', 200, y0 + 24, 200, 18, '#ffe14d')
  const rows: [string, string][] = [
    ['①', '오르내리는 힘 게이지를 탭!'],
    ['②', '링이 과녁에 닿을 때 다시 탭!'],
    ['③', '세 번 쳐서 최고 점수가 기록'],
  ]
  rows.forEach(([n, t], i) => {
    const y = y0 + 62 + i * 36
    ctx.fillStyle = '#ff6f7f'
    ctx.beginPath()
    ctx.arc(106, y, 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ft(ctx, n, 106, y + 1, 18, 13)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#f3ecff'
    ft(ctx, t, 126, y, 184, 14)
    ctx.textAlign = 'center'
  })
  ctx.fillStyle = 'rgba(200,190,230,0.75)'
  ft(ctx, '스페이스 · 엔터로도 칠 수 있어요', 200, y0 + 172, 220, 12)
  ctx.restore()
}

function paintLowerStatic(ctx: CanvasRenderingContext2D) {
  // 노란 아랫판
  const g = ctx.createLinearGradient(0, 480, 0, 596)
  g.addColorStop(0, '#ffd34d')
  g.addColorStop(1, '#f2a91c')
  ctx.fillStyle = g
  rr(ctx, 56, 482, 288, 106, 16)
  ctx.fill()
  ctx.strokeStyle = '#a65d00'
  ctx.lineWidth = 3
  ctx.stroke()
  // 동전 투입구
  ctx.fillStyle = '#3a2a1a'
  rr(ctx, 300, 516, 30, 52, 8)
  ctx.fill()
  ctx.fillStyle = '#111'
  rr(ctx, 312, 524, 6, 22, 3)
  ctx.fill()
  // 스피커
  ctx.fillStyle = '#c47f10'
  for (let r = 0; r < 4; r++)
    for (let cI = 0; cI < 4; cI++) {
      ctx.beginPath()
      ctx.arc(78 + cI * 10, 520 + r * 11, 2.6, 0, Math.PI * 2)
      ctx.fill()
    }
  // 스티커
  ctx.save()
  ctx.translate(200, 540)
  ctx.rotate(-0.06)
  ctx.fillStyle = '#fff'
  rr(ctx, -62, -22, 124, 44, 12)
  ctx.fill()
  ctx.strokeStyle = '#e8344a'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = '#e8344a'
  ft(ctx, '한 판 100원', 0, -5, 108, 16)
  ctx.fillStyle = '#6b5a72'
  ft(ctx, '세게! 정확하게!', 0, 12, 108, 11)
  ctx.restore()
}

function drawLowerBody(ctx: CanvasRenderingContext2D, s: State) {
  // 줄무늬 띠
  ctx.save()
  rr(ctx, 56, 482, 288, 20, [16, 16, 0, 0])
  ctx.clip()
  ctx.fillStyle = '#2b2236'
  ctx.fillRect(56, 482, 288, 20)
  ctx.fillStyle = '#ffd34d'
  for (let i = -2; i < 20; i++) {
    const x = 56 + i * 20 + ((s.clock * 14) % 20)
    ctx.beginPath()
    ctx.moveTo(x, 502)
    ctx.lineTo(x + 10, 482)
    ctx.lineTo(x + 20, 482)
    ctx.lineTo(x + 10, 502)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  const coinGlow = s.phase === 'ready' ? 0.5 + 0.5 * Math.sin(s.clock * 5) : 0.25
  ctx.fillStyle = `rgba(255,120,80,${coinGlow})`
  ctx.beginPath()
  ctx.arc(315, 556, 5, 0, Math.PI * 2)
  ctx.fill()
}

function drawGlove(ctx: CanvasRenderingContext2D, x: number, y: number, sc: number, rot: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.scale(sc, sc)
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(6, 10, 52, 56, 0, 0, Math.PI * 2)
  ctx.fill()
  // 손목 커프
  const cuff = ctx.createLinearGradient(-36, 0, 36, 0)
  cuff.addColorStop(0, '#d9dde8')
  cuff.addColorStop(0.5, '#ffffff')
  cuff.addColorStop(1, '#c9cedb')
  ctx.fillStyle = cuff
  rr(ctx, -34, 28, 68, 46, 12)
  ctx.fill()
  ctx.fillStyle = '#ff5a7a'
  ctx.fillRect(-34, 44, 68, 10)
  ctx.strokeStyle = '#1d4f9a'
  ctx.lineWidth = 3
  rr(ctx, -34, 28, 68, 46, 12)
  ctx.stroke()
  // 엄지
  ctx.fillStyle = '#3d8fe6'
  ctx.beginPath()
  ctx.ellipse(-44, 6, 17, 26, -0.35, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  // 주먹
  const m = ctx.createRadialGradient(-14, -26, 6, 0, -4, 60)
  m.addColorStop(0, '#a8dcff')
  m.addColorStop(0.5, '#5aa9f5')
  m.addColorStop(1, '#2d6fd0')
  ctx.fillStyle = m
  rr(ctx, -46, -54, 92, 92, 40)
  ctx.fill()
  ctx.stroke()
  // 손가락 마디
  ctx.strokeStyle = 'rgba(29,79,154,0.55)'
  ctx.lineWidth = 2.5
  for (const dx of [-16, 4, 22]) {
    ctx.beginPath()
    ctx.arc(dx, -40, 9, 0.2, Math.PI - 0.2)
    ctx.stroke()
  }
  // 반짝
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.ellipse(-18, -30, 14, 7, -0.5, 0, Math.PI * 2)
  ctx.fill()
  // 별 무늬
  ctx.fillStyle = '#ffe14d'
  star(ctx, 14, 6, 10, 0.2)
  ctx.fill()
  ctx.restore()
}

function drawFist(ctx: CanvasRenderingContext2D, s: State) {
  const restX = 200
  const restY = 556
  const padY = HINGE_Y + ARM
  let x = restX
  let y = restY
  let sc = 0.62
  let rot = 0
  let visible = true
  switch (s.phase) {
    case 'ready':
    case 'result':
    case 'fold':
      visible = false
      break
    case 'flip': {
      const k = easeOutBack(clamp01(s.t / 0.6))
      y = lerp(760, restY, k)
      break
    }
    case 'power':
      y = restY + Math.sin(s.clock * 6) * 4
      rot = Math.sin(s.clock * 3) * 0.05
      break
    case 'aim':
      // 힘 모으기 — 부들부들
      x += (Math.random() - 0.5) * 3 * s.power
      y = restY + 6 + (Math.random() - 0.5) * 3 * s.power
      break
    case 'fly': {
      const k = s.t / 0.2
      if (k < 0.3) {
        const b = k / 0.3
        y = restY + 22 * b
        sc = 0.62 + 0.06 * b
      } else {
        const f = easeInCubic((k - 0.3) / 0.7)
        y = lerp(restY + 22, padY, f)
        sc = lerp(0.68, 0.5, f)
      }
      rot = -0.06
      break
    }
    case 'roll': {
      const k = clamp01(s.t / 0.45)
      if (s.t < 0.1) {
        y = padY + 4
        sc = 0.5
      } else {
        const f = easeOutCubic(clamp01((s.t - 0.1) / 0.35))
        y = lerp(padY, restY + 10, f)
        sc = lerp(0.5, 0.62, f)
      }
      rot = 0.05 * (1 - k)
      break
    }
    case 'show':
      y = restY + Math.sin(s.clock * 6) * 4
      rot = Math.sin(s.clock * 8) * 0.12 // 신나서 흔들
      break
  }
  if (!visible) return
  drawGlove(ctx, x, y, sc, rot)
}

function drawFx(ctx: CanvasRenderingContext2D, s: State) {
  const cx = HINGE_X
  const cy = HINGE_Y + ARM
  // 충격파
  for (const w of s.waves) {
    if (w < 0) continue
    const k = w / 0.5
    ctx.strokeStyle = `rgba(255,240,180,${1 - k})`
    ctx.lineWidth = 10 * (1 - k) + 1
    ctx.beginPath()
    ctx.arc(cx, cy, 40 + k * 260, 0, Math.PI * 2)
    ctx.stroke()
  }
  // 집중선
  if (s.phase === 'roll' && s.t < 0.3) {
    const a = 1 - s.t / 0.3
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * a})`
    ctx.lineWidth = 3
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2 + i
      const r0 = 95 + (i % 3) * 12
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0)
      ctx.lineTo(cx + Math.cos(ang) * (r0 + 50 + (i % 4) * 16), cy + Math.sin(ang) * (r0 + 50 + (i % 4) * 16))
      ctx.stroke()
    }
  }
  // 조각
  for (const p of s.parts) {
    ctx.globalAlpha = clamp01(p.life / p.max) ** 0.7
    ctx.fillStyle = p.color
    if (p.star) {
      star(ctx, p.x, p.y, p.size, p.rot)
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
  // 글자 팝
  for (const p of s.pops) {
    const k = p.t / p.life
    const grow = easeOutBack(clamp01(p.t / 0.25))
    const a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1
    ctx.save()
    ctx.globalAlpha = clamp01(a)
    ctx.translate(p.x, p.y - k * 26)
    ctx.rotate(-0.08)
    ctx.scale(Math.max(0.05, grow), Math.max(0.05, grow))
    ctx.lineJoin = 'round'
    ctx.font = `700 ${p.size}px ${GAME_FONT}`
    ctx.strokeStyle = '#3a0d18'
    ctx.lineWidth = p.size * 0.18
    ctx.strokeText(p.text, 0, 0)
    label(ctx, p.text, 0, 0, 300, p.size, p.color, '#c2263b', p.size * 0.06)
    ctx.restore()
  }
}

// ─── 가로 화면 옆 판 ───

const RANKS: [string, string, number][] = [
  ['999', '전설의 주먹', 999],
  ['900+', '펀치왕', 900],
  ['700+', '헬스장 단골', 700],
  ['400+', '보통 주먹', 400],
  ['~399', '솜주먹', 0],
]

function sideCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  rr(ctx, x + 4, y + 6, w, h, 20)
  ctx.fill()
  ctx.fillStyle = 'rgba(34,26,56,0.92)'
  rr(ctx, x, y, w, h, 20)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,201,60,0.55)'
  ctx.lineWidth = 2
  ctx.stroke()
  label(ctx, title, x + w / 2, y + 28, w - 40, 18, '#ffe14d')
}

function drawSides(ctx: CanvasRenderingContext2D, s: State) {
  // 왼쪽: 등급표
  const lx = -250
  const w = 210
  sideCard(ctx, lx, 170, w, 300, '주먹 등급표')
  const cur = s.phase === 'show' ? s.score : s.phase === 'result' ? s.best : -1
  const curRank = cur >= 0 ? rankLabel(cur) : ''
  RANKS.forEach(([range, name], i) => {
    const y = 226 + i * 48
    const on = name === curRank
    ctx.fillStyle = on ? '#ffe14d' : 'rgba(255,255,255,0.06)'
    rr(ctx, lx + 14, y - 18, w - 28, 38, 12)
    ctx.fill()
    ctx.textAlign = 'left'
    ctx.fillStyle = on ? '#8a1424' : '#ff8a8f'
    ft(ctx, range, lx + 28, y + 1, 50, 14)
    ctx.textAlign = 'right'
    ctx.fillStyle = on ? '#3a1020' : '#f3ecff'
    ft(ctx, name, lx + w - 26, y + 1, 110, 15)
    ctx.textAlign = 'center'
  })

  // 오른쪽: 이번 판
  const rx = 440
  sideCard(ctx, rx, 170, w, 300, '이번 판')
  for (let i = 0; i < PUNCHES; i++) {
    const y = 230 + i * 56
    const revealed = i < s.scores.length && !(i === s.scores.length - 1 && (s.phase === 'fly' || s.phase === 'roll'))
    const active = i === s.punch && s.phase !== 'ready' && s.phase !== 'result' && !revealed
    ctx.fillStyle = active ? 'rgba(255,138,77,0.25)' : 'rgba(255,255,255,0.06)'
    rr(ctx, rx + 14, y - 22, w - 28, 44, 12)
    ctx.fill()
    ctx.textAlign = 'left'
    ctx.fillStyle = '#b9b2d0'
    ft(ctx, `${i + 1}번째`, rx + 28, y + 1, 60, 14)
    ctx.textAlign = 'right'
    ctx.fillStyle = revealed ? '#ffe14d' : 'rgba(255,255,255,0.3)'
    ft(ctx, revealed ? `${s.scores[i]}점` : active ? '치는 중…' : '—', rx + w - 26, y + 1, 100, 18)
    ctx.textAlign = 'center'
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(rx + 20, 404, w - 40, 2)
  ctx.fillStyle = '#b9b2d0'
  ft(ctx, '이 기기 최고 기록', rx + w / 2, 426, w - 40, 13)
  label(ctx, s.record > 0 ? `${s.record}점` : '아직 없어요', rx + w / 2, 450, w - 40, 20, '#ff8a8f')
}

// ─── 아래 버튼 · 결과 ───

function drawButton(ctx: CanvasRenderingContext2D, s: State, b: Btn, text: string, primary: boolean, enabled = true) {
  s.btns.push(b)
  const down = s.pressed === b.id && s.pressT > 0
  const lift = down ? 1 : 5
  ctx.save()
  ctx.globalAlpha = enabled ? 1 : 0.45
  ctx.fillStyle = primary ? '#8a1424' : '#2a2340'
  rr(ctx, b.x, b.y + 5, b.w, b.h, 18)
  ctx.fill()
  const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h)
  if (primary) {
    g.addColorStop(0, '#ff7084')
    g.addColorStop(1, '#e8344a')
  } else {
    g.addColorStop(0, '#5a4f80')
    g.addColorStop(1, '#3f3660')
  }
  ctx.fillStyle = g
  rr(ctx, b.x, b.y + 5 - lift, b.w, b.h, 18)
  ctx.fill()
  ctx.strokeStyle = primary ? '#ffd0d6' : 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  rr(ctx, b.x + 10, b.y + 9 - lift, b.w - 20, 10, 5)
  ctx.fill()
  label(ctx, text, b.x + b.w / 2, b.y + b.h / 2 + 5 - lift, b.w - 28, 22, '#ffffff', 'rgba(0,0,0,0.35)', 2)
  ctx.restore()
}

function drawBottom(ctx: CanvasRenderingContext2D, s: State) {
  const b: Btn = { id: 'act', x: 64, y: 620, w: 272, h: 64 }
  const pulse = 1 + Math.sin(s.clock * 5) * 0.025
  ctx.save()
  ctx.translate(200, 652)
  ctx.scale(pulse, pulse)
  ctx.translate(-200, -652)
  switch (s.phase) {
    case 'ready':
      drawButton(ctx, s, b, '누르면 시작', true)
      break
    case 'power':
      drawButton(ctx, s, b, '멈춰!', true)
      break
    case 'aim':
      drawButton(ctx, s, b, '펀치!', true)
      break
    case 'show':
      drawButton(ctx, s, b, s.punch < PUNCHES - 1 ? '다음 펀치 ▶' : '결과 보기 ▶', false)
      break
    default:
      drawButton(ctx, s, b, '…', false, false)
  }
  ctx.restore()
}

function drawResult(ctx: CanvasRenderingContext2D, s: State) {
  const k = easeOutBack(clamp01(s.t / 0.45))
  // 어둡게
  ctx.fillStyle = `rgba(10,6,20,${0.62 * clamp01(s.t / 0.3)})`
  ctx.fillRect(-2000, -2000, 5000, 5000)

  ctx.save()
  ctx.translate(200, 360)
  ctx.scale(k, k)
  ctx.translate(-200, -360)

  // 카드
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  rr(ctx, 32, 118, 336, 484, 26)
  ctx.fill()
  const cg = ctx.createLinearGradient(0, 110, 0, 600)
  cg.addColorStop(0, '#fff8e6')
  cg.addColorStop(1, '#ffe6c2')
  ctx.fillStyle = cg
  rr(ctx, 28, 110, 344, 484, 26)
  ctx.fill()
  ctx.strokeStyle = '#e8344a'
  ctx.lineWidth = 5
  ctx.stroke()
  // 머리띠
  ctx.fillStyle = '#e8344a'
  rr(ctx, 28, 110, 344, 54, [26, 26, 0, 0])
  ctx.fill()
  label(ctx, '한 판 결과', 200, 138, 260, 22, '#fff3b0', '#7a0f1e', 2)

  // 세 번 기록
  const best = s.best
  const bi = s.scores.indexOf(best)
  s.scores.forEach((sc, i) => {
    const y = 178 + i * 48
    const isBest = i === bi
    ctx.fillStyle = isBest ? '#ffe9a8' : 'rgba(0,0,0,0.04)'
    rr(ctx, 46, y, 308, 42, 12)
    ctx.fill()
    if (isBest) {
      ctx.strokeStyle = '#f2a91c'
      ctx.lineWidth = 2
      ctx.stroke()
    }
    ctx.fillStyle = '#7a5a6a'
    ft(ctx, `${i + 1}번째`, 82, y + 21, 56, 14)
    // 막대
    ctx.fillStyle = 'rgba(0,0,0,0.08)'
    rr(ctx, 116, y + 15, 140, 12, 6)
    ctx.fill()
    const fillK = clamp01((s.t - 0.3 - i * 0.12) / 0.5)
    const bw = 140 * (sc / 999) * easeOutCubic(fillK)
    if (bw > 1) {
      const bg = ctx.createLinearGradient(116, 0, 256, 0)
      bg.addColorStop(0, '#4fe08a')
      bg.addColorStop(0.6, '#ffd23c')
      bg.addColorStop(1, '#ff3b3b')
      ctx.fillStyle = bg
      rr(ctx, 116, y + 15, Math.max(12, bw), 12, 6)
      ctx.fill()
    }
    ctx.fillStyle = isBest ? '#c2263b' : '#4a3a52'
    ft(ctx, `${sc}점`, 296, y + 14, 70, 17)
    ctx.fillStyle = '#9a7f8f'
    ft(ctx, accuracyGrade(s.accs[i] ?? 0), 296, y + 31, 70, 11)
  })

  // 최고 점수 LED
  ctx.fillStyle = '#7a5a6a'
  ft(ctx, '이번 판 기록 (셋 중 최고)', 200, 348, 280, 13)
  ctx.fillStyle = '#1a0a0e'
  rr(ctx, 100, 362, 200, 80, 16)
  ctx.fill()
  const shown = rollValue(best, clamp01((s.t - 0.2) / 0.9))
  drawLed(ctx, 200, 373, 56, shown, s.clock)

  // 등급
  const rank = rankLabel(best)
  ctx.fillStyle = best >= 900 ? '#e8344a' : best >= 700 ? '#f2a91c' : best >= 400 ? '#5aa9f5' : '#b59ac2'
  rr(ctx, 110, 456, 180, 40, 20)
  ctx.fill()
  label(ctx, rank, 200, 476, 160, 20, '#ffffff', 'rgba(0,0,0,0.25)', 2)

  ctx.fillStyle = '#7a5a6a'
  ft(ctx, resultLine(best), 200, 522, 280, 15)
  ctx.fillStyle = '#a58f9c'
  ft(ctx, '판 기록은 이 기기에만 남아요', 200, 568, 280, 11)

  // 최고 기록 도장
  if (s.newBest && s.t > 0.8) {
    const sk = easeOutBack(clamp01((s.t - 0.8) / 0.3))
    ctx.save()
    ctx.translate(334, 132)
    ctx.rotate(0.22)
    ctx.scale(sk * (1 + Math.sin(s.clock * 6) * 0.04), sk * (1 + Math.sin(s.clock * 6) * 0.04))
    ctx.fillStyle = '#ffe14d'
    star(ctx, 0, 0, 40, s.clock * 0.6)
    ctx.fill()
    ctx.strokeStyle = '#c2263b'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = '#c2263b'
    ft(ctx, '최고', 0, -7, 42, 13)
    ft(ctx, '기록!', 0, 9, 42, 13)
    ctx.restore()
  }
  ctx.restore()

  // 버튼
  if (s.t > 0.3) {
    drawButton(ctx, s, { id: 'again', x: 28, y: 616, w: 186, h: 66 }, '한 판 더', true, s.t > 0.5)
    drawButton(ctx, s, { id: 'quit', x: 224, y: 616, w: 148, h: 66 }, '그만하기', false, s.t > 0.5)
  }
}
