/**
 * 둠칫스텝 — 4줄 리듬 게임. 곡은 Web Audio로 직접 연주하는 칩튠('둠칫둠칫 동네 한 바퀴'),
 * 채보는 같은 곡 데이터에서 뽑고, 판정은 AudioContext 시계로 한다.
 */
import { useEffect, useRef, useState } from 'react'
import { GAME_FONT, type GameProps, clamp01, fitText, isMuted, saveScore, sfx, useCanvasLoop } from './kit'
import {
  LANES,
  SONG,
  WINDOWS,
  applyJudgement,
  buildChart,
  expandSong,
  judgeOffset,
  newPlay,
  rankOf,
  resultLine,
  scoreOf,
  songLength,
  stepDur,
  type ChartNote,
  type Counts,
  type Difficulty,
  type Judgement,
  type PlayState,
  type Rank,
  type StepEvent,
} from './rhythm'
import './RhythmGame.css'

const COLORS = ['#ff5fa2', '#4fd8ff', '#8dff6a', '#ffc83d']
const LIGHT = ['#ffd0e6', '#d4f6ff', '#e2ffd6', '#fff1c4']
const DEEP = ['#b02466', '#1670b0', '#2b9426', '#c07400']
const ROT = [-Math.PI / 2, Math.PI, 0, Math.PI / 2]
const KEYS: Record<string, number> = { ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3, KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 }
const KEY_LABEL = ['D', 'F', 'J', 'K']
const EQ_COLORS = Array.from({ length: 16 }, (_, i) => `hsl(${300 - (i / 16) * 120} 100% 64%)`)

const STEPS = expandSong(SONG)
const SD = stepDur(SONG.bpm)
const BEAT = SD * 4
const LEN = songLength(SONG)
/** 시작을 누르고 곡이 시작되기까지(초) */
const LEAD = 0.9
const CHARTS: Record<Difficulty, ChartNote[]> = { easy: buildChart(SONG, 'easy'), hard: buildChart(SONG, 'hard') }
/** 노트가 위에서 판정선까지 내려오는 시간(초) */
const APPROACH: Record<Difficulty, number> = { easy: 1.6, hard: 1.2 }
const VOL = 0.5
const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12)
const fmtLen = `${Math.floor(LEN / 60)}:${String(Math.round(LEN % 60)).padStart(2, '0')}`

// ─── 음악: 미리보기 스케줄러로 AudioContext 시각에 정확히 예약한다 ───

class Music {
  ac: AudioContext
  out: GainNode
  an: AnalyserNode
  private noiseBuf: AudioBuffer
  private pulse: PeriodicWave
  private thin: PeriodicWave
  private t0 = 0
  private next = 0
  private timer = 0
  private vol = -1

  constructor() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ac = new Ctor()
    const comp = this.ac.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    this.out = this.ac.createGain()
    this.out.gain.value = 0
    this.an = this.ac.createAnalyser()
    this.an.fftSize = 64
    this.an.smoothingTimeConstant = 0.6
    this.out.connect(comp).connect(this.ac.destination)
    this.out.connect(this.an)
    const n = this.ac.sampleRate * 2
    this.noiseBuf = this.ac.createBuffer(1, n, this.ac.sampleRate)
    const d = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    this.pulse = this.pulseWave(0.25)
    this.thin = this.pulseWave(0.125)
    this.syncVolume()
  }

  /** 듀티 d의 펄스파 (칩튠 소리) */
  private pulseWave(duty: number) {
    const N = 32
    const re = new Float32Array(N)
    const im = new Float32Array(N)
    for (let k = 1; k < N; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty)
    return this.ac.createPeriodicWave(re, im)
  }

  /** 우리가 듣는 곡 위치(초) — 출력 지연만큼 늦춘다 */
  songTime() {
    const lat = this.ac.outputLatency || this.ac.baseLatency || 0
    return this.ac.currentTime - this.t0 - lat
  }

  start(lead: number) {
    if (this.ac.state !== 'running') void this.ac.resume()
    this.t0 = this.ac.currentTime + lead
    this.pump()
    this.timer = window.setInterval(() => this.pump(), 25)
  }

  syncVolume() {
    const v = isMuted() ? 0 : VOL
    if (v === this.vol) return
    this.vol = v
    this.out.gain.setTargetAtTime(v, this.ac.currentTime, 0.03)
  }

  private pump() {
    const until = this.ac.currentTime + 0.16
    while (this.next < STEPS.length) {
      const t = this.t0 + this.next * SD
      if (t >= until) break
      if (t > this.ac.currentTime - 0.03) this.play(STEPS[this.next], t)
      this.next++
    }
  }

  private voice(wave: OscillatorType | PeriodicWave, hz: number, t: number, dur: number, vol: number, o: { to?: number; lp?: number; sustain?: number } = {}) {
    const osc = this.ac.createOscillator()
    if (wave instanceof PeriodicWave) osc.setPeriodicWave(wave)
    else osc.type = wave
    osc.frequency.setValueAtTime(hz, t)
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur)
    const g = this.ac.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * (o.sustain ?? 0.5)), t + dur * 0.8)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05)
    let node: AudioNode = osc
    if (o.lp) {
      const f = this.ac.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = o.lp
      node = osc.connect(f)
    }
    node.connect(g).connect(this.out)
    osc.start(t)
    osc.stop(t + dur + 0.08)
  }

  private hiss(t: number, dur: number, vol: number, type: BiquadFilterType, hz: number) {
    const src = this.ac.createBufferSource()
    src.buffer = this.noiseBuf
    const f = this.ac.createBiquadFilter()
    f.type = type
    f.frequency.value = hz
    const g = this.ac.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(this.out)
    src.start(t, Math.random() * 1.5, dur + 0.02)
  }

  private play(ev: StepEvent, t: number) {
    if (ev.kick) {
      this.voice('sine', 165, t, 0.16, 0.95, { to: 42, sustain: 0.3 })
      this.voice('triangle', 900, t, 0.012, 0.12, { to: 200 })
    }
    if (ev.snare) {
      this.hiss(t, 0.14, 0.32, 'highpass', 1400)
      this.voice('triangle', 210, t, 0.07, 0.22, { to: 130 })
    }
    if (ev.hat) this.hiss(t, ev.hat === 2 ? 0.11 : 0.035, ev.hat === 2 ? 0.1 : 0.08, 'highpass', 7800)
    if (ev.crash) this.hiss(t, 1.3, 0.16, 'highpass', 3800)
    if (ev.bass !== undefined) this.voice('square', midiHz(ev.bass), t, SD * 1.6, 0.13, { lp: 900, sustain: 0.6 })
    if (ev.arp !== undefined) this.voice(this.thin, midiHz(ev.arp), t, SD * 0.7, 0.045, { sustain: 0.3 })
    if (ev.mel) {
      const dur = ev.mel.len * SD * 0.92
      const hz = midiHz(ev.mel.midi)
      this.voice(this.pulse, hz, t, dur, 0.11, { sustain: 0.55 })
      this.voice('triangle', hz / 2, t, dur, 0.06, { sustain: 0.6 })
    }
  }

  dispose() {
    window.clearInterval(this.timer)
    try {
      this.out.disconnect()
    } catch {
      /* 이미 끊김 */
    }
    void this.ac.close().catch(() => undefined)
  }
}

