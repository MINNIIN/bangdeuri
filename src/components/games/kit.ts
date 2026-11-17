/**
 * 미니게임 공통 도구: 소리(파일 없이 Web Audio) · 최고 기록(이 기기에만) · 캔버스 크기 맞추기 · 게임 루프.
 * 게임 하나 = src/components/games/<Name>Game.tsx, GameProps를 받는다.
 */
import { useEffect, useRef } from 'react'
import { bgm } from '../../lib/music'

export type GameId = 'claw' | 'punch' | 'race' | 'rhythm' | 'space'

/** 게임이 끝나면 미니미가 말할 한 줄 (예: '곰돌이 뽑았다!!', '펀치 912점!') */
export interface GameResult {
  score: number
  line: string
}

export interface GameProps {
  /** 판이 끝날 때마다 (여러 판 할 수 있다) */
  onResult: (r: GameResult) => void
  /** 닫기 (게임 안의 ✕ 버튼은 GameHost가 그린다) */
  onClose: () => void
}

// ─── 소리 ───

let ac: AudioContext | null = null
let master: GainNode | null = null
let muted = (() => {
  try {
    return localStorage.getItem('bd:game:mute') === '1'
  } catch {
    return false
  }
})()

function audio(): { c: AudioContext; out: GainNode } | null {
  if (!ac) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ac = new Ctor()
    master = ac.createGain()
    master.gain.value = muted ? 0 : 0.6
    master.connect(ac.destination)
  }
  if (ac.state !== 'running') void ac.resume()
  return { c: ac, out: master! }
}

export interface ToneOpts {
  wave?: OscillatorType
  vol?: number
  /** 끝 주파수 (미끄러지는 소리) */
  to?: number
  /** 시작까지 기다리는 초 */
  delay?: number
}

/** 삑 한 번 (hz, 초) */
export function tone(hz: number, dur: number, o: ToneOpts = {}) {
  const a = audio()
  if (!a) return
  const t = a.c.currentTime + 0.005 + (o.delay ?? 0)
  const osc = a.c.createOscillator()
  const g = a.c.createGain()
  osc.type = o.wave ?? 'square'
  osc.frequency.setValueAtTime(hz, t)
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur)
  g.gain.setValueAtTime(o.vol ?? 0.15, t)
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur)
  osc.connect(g).connect(a.out)
  osc.start(t)
  osc.stop(t + dur + 0.03)
}

/** 치익·쾅 같은 잡음 (lowpass Hz로 둔탁함 조절) */
export function noise(dur: number, o: { vol?: number; lowpass?: number; delay?: number } = {}) {
  const a = audio()
  if (!a) return
  const t = a.c.currentTime + 0.005 + (o.delay ?? 0)
  const n = Math.max(1, Math.floor(a.c.sampleRate * dur))
  const buf = a.c.createBuffer(1, n, a.c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
  const src = a.c.createBufferSource()
  src.buffer = buf
  const f = a.c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = o.lowpass ?? 4000
  const g = a.c.createGain()
  g.gain.value = o.vol ?? 0.25
  src.connect(f).connect(g).connect(a.out)
  src.start(t)
}

/** 자주 쓰는 효과음 */
export const sfx = {
  coin: () => {
    tone(988, 0.07, { wave: 'square', vol: 0.12 })
    tone(1319, 0.22, { wave: 'square', vol: 0.12, delay: 0.07 })
  },
  click: () => tone(660, 0.04, { wave: 'triangle', vol: 0.12 }),
  hit: () => noise(0.18, { vol: 0.4, lowpass: 900 }),
  boom: () => {
    noise(0.5, { vol: 0.45, lowpass: 600 })
    tone(140, 0.4, { wave: 'sawtooth', vol: 0.12, to: 40 })
  },
  win: () => [523, 659, 784, 1047].forEach((hz, i) => tone(hz, 0.16, { wave: 'square', vol: 0.12, delay: i * 0.09 })),
  lose: () => [392, 330, 262].forEach((hz, i) => tone(hz, 0.22, { wave: 'triangle', vol: 0.14, delay: i * 0.14 })),
  /** 0~1 진행에 따라 올라가는 삑 (게이지 · 집게 내려가기 등) */
  rise: (k: number) => tone(300 + k * 700, 0.05, { wave: 'triangle', vol: 0.08 }),
}

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  try {
    localStorage.setItem('bd:game:mute', m ? '1' : '0')
  } catch {
    /* 저장 못 해도 이번엔 적용 */
  }
  if (master) master.gain.value = m ? 0 : 0.6
}

/** 게임 화면이 열려 있는 동안 배경음악을 잠깐 멈춘다 */
export function useHoldBgm() {
  useEffect(() => {
    const reason = `game:${Math.random()}`
    bgm.hold(reason, true)
    return () => bgm.hold(reason, false)
  }, [])
}

// ─── 최고 기록 (이 기기에만 · 서버에 안 보낸다) ───

export function bestScore(game: GameId): number {
  try {
    return Number(localStorage.getItem(`bd:game:best:${game}`)) || 0
  } catch {
    return 0
  }
}
/** 기록을 남기고, 새 최고 기록이면 true */
export function saveScore(game: GameId, score: number): boolean {
  const old = bestScore(game)
  if (score <= old) return false
  try {
    localStorage.setItem(`bd:game:best:${game}`, String(Math.round(score)))
  } catch {
    /* 저장 못 해도 게임은 계속 */
  }
  return true
}

// ─── 캔버스 · 루프 ───

/**
 * 캔버스를 부모 크기에 맞추고(기기 화소 비율 반영) 매 프레임 draw(ctx, dt초, 논리 너비, 논리 높이)를 부른다.
 * 게임 좌표는 논리 크기(CSS px)로 쓰면 된다.
 */
export function useCanvasLoop(draw: (ctx: CanvasRenderingContext2D, dt: number, w: number, h: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef(draw)
  drawRef.current = draw
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    let w = 0
    let h = 0
    const fit = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      w = r.width
      h = r.height
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(cv)
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (w > 0 && h > 0) drawRef.current(ctx, dt, w, h)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])
  return ref
}

export const GAME_FONT = 'Galmuri11, system-ui, sans-serif'

/** 글씨가 maxW를 넘으면 글자 크기를 줄여서 그린다 */
export function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, px: number, weight = 700) {
  ctx.font = `${weight} ${px}px ${GAME_FONT}`
  const w = ctx.measureText(text).width
  if (w > maxW) ctx.font = `${weight} ${Math.max(6, Math.floor((px * maxW) / w))}px ${GAME_FONT}`
  ctx.fillText(text, x, y)
}

/** 0~1 사이로 */
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
