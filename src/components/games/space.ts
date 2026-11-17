/**
 * 우주 대결 — 화면 없는 규칙만: 웨이브 일정 · 움직임 패턴 · 충돌 · 점수/콤보 · 파워업 · 보스 탄막 · 화면 배치.
 * 게임 좌표: 경기장 가로는 항상 360 (세로는 화면 비율에 따라).
 */

export const WORLD_W = 360
/** 보스는 (보스 없는 시간으로) 45초마다 */
export const BOSS_EVERY = 45
/** 웨이브 하나 길이 (초) */
export const WAVE_LEN = 15
/** 콤보가 끊기기 전까지 (초) */
export const COMBO_WINDOW = 2.5

export type EnemyKind = 'jelly' | 'donut' | 'rock' | 'rockling' | 'boss'
export type Pattern = 'sine' | 'swoop' | 'dive' | 'fall'
export type PowerKind = 'spread' | 'shield' | 'magnet'
export type Volley = 'aim' | 'ring' | 'spiral'

export type Rng = () => number

/** 시드 있는 난수 (테스트용 · 게임은 Math.random) */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── 충돌 ───

export function circleHit(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx
  const dy = ay - by
  const r = ar + br
  return dx * dx + dy * dy < r * r
}

// ─── 일정 ───

export const waveAt = (t: number) => 1 + Math.floor(t / WAVE_LEN)

/** t = 보스 없이 흐른 시간, seen = 지금까지 나온 보스 수 */
export const isBossDue = (t: number, seen: number) => t >= (seen + 1) * BOSS_EVERY

/** 확산탄 3갈래가 다 맞아도 몇 초는 버티게 */
export const bossHp = (n: number) => 220 + 100 * (n - 1)

export const spawnInterval = (wave: number) => Math.max(0.9, 3 - 0.3 * (wave - 1))

export interface Spawn {
  kind: EnemyKind
  x: number
  y: number
  delay: number
  pattern: Pattern
  /** 좌우 방향 (1 / -1) */
  dir: number
}

type GroupMaker = (wave: number, rng: Rng) => Spawn[]

const jellySine: GroupMaker = (wave, rng) => {
  const n = 4 + Math.min(3, Math.floor(wave / 2))
  const x = 70 + rng() * 220
  const dir = rng() < 0.5 ? -1 : 1
  const out: Spawn[] = []
  for (let i = 0; i < n; i++) out.push({ kind: 'jelly', x, y: -24, delay: i * 0.38, pattern: 'sine', dir })
  return out
}

const rockFall: GroupMaker = (wave, rng) => {
  const n = wave >= 4 ? 2 : 1
  const out: Spawn[] = []
  for (let i = 0; i < n; i++) {
    out.push({ kind: 'rock', x: 50 + rng() * 260, y: -36, delay: i * 0.9, pattern: 'fall', dir: rng() < 0.5 ? -1 : 1 })
  }
  return out
}

const donutSwoop: GroupMaker = (wave, rng) => {
  const n = 4 + Math.min(2, Math.floor(wave / 3))
  const dir = rng() < 0.5 ? -1 : 1
  const x = dir > 0 ? -24 : WORLD_W + 24
  const y = 50 + rng() * 110
  const out: Spawn[] = []
  for (let i = 0; i < n; i++) out.push({ kind: 'donut', x, y, delay: i * 0.3, pattern: 'swoop', dir })
  return out
}

const jellyDive: GroupMaker = (wave, rng) => {
  const n = wave >= 6 ? 7 : 5
  const cx = 110 + rng() * 140
  const out: Spawn[] = []
  for (let i = 0; i < n; i++) {
    const k = i - (n - 1) / 2
    out.push({ kind: 'jelly', x: cx + k * 34, y: -24 - Math.abs(k) * 22, delay: Math.abs(k) * 0.12, pattern: 'dive', dir: k < 0 ? -1 : 1 })
  }
  return out
}

