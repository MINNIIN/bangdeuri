/**
 * 둠칫스텝 — 순수 로직: 곡(직접 지은 칩튠) · 곡에서 뽑는 채보 · 판정 · 점수 · 등급.
 * 소리를 내는 쪽(RhythmGame.tsx)과 채보가 같은 곡 데이터를 쓰므로 노트가 박자에 딱 맞는다.
 */

export const LANES = 4

export type Section = 'intro' | 'a' | 'b' | 'd' | 'outro'
export type Chord = 'C' | 'Am' | 'F' | 'G' | 'Em'

export interface Bar {
  chord: Chord
  /** 16칸(16분음표) 멜로디: 음 글자 · '-' 늘이기 · '.' 쉼 */
  mel: string
  sec: Section
}

export interface Song {
  title: string
  bpm: number
  bars: Bar[]
}

/** 멜로디 글자 → MIDI 음 (5=G4 … c=C5 … C=C6 … E=E6) */
const PITCH: Record<string, number> = {
  '5': 67,
  '6': 69,
  '7': 71,
  c: 72,
  d: 74,
  e: 76,
  f: 77,
  g: 79,
  a: 81,
  b: 83,
  C: 84,
  D: 86,
  E: 88,
}

export const CHORDS: Record<Chord, { root: number; tones: number[] }> = {
  C: { root: 48, tones: [60, 64, 67] },
  Am: { root: 45, tones: [57, 60, 64] },
  F: { root: 41, tones: [53, 57, 60] },
  G: { root: 43, tones: [55, 59, 62] },
  Em: { root: 40, tones: [52, 55, 59] },
}

const bars = (sec: Section, chords: Chord[], mels: string[]): Bar[] => chords.map((chord, i) => ({ chord, mel: mels[i], sec }))
const REST = '................'

/** 직접 지은 곡: 다장조 · 124 BPM · 38마디 */
export const SONG: Song = {
  title: '둠칫둠칫 동네 한 바퀴',
  bpm: 124,
  bars: [
    ...bars('intro', ['C', 'Am', 'F', 'G'], [REST, REST, REST, REST]),
    ...bars(
      'a',
      ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'],
      [
        'c-e-g-e-a-g-e-..',
        'a-C-a-g-e---d-..',
        'f-a-C-a-g-f-e-d-',
        'd-e-d-7-g-----..',
        'c-e-g-e-a-g-e-g-',
        'C---a-g-e-d-c-d-',
        'e-f-a-f-e-dcd-7-',
        'd-g-b-D-C-----..',
      ],
    ),
    ...bars(
      'b',
      ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'],
      [
        'C-C-a-C-D-C-a-g-',
        'b-g-b-D-g-----..',
        'e-g-b-a-g-e-g-a-',
        'a-C-a-g-e-----g-',
        'a-C-a-C-D-C-a-C-',
        'D-E-D-C-b-g-D-..',
        'E---D-C-g-a-C-..',
        'C-----g-e-g-C---',
      ],
    ),
    ...bars('d', ['Am', 'F', 'C', 'G'], ['e--a--e-C---a-..', 'f--a--C-D---C-..', 'g--C--g-e---g-..', 'b-b-D-D-g-b-D-E-']),
    ...bars('a', ['C', 'Am', 'F', 'G'], ['c-e-g-e-a-g-e-g-', 'C---a-g-e-d-c-d-', 'e-f-a-f-e-dcd-7-', 'd-g-b-D-C-----..']),
    ...bars(
      'b',
      ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'],
      [
        'C-C-a-C-D-C-a-g-',
        'b-g-b-D-g-----..',
        'e-g-b-a-g-e-g-a-',
        'a-C-a-g-e-----g-',
        'a-C-a-C-D-C-a-C-',
        'D-E-D-C-b-g-D-..',
        'E---D-C-g-a-C-..',
        'C-----g-e-g-C---',
      ],
    ),
    ...bars('outro', ['C', 'C'], ['C---------------', REST]),
  ],
}

/** 16분음표 한 칸의 길이(초) */
export const stepDur = (bpm: number) => 60 / bpm / 4
export const songLength = (song: Song) => song.bars.length * 16 * stepDur(song.bpm)

export interface MelNote {
  step: number
  midi: number
  len: number
}