// ─── 그림 도구 ───

function arrowPath(ctx: CanvasRenderingContext2D, s: number) {
  const k = s / 2
  ctx.beginPath()
  ctx.moveTo(0, -k * 0.95)
  ctx.lineTo(k * 0.95, -k * 0.02)
  ctx.lineTo(k * 0.42, -k * 0.02)
  ctx.lineTo(k * 0.42, k * 0.9)
  ctx.lineTo(-k * 0.42, k * 0.9)
  ctx.lineTo(-k * 0.42, -k * 0.02)
  ctx.lineTo(-k * 0.95, -k * 0.02)
  ctx.closePath()
}

const sprites = new Map<string, HTMLCanvasElement>()
/** 노트(눈 달린 화살표)·받침 그림을 한 번만 그려 둔다 */
function sprite(kind: 'note' | 'ghost' | 'lit', lane: number, size: number): HTMLCanvasElement {
  const s = Math.round(size)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const key = `${kind}:${lane}:${s}:${dpr}`
  const hit = sprites.get(key)
  if (hit) return hit
  const box = Math.ceil(s * 1.7)
  const cv = document.createElement('canvas')
  cv.width = cv.height = Math.ceil(box * dpr)
  const c = cv.getContext('2d')!
  c.scale(dpr, dpr)
  c.translate(box / 2, box / 2)
  c.lineJoin = 'round'
  c.save()
  c.rotate(ROT[lane])
  if (kind === 'ghost') {
    arrowPath(c, s)
    c.fillStyle = 'rgba(255,255,255,0.07)'
    c.fill()
    c.lineWidth = Math.max(2, s * 0.07)
    c.strokeStyle = 'rgba(255,255,255,0.5)'
    c.stroke()
  } else {
    c.shadowColor = COLORS[lane]
    c.shadowBlur = s * (kind === 'lit' ? 0.5 : 0.28)
    arrowPath(c, s)
    const g = c.createLinearGradient(0, -s / 2, 0, s / 2)
    g.addColorStop(0, kind === 'lit' ? '#ffffff' : LIGHT[lane])
    g.addColorStop(0.45, COLORS[lane])
    g.addColorStop(1, DEEP[lane])
    c.fillStyle = g
    c.fill()
    c.shadowBlur = 0
    c.lineWidth = Math.max(2, s * 0.075)
    c.strokeStyle = '#fff'
    c.stroke()
  }
  c.restore()
  if (kind === 'note') {
    // 눈 · 볼 (화살표 방향과 상관없이 똑바로)
    c.fillStyle = '#2a1640'
    for (const sx of [-1, 1]) {
      c.beginPath()
      c.ellipse(sx * s * 0.11, s * 0.05, s * 0.045, s * 0.06, 0, 0, Math.PI * 2)
      c.fill()
    }
    c.fillStyle = '#fff'
    for (const sx of [-1, 1]) {
      c.beginPath()
      c.arc(sx * s * 0.11 + s * 0.015, s * 0.03, s * 0.016, 0, Math.PI * 2)
      c.fill()
    }
    c.strokeStyle = '#2a1640'
    c.lineWidth = Math.max(1.2, s * 0.03)
    c.lineCap = 'round'
    c.beginPath()
    c.arc(0, s * 0.11, s * 0.04, 0.15 * Math.PI, 0.85 * Math.PI)
    c.stroke()
  }
  sprites.set(key, cv)
  return cv
}

function drawSprite(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, size: number, scale = 1) {
  const box = Math.ceil(Math.round(size) * 1.7) * scale
  ctx.drawImage(img, x - box / 2, y - box / 2, box, box)
}

const easeOut = (t: number) => 1 - (1 - t) ** 3
const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2

const JUDGE_STYLE: Record<Judgement, { text: string; a: string; b: string }> = {
  perfect: { text: 'PERFECT', a: '#fff47a', b: '#ff6fd8' },
  great: { text: 'GREAT', a: '#b6fbff', b: '#3fb8ff' },
  good: { text: 'GOOD', a: '#e3ffc9', b: '#6fdc4f' },
  miss: { text: 'MISS', a: '#c9c3dc', b: '#7b7394' },
}