/** 다음 무리 하나 (웨이브가 오를수록 종류·수가 늘어난다) */
export function nextGroup(wave: number, rng: Rng): Spawn[] {
  const table: [GroupMaker, number][] = [
    [jellySine, 3],
    [rockFall, 1.2],
  ]
  if (wave >= 2) table.push([donutSwoop, 2.4])
  if (wave >= 3) table.push([jellyDive, 2])
  let sum = 0
  for (const [, w] of table) sum += w
  let r = rng() * sum
  let pick = table[0][0]
  for (const [g, w] of table) {
    if ((r -= w) <= 0) {
      pick = g
      break
    }
  }
  const out = pick(wave, rng)
  // 높은 웨이브에선 바위가 같이 굴러오기도
  if (wave >= 5 && pick !== rockFall && rng() < 0.35) for (const s of rockFall(1, rng)) out.push({ ...s, delay: s.delay + 0.6 })
  return out
}

// ─── 움직임 ───

/** 패턴 위치 (out을 주면 거기에 써서 돌려준다 — 매 프레임 새 객체를 안 만들려고) */
export function patternPos(p: Pattern, age: number, x0: number, y0: number, dir: number, out?: { x: number; y: number }): { x: number; y: number } {
  const tmp = out ?? { x: 0, y: 0 }
  switch (p) {
    case 'sine':
      tmp.x = x0 + Math.sin(age * 2.2) * 46 * dir
      tmp.y = y0 + 62 * age
      break
    case 'swoop':
      tmp.x = x0 + dir * 125 * age
      tmp.y = y0 + 34 * age + Math.sin(age * 2.4) * 46
      break
    case 'dive': {
      tmp.x = x0 + dir * Math.sin(age * 1.6) * 18
      if (age < 1.2) tmp.y = y0 + 100 * age - 40 * age * age
      else {
        const a = age - 1.2
        tmp.y = y0 + 62.4 + 240 * a + 70 * a * a
      }
      break
    }
    case 'fall':
      tmp.x = x0 + dir * 14 * age
      tmp.y = y0 + 48 * age
      break
  }
  return tmp
}

// ─── 바위 ───

export interface Piece {
  kind: EnemyKind
  x: number
  y: number
  vx: number
  vy: number
}

export function splitRock(rock: { kind: EnemyKind; x: number; y: number }, rng: Rng): Piece[] {
  if (rock.kind !== 'rock') return []
  const n = rng() < 0.4 ? 3 : 2
  const out: Piece[] = []
  for (let i = 0; i < n; i++) {
    const k = i - (n - 1) / 2
    out.push({ kind: 'rockling', x: rock.x + k * 10, y: rock.y, vx: (k === 0 ? (rng() - 0.5) * 20 : k * 80) + (rng() - 0.5) * 16, vy: 50 + rng() * 40 })
  }
  return out
}

// ─── 조종사 상태 (점수 · 목숨 · 파워업) ───

export interface Pilot {
  score: number
  lives: number
  combo: number
  comboT: number
  bestCombo: number
  invuln: number
  /** 0~2 */
  spread: number
  shield: boolean
  magnet: number
  kills: number
}

export const newPilot = (): Pilot => ({ score: 0, lives: 3, combo: 0, comboT: 0, bestCombo: 0, invuln: 0, spread: 0, shield: false, magnet: 0, kills: 0 })

const SCORES: Record<EnemyKind, number> = { jelly: 100, donut: 150, rock: 200, rockling: 60, boss: 5000 }
export const killScore = (k: EnemyKind) => SCORES[k]

export const comboMult = (combo: number) => Math.min(5, 1 + Math.floor(combo / 8) * 0.5)

/** 처치 · 얻은 점수를 돌려준다 */
export function registerKill(p: Pilot, kind: EnemyKind): number {
  const pts = Math.round(killScore(kind) * comboMult(p.combo))
  p.combo++
  p.bestCombo = Math.max(p.bestCombo, p.combo)
  p.comboT = COMBO_WINDOW
  p.score += pts
  p.kills++
  return pts
}

