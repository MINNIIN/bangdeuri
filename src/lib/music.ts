/**
 * 방 배경음악: 파일 없이 Web Audio로 직접 연주하는 8비트 루프.
 * 저작권 걱정이 없고, 도트 감성에 맞고, 용량도 0이다.
 * 브라우저는 사용자가 한 번 누르기 전에는 소리를 못 내게 막으므로 첫 터치 때 시작한다.
 */
import type { ThemeId } from './types'

/** 한 칸 = 8분음표. null = 쉼 */
type Line = (number | null)[]

export interface Track {
  title: string
  bpm: number
  lead: Line
  /** 리드 음색 */
  wave: OscillatorType
  bass: Line
  /** 하이햇 (1 = 침) */
  hat: number[]
}

const bassBar = (root: number): Line => [root, null, root + 12, null, root, null, root + 12, null]
const hats = (n: number, every: number) => Array.from({ length: n }, (_, i) => (i % every === 0 ? 1 : 0))

export const TRACKS: Record<ThemeId, Track> = {
  // 핑크 하트방: 통통 튀는 C장조 (C–Am–F–G)
  pink: {
    title: '하트 뿅뿅',
    bpm: 116,
    wave: 'square',
    lead: [
      76, null, 79, null, 84, 83, 79, null,
      81, null, 76, null, 72, null, 76, 79,
      77, null, 81, null, 84, null, 81, 77,
      79, null, 83, null, 86, 84, 83, 79,
    ],
    bass: [...bassBar(48), ...bassBar(45), ...bassBar(41), ...bassBar(43)],
    hat: hats(32, 2),
  },
  // 원룸 자취방: 느긋한 로파이 (Dm7–G7–Cmaj7–Am7)
  studio: {
    title: '자취방 오후',
    bpm: 84,
    wave: 'triangle',
    lead: [
      77, null, null, 74, 72, null, 69, null,
      71, null, 74, null, 77, null, 76, null,
      76, null, null, 72, 71, null, 67, null,
      69, null, 72, null, 76, null, null, null,
    ],
    bass: [
      50, null, null, null, 50, null, 57, null,
      43, null, null, null, 43, null, 50, null,
      48, null, null, null, 48, null, 55, null,
      45, null, null, null, 45, null, 52, null,
    ],
    hat: hats(32, 4),
  },
  // 밤하늘 다락방: 반짝이는 아르페지오 (Am–F–C–G)
  night: {
    title: '별 세는 밤',
    bpm: 72,
    wave: 'triangle',
    lead: [
      69, 72, 76, 81, 76, 72, 69, 72,
      65, 69, 72, 77, 72, 69, 65, 69,
      67, 72, 76, 79, 76, 72, 67, 72,
      67, 71, 74, 79, 74, 71, 67, 71,
    ],
    bass: [
      45, null, null, null, null, null, null, null,
      41, null, null, null, null, null, null, null,
      48, null, null, null, null, null, null, null,
      43, null, null, null, null, null, null, null,
    ],
    hat: hats(32, 8),
  },
}

export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12)

// ─── 켜짐/꺼짐 (이 기기에 기억) ───
const PREF_KEY = 'bangdeuri:bgm'

export function bgmEnabled() {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

function saveEnabled(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch {
    // 저장 못 해도 이번엔 그대로 간다
  }
}

// ─── 연주 ───
const LOOKAHEAD = 0.12
const VOLUME = 0.05

let ac: AudioContext | null = null
let master: GainNode | null = null
let noise: AudioBuffer | null = null
let timer = 0
let track: Track | null = null
let step = 0
let nextAt = 0
/** 턴테이블·알람처럼 다른 소리가 나는 동안은 잠깐 멈춘다 (멈춘 이유들) */
const held = new Set<string>()
const listeners = new Set<() => void>()

function audio() {
  if (ac) return ac
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ac = new Ctor()
  master = ac.createGain()
  master.gain.value = VOLUME
  master.connect(ac.destination)
  noise = ac.createBuffer(1, ac.sampleRate * 0.05, ac.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return ac
}

function tone(wave: OscillatorType, hz: number, at: number, dur: number, vol: number) {
  if (!ac || !master) return
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = wave
  osc.frequency.value = hz
  g.gain.setValueAtTime(vol, at)
  g.gain.exponentialRampToValueAtTime(0.001, at + dur)
  osc.connect(g).connect(master)
  osc.start(at)
  osc.stop(at + dur + 0.02)
}

function tick(at: number) {
  if (!ac || !master || !noise) return
  if (!track) return
  const t = track
  const len = t.lead.length
  const dur = 60 / t.bpm / 2
  const i = step % len
  const lead = t.lead[i]
  if (lead != null) tone(t.wave, midiToHz(lead), at, dur * 0.9, t.wave === 'square' ? 0.35 : 0.6)
  const bass = t.bass[i % t.bass.length]
  if (bass != null) tone('triangle', midiToHz(bass), at, dur * 1.6, 0.7)
  if (t.hat[i % t.hat.length]) {
    const src = ac.createBufferSource()
    const g = ac.createGain()
    src.buffer = noise
    g.gain.value = 0.12
    src.connect(g).connect(master)
    src.start(at)
  }
}

function schedule() {
  if (!ac || !track) return
  const dur = 60 / track.bpm / 2
  while (nextAt < ac.currentTime + LOOKAHEAD) {
    tick(nextAt)
    nextAt += dur
    step++
  }
}

function run() {
  if (!ac || timer || held.size || !track || !bgmEnabled()) return
  void ac.resume()
  nextAt = ac.currentTime + 0.05
  timer = window.setInterval(schedule, 30)
  emit()
}

function halt() {
  window.clearInterval(timer)
  timer = 0
  emit()
}

function emit() {
  for (const l of listeners) l()
}

export const bgm = {
  /** 사용자가 누를 때 불러야 소리가 난다 (브라우저 자동 재생 제한) */
  play(theme: ThemeId) {
    if (!audio()) return
    if (track !== TRACKS[theme]) {
      track = TRACKS[theme]
      step = 0
    }
    run()
  },
  stop() {
    halt()
    track = null
  },
  playing: () => timer !== 0,
  toggle(theme: ThemeId) {
    const on = !bgmEnabled()
    saveEnabled(on)
    if (on) bgm.play(theme)
    else halt()
  },
  /** 다른 소리(턴테이블·알람 등)가 날 때 잠깐 멈추고, 이유가 다 풀리면 다시 */
  hold(reason: string, on: boolean) {
    if (on) {
      held.add(reason)
      halt()
    } else if (held.delete(reason)) run()
  },
  isHeld: () => held.size > 0,
  /** 화면이 가려지면 멈췄다가 돌아오면 다시 */
  pause: halt,
  resume: run,
  subscribe(cb: () => void) {
    listeners.add(cb)
    return () => void listeners.delete(cb)
  },
}