/** 한 마디 멜로디 문자열 → 음표들 (step은 곡 전체 기준) */
export function parseMelody(mel: string, startStep: number): MelNote[] {
  const out: MelNote[] = []
  for (let i = 0; i < mel.length; i++) {
    const ch = mel[i]
    if (ch === '-') {
      if (out.length) out[out.length - 1].len++
      continue
    }
    if (ch === '.') continue
    const midi = PITCH[ch]
    if (midi === undefined) throw new Error(`모르는 음: ${ch}`)
    out.push({ step: startStep + i, midi, len: 1 })
  }
  return out
}

export interface StepEvent {
  step: number
  bar: number
  sec: Section
  chord: Chord
  mel?: MelNote
  bass?: number
  kick: boolean
  snare: boolean
  /** 0 없음 · 1 닫힌 하이햇 · 2 열린 하이햇 */
  hat: 0 | 1 | 2
  arp?: number
  /** 심벌 쾅 (구간 시작) */
  crash: boolean
}

/** 곡을 칸 단위 사건(드럼·베이스·멜로디·아르페지오)으로 펼친다 — 소리와 채보가 같이 쓴다 */
export function expandSong(song: Song): StepEvent[] {
  const out: StepEvent[] = []
  const mels = new Map<number, MelNote>()
  song.bars.forEach((b, i) => parseMelody(b.mel, i * 16).forEach((n) => mels.set(n.step, n)))
  song.bars.forEach((b, bi) => {
    const next = song.bars[bi + 1]
    const lastOfSection = !next || next.sec !== b.sec
    const firstOfSection = bi > 0 && song.bars[bi - 1].sec !== b.sec
    const ch = CHORDS[b.chord]
    for (let k = 0; k < 16; k++) {
      const step = bi * 16 + k
      const ev: StepEvent = { step, bar: bi, sec: b.sec, chord: b.chord, mel: mels.get(step), kick: false, snare: false, hat: 0, crash: false }
      if (b.sec === 'intro') {
        const full = bi >= 2
        ev.kick = full ? k % 4 === 0 : k === 0 || k === 8
        ev.snare = full && (k === 4 || k === 12)
        ev.hat = k % 2 === 0 ? 1 : 0
        if (full && k % 2 === 0) ev.bass = ch.root + (k % 4 === 2 ? 12 : 0)
      } else if (b.sec === 'outro') {
        if (bi === song.bars.length - 2 && k === 0) {
          ev.kick = true
          ev.crash = true
          ev.bass = ch.root
        }
      } else {
        ev.kick = k % 4 === 0
        ev.snare = b.sec === 'd' ? k === 12 : k === 4 || k === 12
        ev.hat = k % 4 === 2 ? 2 : b.sec === 'b' || k % 2 === 0 ? 1 : 0
        if (k % 2 === 0) ev.bass = ch.root + (k % 4 === 2 ? 12 : 0)
        if (k === 14 && b.sec !== 'd') ev.bass = ch.root + 7
        if (b.sec === 'b' || b.sec === 'd') ev.arp = ch.tones[[0, 1, 2, 1][k % 4]] + 12
        if (firstOfSection && k === 0) ev.crash = true
      }
      // 구간 끝 마디는 스네어 다다닥
      if (lastOfSection && b.sec !== 'outro' && k >= 12) ev.snare = true
      out.push(ev)
    }
  })
  return out
}

export type Difficulty = 'easy' | 'hard'

export interface ChartNote {
  /** 곡 시작부터의 초 */
  t: number
  step: number
  lane: number
}

const DEGREE = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6] // 반음 → 도레미 자리
const diatonic = (midi: number) => DEGREE[midi % 12] + 7 * Math.floor(midi / 12)
/** 높은 음일수록 오른쪽으로 돌아가며 — 같은 음은 같은 줄 */
export const laneOfMidi = (midi: number) => diatonic(midi) % LANES