/** 별 줍기 */
export function collectStar(p: Pilot): number {
  const pts = Math.round(50 * comboMult(p.combo))
  p.score += pts
  return pts
}

export function tickPilot(p: Pilot, dt: number) {
  if (p.combo > 0) {
    p.comboT -= dt
    if (p.comboT <= 0) {
      p.combo = 0
      p.comboT = 0
    }
  }
  p.invuln = Math.max(0, p.invuln - dt)
  p.magnet = Math.max(0, p.magnet - dt)
}

/** 파워업 · 이미 꽉 찬 확산탄은 점수로. 얻은 점수를 돌려준다 */
export function applyPowerUp(p: Pilot, k: PowerKind): number {
  if (k === 'spread') {
    if (p.spread < 2) p.spread++
    else {
      p.score += 500
      return 500
    }
  } else if (k === 'shield') p.shield = true
  else p.magnet = 10
  return 0
}

export type Damage = 'none' | 'shield' | 'hurt' | 'dead'

export function damagePlayer(p: Pilot): Damage {
  if (p.invuln > 0) return 'none'
  if (p.shield) {
    p.shield = false
    p.invuln = 1
    return 'shield'
  }
  p.lives--
  p.combo = 0
  p.comboT = 0
  p.spread = Math.max(0, p.spread - 1)
  p.invuln = 2
  return p.lives <= 0 ? 'dead' : 'hurt'
}

const SHOTS: readonly (readonly number[])[] = [[0], [-0.14, 0, 0.14], [-0.28, -0.13, 0, 0.13, 0.28]]
export const shotAngles = (level: number) => SHOTS[Math.max(0, Math.min(2, level))]

// ─── 보스 탄막 ───

export interface Vel {
  vx: number
  vy: number
}

/** 보스 탄 한 번 (bx,by 보스, px,py 플레이어, t 보스 나이) */
export function bossVolley(kind: Volley, t: number, bx: number, by: number, px: number, py: number): Vel[] {
  const out: Vel[] = []
  if (kind === 'aim') {
    const a = Math.atan2(py - by, px - bx)
    for (let i = -1; i <= 1; i++) out.push({ vx: Math.cos(a + i * 0.26) * 165, vy: Math.sin(a + i * 0.26) * 165 })
  } else if (kind === 'ring') {
    const n = 14
    const gap = Math.floor(t * 3) % n
    const rot = t * 0.5
    for (let i = 0; i < n; i++) {
      if (i === gap || i === (gap + 1) % n) continue
      const a = rot + (i / n) * Math.PI * 2
      out.push({ vx: Math.cos(a) * 115, vy: Math.sin(a) * 115 })
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const a = t * 2.2 + (i * Math.PI) / 2
      out.push({ vx: Math.cos(a) * 135, vy: Math.sin(a) * 135 })
    }
  }
  return out
}

// ─── 화면 배치 ───

export interface Field {
  x: number
  y: number
  w: number
  h: number
  /** 옆 패널을 그리는지 (넓은 화면) */
  side: boolean
}

export function playfield(w: number, h: number): Field {
  if (w > h * 0.85) {
    const fw = Math.min(Math.round(h * 0.31) * 2, 520, w)
    return { x: Math.round((w - fw) / 2), y: 0, w: fw, h, side: true }
  }
  return { x: 0, y: 0, w, h, side: false }
}

// ─── 결과 한 줄 ───

export function resultLine(score: number, wave: number, best: boolean, lostToBoss: boolean): string {
  if (best) return '우주 슈팅 최고 기록!'
  if (lostToBoss) return '보스한테 졌다…'
  if (wave >= 4) return `웨이브 ${wave}까지 버텼다!`
  return `우주 대결 ${score.toLocaleString()}점!`
}