/** 무대 한가운데서 춤추는 동글이 (그림자 실루엣 + 네온 테두리) */
function drawDancer(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, beat: number, energy: number, pose: number, poseK: number, alpha: number) {
  const ph = beat - Math.floor(beat)
  const bounce = Math.abs(Math.sin(Math.PI * beat)) * (0.3 + energy * 0.7)
  const odd = Math.floor(beat) % 2 === 1
  const sway = Math.sin(Math.PI * beat) * (odd ? -1 : 1) * 0.12 * (0.4 + energy)
  const squash = 1 + (ph < 0.12 ? (0.12 - ph) * 0.9 : 0)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  // 바닥 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 0.42 * (1 - bounce * 0.25), s * 0.07, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.translate(0, -bounce * s * 0.18)
  ctx.rotate(sway * 0.5)
  const neon = `hsl(${(beat * 40) % 360} 100% 70%)`
  const body = ctx.createLinearGradient(0, -s * 1.3, 0, 0)
  body.addColorStop(0, '#3a2366')
  body.addColorStop(1, '#1b1033')
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = neon
  ctx.lineWidth = Math.max(2, s * 0.035)
  /** 네온 테두리: 넓고 흐린 줄 위에 가는 줄 (shadowBlur보다 훨씬 가볍다) */
  const glow = () => {
    const lw = ctx.lineWidth
    ctx.globalAlpha = alpha * 0.25
    ctx.lineWidth = lw + Math.max(5, s * 0.08)
    ctx.stroke()
    ctx.globalAlpha = alpha
    ctx.lineWidth = lw
    ctx.stroke()
  }
  // 다리 (박마다 한쪽씩 들기)
  const lift = ph < 0.5 ? Math.sin(ph * Math.PI * 2) : 0
  for (const sx of [-1, 1]) {
    const up = (sx === 1) === odd ? lift * s * 0.12 : 0
    ctx.fillStyle = '#24163f'
    ctx.beginPath()
    ctx.roundRect(sx * s * 0.17 - s * 0.08, -s * 0.24 - up, s * 0.16, s * 0.24, s * 0.08)
    ctx.fill()
    glow()
  }
  // 몸통
  ctx.save()
  ctx.scale(1 / squash, squash)
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.5, s * 0.33, s * 0.32, 0, 0, Math.PI * 2)
  ctx.fill()
  glow()
  ctx.restore()
  // 팔: 마지막으로 친 화살표 쪽으로, 아니면 번갈아 위아래 (0 = 바깥 수평, - 는 위)
  const armAng = (sx: number) => {
    const free = (odd ? sx : -sx) > 0 ? -1.1 + Math.sin(ph * Math.PI) * 0.2 : 0.75
    let hit = free
    if (pose === 0) hit = sx < 0 ? -0.15 : 0.95
    else if (pose === 3) hit = sx > 0 ? -0.15 : 0.95
    else if (pose === 2) hit = -1.3
    else if (pose === 1) hit = 1.05
    return free + (hit - free) * clamp01(poseK)
  }
  for (const sx of [-1, 1]) {
    const a = armAng(sx)
    const sxp = sx * s * 0.27
    const syp = -s * 0.64
    const ex = sxp + sx * Math.cos(a) * s * 0.4
    const ey = syp + Math.sin(a) * s * 0.4
    ctx.lineWidth = s * 0.13
    ctx.strokeStyle = neon
    ctx.beginPath()
    ctx.moveTo(sxp, syp)
    ctx.lineTo(ex, ey)
    glow()
    ctx.lineWidth = s * 0.075
    ctx.strokeStyle = '#2a1950'
    ctx.stroke()
    // 동그란 손
    ctx.fillStyle = neon
    ctx.beginPath()
    ctx.arc(ex, ey, s * 0.07, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.lineWidth = Math.max(2, s * 0.035)
  ctx.strokeStyle = neon
  // 머리 + 귀
  const hy = -s * 1.0
  ctx.save()
  ctx.translate(0, hy)
  ctx.rotate(-sway)
  ctx.fillStyle = '#2c1a52'
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(sx * s * 0.25, -s * 0.24, s * 0.11, 0, Math.PI * 2)
    ctx.fill()
    glow()
  }
  ctx.fillStyle = '#2c1a52'
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 0.36, s * 0.32, 0, 0, Math.PI * 2)
  ctx.fill()
  glow()
  // 얼굴: 신나면 ^^ 눈
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#fff'
  ctx.lineWidth = Math.max(1.5, s * 0.035)
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    if (energy > 0.55) ctx.arc(sx * s * 0.13, s * 0.02, s * 0.055, Math.PI * 1.1, Math.PI * 1.9)
    else ctx.arc(sx * s * 0.13, -s * 0.01, s * 0.035, 0, Math.PI * 2)
    if (energy > 0.55) ctx.stroke()
    else ctx.fill()
  }
  ctx.fillStyle = 'rgba(255,120,180,0.75)'
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(sx * s * 0.22, s * 0.09, s * 0.06, s * 0.035, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.strokeStyle = '#fff'
  ctx.arc(0, s * 0.07, s * 0.05, 0.1 * Math.PI, 0.9 * Math.PI)
  ctx.stroke()
  ctx.restore()
  ctx.restore()
}

// ─── 게임 ───

type Phase = 'ready' | 'play' | 'result'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: string
  size: number
  star: boolean
}

interface Layout {
  x0: number
  colW: number
  laneW: number
  topY: number
  hitY: number
  padY: number
  padH: number
  note: number
  portrait: boolean
}

interface Game {
  phase: Phase
  diff: Difficulty
  music: Music | null
  chart: ChartNote[]
  judged: Uint8Array
  head: number
  play: PlayState
  shown: number
  clock: number
  vt: number
  held: number[]
  pressAt: number[]
  hitAt: number[]
  pose: number
  poseAt: number
  pop: { j: Judgement; at: number; combo: number } | null
  parts: Particle[]
  rings: { x: number; y: number; at: number; color: string }[]
  eq: Float32Array
  eqBuf: Uint8Array<ArrayBuffer>
  lay: Layout | null
  reported: boolean
  pointers: Map<number, number>
}

interface Result {
  score: number
  rank: Rank
  counts: Counts
  maxCombo: number
  total: number
  best: boolean
  line: string
}