/** 곡에서 채보를 뽑는다. 쉬움은 박(4칸)마다만, 신나게는 멜로디 전부 + 후렴 첫 박 동시치기 */
export function buildChart(song: Song, diff: Difficulty): ChartNote[] {
  const steps = expandSong(song)
  const sd = stepDur(song.bpm)
  const easy = diff === 'easy'
  const out: ChartNote[] = []
  const lastAt = [-99, -99, -99, -99]
  let lastStep = -99
  const nextMel = (from: number) => {
    for (let s = from + 1; s < steps.length; s++) if (steps[s].mel) return s - from
    return 99
  }
  const free = (lane: number, step: number) => step - lastAt[lane] >= 2
  const put = (step: number, lane: number) => {
    out.push({ t: step * sd, step, lane })
    lastAt[lane] = step
    lastStep = step
  }
  for (const s of steps) {
    if (s.step < 32) continue // 처음 두 마디는 몸풀기
    let lane: number | null = null
    if (s.mel && (!easy || s.step % 4 === 0)) lane = laneOfMidi(s.mel.midi)
    else if (s.kick && s.step % 4 === 0 && s.step - lastStep >= (easy ? 8 : 4) && nextMel(s.step) >= (easy ? 4 : 2)) {
      lane = laneOfMidi(CHORDS[s.chord].root + (s.step % 8 === 4 ? 7 : 0))
    }
    if (lane === null || s.step - lastStep < (easy ? 4 : 1)) continue
    let pick = -1
    for (const d of [0, 2, 1, 3]) if (free((lane + d) % LANES, s.step)) {
      pick = (lane + d) % LANES
      break
    }
    if (pick < 0) continue
    put(s.step, pick)
    if (!easy && s.sec === 'b' && s.step % 16 === 0) {
      const two = (pick + 2) % LANES
      if (free(two, s.step)) put(s.step, two)
    }
  }
  return out
}

// ─── 판정 ───

export type Judgement = 'perfect' | 'great' | 'good' | 'miss'
/** 판정 창 (초, ±) — 이보다 늦으면 MISS */
export const WINDOWS = { perfect: 0.045, great: 0.09, good: 0.14 }

/** 노트와 누른 시각의 차이(초) → 판정, 너무 멀면 null(아무 일 없음) */
export function judgeOffset(dt: number): Judgement | null {
  const a = Math.abs(dt)
  if (a <= WINDOWS.perfect) return 'perfect'
  if (a <= WINDOWS.great) return 'great'
  if (a <= WINDOWS.good) return 'good'
  return null
}

export type Counts = Record<Judgement, number>

export interface PlayState {
  combo: number
  maxCombo: number
  counts: Counts
  /** 그루브 게이지 0~1 (떨어져도 게임은 계속 — 춤추는 친구 기운만 빠진다) */
  groove: number
}

export const newPlay = (): PlayState => ({ combo: 0, maxCombo: 0, counts: { perfect: 0, great: 0, good: 0, miss: 0 }, groove: 0.5 })

const GROOVE: Record<Judgement, number> = { perfect: 0.025, great: 0.018, good: 0.006, miss: -0.06 }

export function applyJudgement(p: PlayState, j: Judgement): PlayState {
  const combo = j === 'miss' ? 0 : p.combo + 1
  return {
    combo,
    maxCombo: Math.max(p.maxCombo, combo),
    counts: { ...p.counts, [j]: p.counts[j] + 1 },
    groove: Math.max(0, Math.min(1, p.groove + GROOVE[j])),
  }
}

// ─── 점수 · 등급 ───

export const MAX_SCORE = 1_000_000

/** 정확도 90만 + 최대 콤보 10만 */
export function scoreOf(c: Counts, maxCombo: number): number {
  const total = c.perfect + c.great + c.good + c.miss
  if (!total) return 0
  const acc = (c.perfect + c.great * 0.7 + c.good * 0.35) / total
  return Math.round(900_000 * acc + (100_000 * Math.min(maxCombo, total)) / total)
}

export type Rank = 'S' | 'A' | 'B' | 'C'
export function rankOf(score: number): Rank {
  if (score >= 950_000) return 'S'
  if (score >= 850_000) return 'A'
  if (score >= 700_000) return 'B'
  return 'C'
}

/** 미니미가 말할 한 줄 (20자 미만) */
export function resultLine(c: Counts, score: number): string {
  const total = c.perfect + c.great + c.good + c.miss
  if (total > 0 && c.miss === 0) return c.great + c.good === 0 ? '올 퍼펙트!! 전설이다' : '풀콤보 달성!!'
  switch (rankOf(score)) {
    case 'S':
      return '둠칫둠칫 S랭크!'
    case 'A':
      return '리듬 좀 타는데?'
    case 'B':
      return '어깨가 들썩들썩~'
    default:
      return '발이 꼬였다…'
  }
}