function layout(w: number, h: number): Layout {
  const portrait = w / h < 1.05
  const colW = portrait ? Math.min(w - 20, 460) : Math.min(440, Math.max(320, w * 0.34))
  const laneW = colW / LANES
  const padH = portrait ? Math.max(78, Math.min(118, h * 0.15)) : Math.max(70, Math.min(96, h * 0.12))
  const padY = h - padH - (portrait ? 12 : 16)
  const note = Math.min(laneW * 0.74, 74)
  const hitY = padY - note * 0.62 - 10
  const topY = portrait ? 62 : 66
  return { x0: (w - colW) / 2, colW, laneW, topY, hitY, padY, padH, note, portrait }
}

const laneX = (L: Layout, lane: number) => L.x0 + L.laneW * (lane + 0.5)

export default function RhythmGame({ onResult, onClose }: GameProps) {
  const [phase, setPhase] = useState<Phase>('ready')
  const [diff, setDiff] = useState<Difficulty>('easy')
  const [res, setRes] = useState<Result | null>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult
  const g = useRef<Game>({
    phase: 'ready',
    diff: 'easy',
    music: null,
    chart: [],
    judged: new Uint8Array(0),
    head: 0,
    play: newPlay(),
    shown: 0,
    clock: 0,
    vt: -LEAD,
    held: [0, 0, 0, 0],
    pressAt: [-9, -9, -9, -9],
    hitAt: [-9, -9, -9, -9],
    pose: -1,
    poseAt: -9,
    pop: null,
    parts: [],
    rings: [],
    eq: new Float32Array(16),
    eqBuf: new Uint8Array(32),
    lay: null,
    reported: false,
    pointers: new Map(),
  }).current

  const start = (d: Difficulty) => {
    g.music?.dispose()
    g.music = null
    try {
      g.music = new Music()
    } catch {
      return
    }
    g.diff = d
    g.chart = CHARTS[d]
    g.judged = new Uint8Array(g.chart.length)
    g.head = 0
    g.play = newPlay()
    g.shown = 0
    g.pop = null
    g.parts = []
    g.rings = []
    g.reported = false
    g.vt = -LEAD
    g.music.start(LEAD)
    g.phase = 'play'
    setRes(null)
    setPhase('play')
  }

  const finish = () => {
    const p = g.play
    const score = scoreOf(p.counts, p.maxCombo)
    const rank = rankOf(score)
    const line = resultLine(p.counts, score)
    const best = saveScore('rhythm', score)
    g.phase = 'result'
    g.music?.dispose()
    g.music = null
    setRes({ score, rank, counts: p.counts, maxCombo: p.maxCombo, total: g.chart.length, best, line })
    setPhase('result')
    if (!g.reported) {
      g.reported = true
      onResultRef.current({ score, line })
    }
    if (rank === 'S' || rank === 'A') sfx.win()
    else sfx.coin()
  }

  const judge = (i: number, j: Judgement) => {
    g.judged[i] = 1
    g.play = applyJudgement(g.play, j)
    g.pop = { j, at: g.clock, combo: g.play.combo }
    const L = g.lay
    if (j === 'miss' || !L) return
    const lane = g.chart[i].lane
    g.hitAt[lane] = g.clock
    g.pose = lane
    g.poseAt = g.clock
    const x = laneX(L, lane)
    g.rings.push({ x, y: L.hitY, at: g.clock, color: COLORS[lane] })
    const n = j === 'perfect' ? 16 : j === 'great' ? 11 : 6
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2
      const sp = 90 + Math.random() * 260
      g.parts.push({
        x,
        y: L.hitY,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 120,
        life: 0,
        max: 0.45 + Math.random() * 0.35,
        color: k % 3 === 0 ? '#fff' : COLORS[lane],
        size: 3 + Math.random() * 4,
        star: k % 4 === 0,
      })
    }
  }

  const press = (lane: number) => {
    g.held[lane]++
    g.pressAt[lane] = g.clock
    if (g.phase !== 'play' || !g.music) return
    const t = g.music.songTime()
    for (let i = g.head; i < g.chart.length; i++) {
      const n = g.chart[i]
      if (n.t - t > WINDOWS.good) break
      if (g.judged[i] || n.lane !== lane) continue
      const j = judgeOffset(t - n.t)
      if (j) {
        judge(i, j)
        return
      }
    }
  }
  const release = (lane: number) => {
    g.held[lane] = Math.max(0, g.held[lane] - 1)
  }

  // 키보드
  const startRef = useRef(start)
  startRef.current = start
  const pressRef = useRef({ press, release })
  pressRef.current = { press, release }
  const diffRef = useRef(diff)
  diffRef.current = diff
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const lane = KEYS[e.code]
      if (lane !== undefined) {
        e.preventDefault()
        if (!e.repeat && g.phase === 'play') pressRef.current.press(lane)
        return
      }
      if ((e.code === 'Enter' || e.code === 'Space') && g.phase !== 'play' && !e.repeat) {
        e.preventDefault()
        startRef.current(diffRef.current)
      }
    }
    const up = (e: KeyboardEvent) => {
      const lane = KEYS[e.code]
      if (lane !== undefined) pressRef.current.release(lane)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [g])

  // 닫히면 소리 정리 (개발 중에는 화면 확인용 봇이 곡 시계를 읽을 수 있게)
  useEffect(() => {
    const w = window as unknown as { __rhythm?: unknown }
    if (import.meta.env.DEV) w.__rhythm = { songTime: () => (g.music ? g.music.songTime() : null), lat: () => g.music && [g.music.ac.outputLatency, g.music.ac.baseLatency] }
    return () => {
      g.music?.dispose()
      g.music = null
      if (import.meta.env.DEV) delete w.__rhythm
    }
  }, [g])

  const laneAt = (clientX: number, target: HTMLCanvasElement) => {
    const L = g.lay
    if (!L) return -1
    const x = clientX - target.getBoundingClientRect().left
    const pad = L.portrait ? 10 : 30
    if (x < L.x0 - pad || x > L.x0 + L.colW + pad) return -1
    return Math.max(0, Math.min(LANES - 1, Math.floor((x - L.x0) / L.laneW)))
  }

  const draw = (ctx: CanvasRenderingContext2D, dt: number, w: number, h: number) => {
    g.clock += dt
    const L = layout(w, h)
    g.lay = L
    const m = g.music
    let T: number
    if (m && g.phase === 'play') {
      m.syncVolume()
      const raw = m.songTime()
      g.vt += dt
      g.vt = Math.abs(raw - g.vt) > 0.05 ? raw : g.vt + (raw - g.vt) * 0.2
      T = g.vt
      // 지나간 노트는 MISS
      while (g.head < g.chart.length) {
        const n = g.chart[g.head]
        if (g.judged[g.head]) {
          g.head++
          continue
        }
        if (raw - n.t > WINDOWS.good) {
          judge(g.head, 'miss')
          g.head++
          continue
        }
        break
      }
      if (raw > LEN + 0.25 && g.head >= g.chart.length) finish()
    } else {
      T = g.clock
    }
    const beat = T / BEAT
    const beatPh = beat - Math.floor(beat)
    const pulse = g.phase === 'play' && T < 0 ? 0 : (1 - beatPh) ** 2
    const groove = g.phase === 'play' ? g.play.groove : 0.6

    // 이퀄라이저 값
    if (m && g.phase === 'play') {
      m.an.getByteFrequencyData(g.eqBuf)
      for (let i = 0; i < g.eq.length; i++) {
        const v = g.eqBuf[1 + Math.floor(i * 1.4)] / 255
        g.eq[i] += (v - g.eq[i]) * Math.min(1, dt * 18)
      }
    } else {
      for (let i = 0; i < g.eq.length; i++) {
        const v = 0.25 + 0.2 * Math.sin(g.clock * 3 + i * 0.9) * Math.sin(g.clock * 1.7 + i * 0.4) + pulse * 0.3 * (1 - i / 16)
        g.eq[i] += (v - g.eq[i]) * Math.min(1, dt * 8)
      }
    }

    // ── 배경
    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#170c2e')
    bg.addColorStop(0.55, '#2a1050')
    bg.addColorStop(1, '#100820')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    // 바닥 격자 (원근)
    const floorY = h * 0.62
    ctx.save()
    ctx.strokeStyle = `rgba(255,95,200,${0.12 + pulse * 0.12})`
    ctx.lineWidth = 1
    for (let i = -10; i <= 10; i++) {
      ctx.beginPath()
      ctx.moveTo(w / 2 + i * w * 0.02, floorY)
      ctx.lineTo(w / 2 + i * w * 0.16, h)
      ctx.stroke()
    }
    const scroll = (T * 0.6) % 1
    for (let i = 0; i < 8; i++) {
      const k = ((i + scroll) / 8) ** 2
      const y = floorY + (h - floorY) * k
      ctx.globalAlpha = k
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
    ctx.restore()
    // 조명 두 줄기
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? w * 0.12 : w * 0.88
      const ang = Math.sin(g.clock * 0.7 + i * 2) * 0.35 + (i === 0 ? 0.35 : -0.35)
      ctx.save()
      ctx.translate(sx, -10)
      ctx.rotate(ang)
      const lg = ctx.createLinearGradient(0, 0, 0, h)
      const col = i === 0 ? '255,110,220' : '90,210,255'
      lg.addColorStop(0, `rgba(${col},${0.22 + pulse * 0.12})`)
      lg.addColorStop(1, `rgba(${col},0)`)
      ctx.fillStyle = lg
      ctx.beginPath()
      ctx.moveTo(-6, 0)
      ctx.lineTo(6, 0)
      ctx.lineTo(h * 0.22, h * 1.1)
      ctx.lineTo(-h * 0.22, h * 1.1)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    // 반짝이
    for (let i = 0; i < 26; i++) {
      const x = ((i * 137.5) % 100) / 100 * w
      const y = ((i * 71.3) % 100) / 100 * h * 0.55
      const tw = 0.5 + 0.5 * Math.sin(g.clock * 2.2 + i * 1.7)
      ctx.fillStyle = `rgba(255,240,255,${0.15 + tw * 0.45})`
      const r = 1 + tw * 1.4
      ctx.fillRect(x - r / 2, y - r / 2, r, r)
    }

    // ── 이퀄라이저 (네온 막대)
    const eqDraw = (x0: number, x1: number, baseY: number, maxH: number, mirror: boolean) => {
      const n = g.eq.length
      const bw = (x1 - x0) / n
      for (let i = 0; i < n; i++) {
        const idx = mirror ? n - 1 - i : i
        const v = g.eq[idx]
        const bh = Math.max(4, v * maxH)
        const segs = Math.max(1, Math.floor(bh / 7))
        ctx.fillStyle = EQ_COLORS[idx]
        for (let sg = 0; sg < segs; sg++) {
          ctx.globalAlpha = 0.32 + 0.45 * (sg / segs)
          ctx.fillRect(x0 + i * bw + 1.5, baseY - (sg + 1) * 7 + 1, bw - 3, 5)
        }
      }
    }
    if (L.portrait) {
      eqDraw(0, w / 2, L.padY - 4, h * 0.3, true)
      eqDraw(w / 2, w, L.padY - 4, h * 0.3, false)
    } else {
      const side = L.x0 - 24
      eqDraw(16, side, L.padY + L.padH, h * 0.32, true)
      eqDraw(L.x0 + L.colW + 24, w - 16, L.padY + L.padH, h * 0.32, false)
    }
    ctx.globalAlpha = 1

    // ── 춤추는 친구
    const poseK = g.pose >= 0 ? 1 - clamp01((g.clock - g.poseAt - 0.12) / 0.25) : 0
    if (L.portrait) {
      drawDancer(ctx, w / 2, L.topY + (L.hitY - L.topY) * 0.68, Math.min(w * 0.36, (L.hitY - L.topY) * 0.42), beat, groove, g.pose, poseK, 0.3)
    } else {
      const lx = L.x0 / 2
      drawDancer(ctx, lx, h * 0.78, Math.min(L.x0 * 0.5, h * 0.3), beat, groove, g.pose, poseK, 1)
    }

    // ── 줄 판
    ctx.save()
    const colG = ctx.createLinearGradient(0, L.topY, 0, L.hitY)
    colG.addColorStop(0, 'rgba(18,10,36,0.25)')
    colG.addColorStop(1, 'rgba(18,10,36,0.72)')
    ctx.fillStyle = colG
    ctx.beginPath()
    ctx.roundRect(L.x0, L.topY - 6, L.colW, L.padY - L.topY + 2, 16)
    ctx.fill()
    ctx.strokeStyle = `rgba(255,140,230,${0.25 + pulse * 0.25})`
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
    for (let i = 1; i < LANES; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.07)'
      ctx.fillRect(L.x0 + L.laneW * i - 0.5, L.topY, 1, L.hitY - L.topY)
    }
    const approach = APPROACH[g.diff]
    const yOf = (t: number) => L.hitY - ((t - T) / approach) * (L.hitY - L.topY)
    // 마디 선
    if (g.phase === 'play') {
      const barLen = BEAT * 4
      for (let b = Math.max(0, Math.floor(T / barLen)); b * barLen < T + approach + 0.1; b++) {
        const y = yOf(b * barLen)
        if (y < L.topY || y > L.hitY) continue
        ctx.fillStyle = 'rgba(255,255,255,0.13)'
        ctx.fillRect(L.x0 + 4, y - 1, L.colW - 8, 2)
      }
    }
    // 누를 때 빛줄기
    for (let lane = 0; lane < LANES; lane++) {
      const k = g.held[lane] > 0 ? 1 : 1 - clamp01((g.clock - g.pressAt[lane]) / 0.22)
      if (k <= 0) continue
      const x = L.x0 + L.laneW * lane
      const fg = ctx.createLinearGradient(0, L.hitY, 0, L.topY + (L.hitY - L.topY) * 0.3)
      fg.addColorStop(0, `${COLORS[lane]}${Math.round(k * 120).toString(16).padStart(2, '0')}`)
      fg.addColorStop(1, `${COLORS[lane]}00`)
      ctx.fillStyle = fg
      ctx.fillRect(x + 2, L.topY, L.laneW - 4, L.hitY - L.topY)
    }
    // 판정선
    ctx.save()
    const lineG = ctx.createLinearGradient(0, L.hitY - 14, 0, L.hitY + 14)
    lineG.addColorStop(0, 'rgba(255,120,220,0)')
    lineG.addColorStop(0.5, `rgba(255,120,220,${0.3 + pulse * 0.3})`)
    lineG.addColorStop(1, 'rgba(255,120,220,0)')
    ctx.fillStyle = lineG
    ctx.fillRect(L.x0 + 6, L.hitY - 14, L.colW - 12, 28)
    ctx.fillStyle = `rgba(255,220,250,${0.55 + pulse * 0.35})`
    ctx.fillRect(L.x0 + 6, L.hitY - 1.5, L.colW - 12, 3)
    ctx.restore()
    // 받침 화살표
    for (let lane = 0; lane < LANES; lane++) {
      const x = laneX(L, lane)
      const hk = 1 - clamp01((g.clock - g.hitAt[lane]) / 0.18)
      const held = g.held[lane] > 0
      const sc = (held ? 0.88 : 1) * (1 + pulse * 0.05) + hk * 0.12
      drawSprite(ctx, sprite('ghost', lane, L.note), x, L.hitY, L.note, sc)
      if (hk > 0) {
        ctx.globalAlpha = hk
        drawSprite(ctx, sprite('lit', lane, L.note), x, L.hitY, L.note, sc)
        ctx.globalAlpha = 1
      }
    }
    // 노트
    if (g.phase === 'play') {
      ctx.save()
      ctx.beginPath()
      ctx.rect(L.x0 - L.laneW, L.topY - 4, L.colW + L.laneW * 2, L.padY - L.topY + 4)
      ctx.clip()
      for (let i = g.head; i < g.chart.length; i++) {
        const n = g.chart[i]
        if (n.t - T > approach + 0.2) break
        if (g.judged[i]) continue
        const y = yOf(n.t)
        if (y < L.topY - L.note) continue
        const intro = clamp01((y - L.topY + L.note * 0.5) / (L.note * 1.2))
        ctx.globalAlpha = intro * (y > L.hitY ? clamp01(1 - (y - L.hitY) / 60) : 1)
        const wob = 1 + Math.sin(beat * Math.PI * 2) * 0.03
        drawSprite(ctx, sprite('note', n.lane, L.note), laneX(L, n.lane), y, L.note, wob)
      }
      ctx.restore()
      ctx.globalAlpha = 1
    }
    // 위쪽은 살짝 가린다 (노트가 스르르 나타나게)
    ctx.save()
    const topFade = ctx.createLinearGradient(0, L.topY - 6, 0, L.topY + 34)
    topFade.addColorStop(0, 'rgba(23,12,46,0.9)')
    topFade.addColorStop(1, 'rgba(23,12,46,0)')
    ctx.fillStyle = topFade
    ctx.beginPath()
    ctx.roundRect(L.x0 + 2, L.topY - 4, L.colW - 4, 38, [14, 14, 0, 0])
    ctx.fill()
    ctx.restore()

    // 고리 · 파티클
    g.rings = g.rings.filter((r) => g.clock - r.at < 0.35)
    for (const r of g.rings) {
      const k = (g.clock - r.at) / 0.35
      ctx.strokeStyle = r.color
      ctx.globalAlpha = 1 - k
      ctx.lineWidth = 4 * (1 - k) + 1
      ctx.beginPath()
      ctx.arc(r.x, r.y, L.note * (0.45 + easeOut(k) * 0.6), 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    g.parts = g.parts.filter((p) => p.life < p.max)
    for (const p of g.parts) {
      p.life += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 520 * dt
      p.vx *= 1 - dt * 2
      const k = 1 - p.life / p.max
      ctx.globalAlpha = k
      ctx.fillStyle = p.color
      if (p.star) {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.life * 8)
        const r = p.size * 1.3
        ctx.beginPath()
        for (let s = 0; s < 8; s++) {
          const rr = s % 2 ? r * 0.4 : r
          ctx.lineTo(Math.cos((s * Math.PI) / 4) * rr, Math.sin((s * Math.PI) / 4) * rr)
        }
        ctx.fill()
        ctx.restore()
      } else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size * k + 1, p.size * k + 1)
    }
    ctx.globalAlpha = 1

    // ── 패드
    for (let lane = 0; lane < LANES; lane++) {
      const held = g.held[lane] > 0
      const hk = 1 - clamp01((g.clock - g.pressAt[lane]) / 0.2)
      const gap = 5
      const x = L.x0 + L.laneW * lane + gap / 2
      const pw = L.laneW - gap
      const py = L.padY + (held ? 3 : 0)
      const ph = L.padH - 4
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.beginPath()
      ctx.roundRect(x, L.padY + 4, pw, ph, 16)
      ctx.fill()
      const pg = ctx.createLinearGradient(0, py, 0, py + ph)
      pg.addColorStop(0, held ? LIGHT[lane] : COLORS[lane])
      pg.addColorStop(1, DEEP[lane])
      ctx.fillStyle = pg
      if (held || hk > 0) {
        ctx.shadowColor = COLORS[lane]
        ctx.shadowBlur = 22 * Math.max(hk, held ? 1 : 0)
      }
      ctx.beginPath()
      ctx.roundRect(x, py, pw, ph, 16)
      ctx.fill()
      ctx.shadowBlur = 0
      // 윗면 반짝
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.beginPath()
      ctx.roundRect(x + 5, py + 4, pw - 10, ph * 0.22, 10)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(x + 1, py + 1, pw - 2, ph - 2, 15)
      ctx.stroke()
      // 화살표 아이콘
      ctx.translate(x + pw / 2, py + ph * (L.portrait ? 0.5 : 0.44))
      ctx.rotate(ROT[lane])
      arrowPath(ctx, Math.min(pw, ph) * 0.48)
      ctx.fillStyle = '#fff'
      ctx.fill()
      ctx.restore()
      if (!L.portrait) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        fitText(ctx, KEY_LABEL[lane], x + pw / 2, py + ph * 0.84, pw - 8, 12)
      }
    }

    // ── 위 정보 (점수 · 그루브 · 진행)
    if (g.phase === 'play') {
      const p = g.play
      const total = g.chart.length || 1
      const live = Math.round((900_000 * (p.counts.perfect + p.counts.great * 0.7 + p.counts.good * 0.35)) / total + (100_000 * p.maxCombo) / total)
      g.shown += (live - g.shown) * Math.min(1, dt * 10)
      const hx = L.x0 + 10
      const hy = L.topY - (L.portrait ? 44 : 50)
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(255,200,240,0.8)'
      fitText(ctx, 'SCORE', hx, hy, 60, 10)
      ctx.fillStyle = '#fff'
      fitText(ctx, String(Math.round(g.shown)).padStart(7, '0'), hx, hy + 13, L.colW * 0.45, L.portrait ? 20 : 26)
      // 그루브 게이지
      const gw = L.colW * 0.42
      const gx = L.x0 + L.colW - gw - 8
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(200,240,255,0.8)'
      fitText(ctx, groove >= 0.8 ? 'GROOVE ♪ MAX' : 'GROOVE', gx + gw, hy, gw, 10)
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.beginPath()
      ctx.roundRect(gx, hy + 15, gw, 14, 7)
      ctx.fill()
      const gg = ctx.createLinearGradient(gx, 0, gx + gw, 0)
      gg.addColorStop(0, '#ff5fa2')
      gg.addColorStop(0.5, '#ffc83d')
      gg.addColorStop(1, '#8dff6a')
      ctx.fillStyle = gg
      ctx.beginPath()
      ctx.roundRect(gx, hy + 15, Math.max(14, gw * groove), 14, 7)
      ctx.fill()
      ctx.fillStyle = `rgba(255,255,255,${0.25 + pulse * 0.4})`
      ctx.fillRect(gx + 6, hy + 17, Math.max(2, gw * groove - 12), 3)
      // 진행 막대
      const prog = clamp01(T / LEN)
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.fillRect(L.x0 + 10, L.topY - 3, L.colW - 20, 3)
      ctx.fillStyle = '#ffd0f2'
      ctx.fillRect(L.x0 + 10, L.topY - 3, (L.colW - 20) * prog, 3)

      // 시작 안내
      const cx = L.x0 + L.colW / 2
      const midY = L.topY + (L.hitY - L.topY) * 0.38
      const firstT = g.chart[0]?.t ?? 0
      if (T < firstT - 0.2) {
        const k = T < firstT - 1.6 ? 1 : clamp01((firstT - 0.2 - T) / 0.4)
        ctx.globalAlpha = k
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const text = T < firstT - 1.6 ? '준비~' : '둠칫!'
        const sc = 1 + (1 - beatPh) ** 3 * 0.18
        ctx.save()
        ctx.translate(cx, midY)
        ctx.scale(sc, sc)
        ctx.fillStyle = '#fff'
        ctx.shadowColor = '#ff6fd8'
        ctx.shadowBlur = 16
        fitText(ctx, text, 0, 0, L.colW * 0.8, 34)
        ctx.restore()
        ctx.globalAlpha = 0.85 * k
        ctx.fillStyle = '#ffd6f4'
        fitText(ctx, `♪ ${SONG.title}`, cx, midY + 36, L.colW * 0.9, 13, 400)
        ctx.globalAlpha = 1
      }

      // 판정 글씨
      const pop = g.pop
      if (pop && g.clock - pop.at < 0.6) {
        const age = g.clock - pop.at
        const st = JUDGE_STYLE[pop.j]
        const sc = pop.j === 'miss' ? 1 : 0.6 + 0.4 * easeOutBack(clamp01(age / 0.16))
        const a = 1 - clamp01((age - 0.4) / 0.2)
        const py = midY + (L.portrait ? 30 : 40) - (pop.j === 'miss' ? -age * 30 : 0)
        ctx.save()
        ctx.globalAlpha = a
        ctx.translate(cx, py)
        ctx.scale(sc, sc)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const px = Math.min(40, L.colW * 0.12)
        ctx.font = `700 ${px}px ${GAME_FONT}`
        const grad = ctx.createLinearGradient(0, -px / 2, 0, px / 2)
        grad.addColorStop(0, st.a)
        grad.addColorStop(1, st.b)
        ctx.lineWidth = 6
        ctx.strokeStyle = 'rgba(30,10,50,0.85)'
        ctx.lineJoin = 'round'
        ctx.font = `700 ${px}px ${GAME_FONT}`
        const tw = ctx.measureText(st.text).width
        const fpx = tw > L.colW * 0.86 ? Math.floor((px * L.colW * 0.86) / tw) : px
        ctx.font = `700 ${fpx}px ${GAME_FONT}`
        ctx.strokeText(st.text, 0, 0)
        ctx.shadowColor = st.b
        ctx.shadowBlur = 14
        ctx.fillStyle = grad
        ctx.fillText(st.text, 0, 0)
        ctx.shadowBlur = 0
        if (pop.combo >= 3) {
          ctx.fillStyle = '#fff'
          ctx.strokeStyle = 'rgba(30,10,50,0.85)'
          ctx.lineWidth = 4
          ctx.font = `700 ${Math.round(fpx * 0.5)}px ${GAME_FONT}`
          const ct = `${pop.combo} COMBO`
          ctx.strokeText(ct, 0, fpx * 0.85)
          ctx.fillText(ct, 0, fpx * 0.85)
        }
        ctx.restore()
      }
      // 큰 콤보 숫자 (배경에 은은하게)
      if (p.combo >= 10) {
        ctx.save()
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.globalAlpha = 0.16 + pulse * 0.08
        ctx.fillStyle = '#ffffff'
        fitText(ctx, String(p.combo), cx, midY - (L.portrait ? 40 : 60), L.colW * 0.7, Math.min(80, L.colW * 0.22))
        ctx.restore()
      }
    }
  }
  const canvasRef = useCanvasLoop(draw)

  return (
    <div className="rg-root">
      <canvas
        ref={canvasRef}
        className="rg-canvas"
        onPointerDown={(e) => {
          e.preventDefault()
          const lane = laneAt(e.clientX, e.currentTarget)
          if (lane < 0) return
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            /* 괜찮다 */
          }
          g.pointers.set(e.pointerId, lane)
          press(lane)
        }}
        onPointerUp={(e) => {
          const lane = g.pointers.get(e.pointerId)
          if (lane === undefined) return
          g.pointers.delete(e.pointerId)
          release(lane)
        }}
        onPointerCancel={(e) => {
          const lane = g.pointers.get(e.pointerId)
          if (lane === undefined) return
          g.pointers.delete(e.pointerId)
          release(lane)
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {phase === 'ready' && (
        <div className="rg-overlay">
          <div className="rg-card">
            <div className="rg-disc" aria-hidden>
              <span>♪</span>
            </div>
            <div className="rg-song">{SONG.title}</div>
            <div className="rg-meta">
              {SONG.bpm} BPM · {fmtLen} · 오락실 오리지널
            </div>
            <div className="rg-diffs" role="radiogroup" aria-label="난이도">
              {(['easy', 'hard'] as const).map((d) => (
                <button
                  key={d}
                  role="radio"
                  aria-checked={diff === d}
                  className={`rg-diff rg-diff-${d}${diff === d ? ' on' : ''}`}
                  onClick={() => {
                    sfx.click()
                    setDiff(d)
                  }}
                >
                  <b>{d === 'easy' ? '쉬움' : '신나게'}</b>
                  <small>
                    {d === 'easy' ? '★★' : '★★★★'} · {CHARTS[d].length}노트
                  </small>
                </button>
              ))}
            </div>
            <ul className="rg-how">
              <li>
                <span className="rg-arrows">
                  <i>←</i>
                  <i>↓</i>
                  <i>↑</i>
                  <i>→</i>
                </span>
                화살표가 선에 닿을 때 패드를 톡!
              </li>
              <li className="rg-keys">키보드: 방향키 또는 D F J K</li>
            </ul>
            <button className="rg-start" onClick={() => start(diff)}>
              누르면 시작
            </button>
          </div>
        </div>
      )}
      {phase === 'result' && res && (
        <div className="rg-overlay">
          <div className="rg-card rg-result">
            {res.best && <div className="rg-best">최고 기록!</div>}
            <div className={`rg-rank rg-rank-${res.rank}`}>{res.rank}</div>
            <div className="rg-line">{res.line}</div>
            <div className="rg-score">{res.score.toLocaleString()}</div>
            <div className="rg-counts">
              {(['perfect', 'great', 'good', 'miss'] as const).map((j) => (
                <div key={j} className={`rg-count rg-c-${j}`}>
                  <span>{JUDGE_STYLE[j].text}</span>
                  <b>{res.counts[j]}</b>
                </div>
              ))}
            </div>
            <div className="rg-combo">
              최대 콤보 <b>{res.maxCombo}</b> / {res.total}
            </div>
            <div className="rg-btns">
              <button className="rg-start" onClick={() => start(diff)}>
                한 판 더
              </button>
              <button className="rg-quit" onClick={onClose}>
                그만하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
