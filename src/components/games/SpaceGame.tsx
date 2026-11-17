/**
 * 우주 대결 — PC방 신작 세로 슈팅.
 * 드래그(손가락을 따라 상대 이동) 또는 ←→↑↓/WASD로 움직이고, 총알은 자동으로 나간다.
 * 규칙(일정·충돌·점수·파워업·보스 탄막)은 space.ts, 여기는 그리기와 입력.
 */
import { useEffect, useState } from 'react'
import { GAME_FONT, bestScore, fitText, noise, saveScore, sfx, tone, useCanvasLoop, type GameProps } from './kit'
import {
  WORLD_W,
  applyPowerUp,
  bossHp,
  bossVolley,
  circleHit,
  collectStar,
  comboMult,
  damagePlayer,
  isBossDue,
  newPilot,
  nextGroup,
  patternPos,
  playfield,
  registerKill,
  resultLine,
  shotAngles,
  spawnInterval,
  splitRock,
  tickPilot,
  waveAt,
  type EnemyKind,
  type Field,
  type Pattern,
  type Pilot,
  type PowerKind,
  type Spawn,
  type Volley,
} from './space'
import './SpaceGame.css'

// ─── 상태 ───

interface Enemy {
  on: boolean
  kind: EnemyKind
  pattern: Pattern
  x0: number
  y0: number
  dir: number
  age: number
  x: number
  y: number
  vx: number
  vy: number
  hp: number
  r: number
  flash: number
  fireT: number
  spin: number
  /** 바위 모양 (꼭짓점 반지름 비율) */
  shape: number[]
  hue: number
}
interface Bullet {
  on: boolean
  x: number
  y: number
  vx: number
  vy: number
  r: number
  /** 0 내 총알 · 1 분홍 · 2 노랑 · 3 주황 */
  look: number
}
interface Particle {
  on: boolean
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  /** 0 점 · 1 고리 · 2 반짝 */
  kind: number
}
interface Pickup {
  on: boolean
  kind: 'star' | PowerKind
  x: number
  y: number
  vx: number
  vy: number
  age: number
}
interface Popup {
  on: boolean
  x: number
  y: number
  text: string
  life: number
  color: string
  size: number
}
type BossMode = 'enter' | 'aim' | 'ring' | 'spiral' | 'rest'
interface Boss {
  on: boolean
  x: number
  y: number
  hp: number
  max: number
  age: number
  mode: BossMode
  modeT: number
  fireT: number
  step: number
  /** BOSS_CYCLE 안의 자리 */
  cyc: number
  flash: number
  dying: number
}
type Phase = 'ready' | 'play' | 'dying' | 'over'

interface Game {
  phase: Phase
  time: number
  phaseT: number
  pilot: Pilot
  ship: { x: number; y: number; tilt: number; fireT: number }
  enemies: Enemy[]
  shots: Bullet[]
  ebullets: Bullet[]
  parts: Particle[]
  picks: Pickup[]
  pops: Popup[]
  queue: { t: number; s: Spawn }[]
  boss: Boss
  bossesSeen: number
  bossWarn: number
  stageT: number
  spawnT: number
  wave: number
  banner: { text: string; sub: string; t: number; color: string }
  shake: number
  hurt: number
  flashW: number
  scroll: number
  lostToBoss: boolean
  result: { score: number; wave: number; best: boolean; combo: number; prevBest: number } | null
  reported: boolean
  keys: Set<string>
  drag: { id: number; x: number; y: number } | null
  /** 화면 → 게임 좌표 */
  view: { f: Field; s: number; H: number; w: number; h: number }
  buttons: { again: Rect; quit: Rect } | null
  pewFlip: boolean
  /** 이 기기 최고 기록 (매 프레임 저장소를 안 읽게) */
  best: number
}
interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const CAP = { enemies: 48, shots: 90, ebullets: 220, parts: 280, picks: 60, pops: 20 }

const mkEnemy = (): Enemy => ({ on: false, kind: 'jelly', pattern: 'sine', x0: 0, y0: 0, dir: 1, age: 0, x: 0, y: 0, vx: 0, vy: 0, hp: 1, r: 14, flash: 0, fireT: 0, spin: 0, shape: [], hue: 0 })
const mkBullet = (): Bullet => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, r: 4, look: 0 })
const mkPart = (): Particle => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', kind: 0 })
const mkPick = (): Pickup => ({ on: false, kind: 'star', x: 0, y: 0, vx: 0, vy: 0, age: 0 })
const mkPop = (): Popup => ({ on: false, x: 0, y: 0, text: '', life: 0, color: '#fff', size: 12 })

/** 풀에서 꺼낸다 · 꽉 찼으면 null (입자 등은 그냥 생략) */
function grab<T extends { on: boolean }>(pool: T[], cap: number, mk: () => T): T | null {
  for (let i = 0; i < pool.length; i++) if (!pool[i].on) return pool[i]
  if (pool.length >= cap) return null
  const o = mk()
  pool.push(o)
  return o
}

function newGame(): Game {
  return {
    phase: 'ready',
    time: 0,
    phaseT: 0,
    pilot: newPilot(),
    ship: { x: WORLD_W / 2, y: 480, tilt: 0, fireT: 0 },
    enemies: [],
    shots: [],
    ebullets: [],
    parts: [],
    picks: [],
    pops: [],
    queue: [],
    boss: { on: false, x: 180, y: -80, hp: 1, max: 1, age: 0, mode: 'enter', modeT: 0, fireT: 0, step: 0, cyc: 0, flash: 0, dying: 0 },
    bossesSeen: 0,
    bossWarn: 0,
    stageT: 0,
    spawnT: 1.2,
    wave: 1,
    banner: { text: '', sub: '', t: 0, color: '#fff' },
    shake: 0,
    hurt: 0,
    flashW: 0,
    scroll: 0,
    lostToBoss: false,
    result: null,
    reported: false,
    keys: new Set(),
    drag: null,
    view: { f: { x: 0, y: 0, w: 360, h: 600, side: false }, s: 1, H: 600, w: 360, h: 600 },
    buttons: null,
    pewFlip: false,
    best: bestScore('space'),
  }
}

function resetRound(g: Game) {
  g.pilot = newPilot()
  g.ship.x = WORLD_W / 2
  g.ship.y = g.view.H - 96
  g.ship.fireT = 0.3
  for (const a of [g.enemies, g.shots, g.ebullets, g.parts, g.picks, g.pops]) for (const o of a) o.on = false
  g.queue.length = 0
  g.boss.on = false
  g.bossesSeen = 0
  g.bossWarn = 0
  g.stageT = 0
  g.spawnT = 1.2
  g.wave = 1
  g.shake = 0
  g.hurt = 0
  g.lostToBoss = false
  g.result = null
  g.reported = false
  g.phase = 'play'
  g.phaseT = 0
  g.buttons = null
  showBanner(g, '웨이브 1', '별을 모아요!', '#9ff7ff')
}

function showBanner(g: Game, text: string, sub: string, color: string) {
  g.banner.text = text
  g.banner.sub = sub
  g.banner.t = 2.2
  g.banner.color = color
}

// ─── 소리 ───

const snd = {
  pew: () => tone(1250, 0.06, { wave: 'square', vol: 0.025, to: 620 }),
  pop: () => {
    noise(0.16, { vol: 0.22, lowpass: 1800 })
    tone(520, 0.12, { wave: 'triangle', vol: 0.08, to: 180 })
  },
  big: () => sfx.boom(),
  star: () => tone(1480 + Math.random() * 300, 0.07, { wave: 'triangle', vol: 0.06 }),
  power: () => [660, 880, 1175, 1568].forEach((hz, i) => tone(hz, 0.1, { wave: 'square', vol: 0.08, delay: i * 0.06 })),
  hurt: () => {
    noise(0.25, { vol: 0.35, lowpass: 900 })
    tone(330, 0.3, { wave: 'sawtooth', vol: 0.12, to: 90 })
  },
  shield: () => {
    tone(900, 0.18, { wave: 'sine', vol: 0.12, to: 300 })
    noise(0.12, { vol: 0.15, lowpass: 3000 })
  },
  alarm: () => {
    for (let i = 0; i < 3; i++) {
      tone(620, 0.22, { wave: 'square', vol: 0.07, to: 920, delay: i * 0.5 })
      tone(920, 0.22, { wave: 'square', vol: 0.07, to: 620, delay: i * 0.5 + 0.24 })
    }
  },
  ebullet: () => tone(300, 0.08, { wave: 'triangle', vol: 0.04, to: 520 }),
}

// ─── 입자 · 글씨 ───

function burst(g: Game, x: number, y: number, color: string, n: number, speed: number, size: number, life: number) {
  for (let i = 0; i < n; i++) {
    const p = grab(g.parts, CAP.parts, mkPart)
    if (!p) return
    const a = Math.random() * Math.PI * 2
    const v = speed * (0.3 + Math.random() * 0.7)
    p.on = true
    p.x = x
    p.y = y
    p.vx = Math.cos(a) * v
    p.vy = Math.sin(a) * v
    p.max = p.life = life * (0.6 + Math.random() * 0.5)
    p.size = size * (0.6 + Math.random() * 0.6)
    p.color = color
    p.kind = Math.random() < 0.25 ? 2 : 0
  }
}
function ring(g: Game, x: number, y: number, color: string, size: number, life: number) {
  const p = grab(g.parts, CAP.parts, mkPart)
  if (!p) return
  p.on = true
  p.x = x
  p.y = y
  p.vx = p.vy = 0
  p.max = p.life = life
  p.size = size
  p.color = color
  p.kind = 1
}
function popup(g: Game, x: number, y: number, text: string, color: string, size = 12) {
  const p = grab(g.pops, CAP.pops, mkPop)
  if (!p) return
  p.on = true
  p.x = x
  p.y = y
  p.text = text
  p.life = 0.9
  p.color = color
  p.size = size
}

const ENEMY_COLOR: Record<EnemyKind, string> = { jelly: '#7cf5c8', donut: '#ff8fc8', rock: '#c8a98a', rockling: '#c8a98a', boss: '#c9a2ff' }

// ─── 생성 ───

function spawnEnemy(g: Game, s: Spawn) {
  const e = grab(g.enemies, CAP.enemies, mkEnemy)
  if (!e) return
  e.on = true
  e.kind = s.kind
  e.pattern = s.pattern
  e.x0 = e.x = s.x
  e.y0 = e.y = s.y
  e.dir = s.dir
  e.age = 0
  e.vx = e.vy = 0
  e.flash = 0
  e.spin = Math.random() * 6
  e.hue = s.pattern === 'dive' ? 1 : 0
  e.fireT = 1.4 + Math.random() * 2.5
  if (s.kind === 'jelly') {
    e.hp = 2
    e.r = 14
  } else if (s.kind === 'donut') {
    e.hp = 3
    e.r = 15
  } else {
    e.hp = 8
    e.r = 24
    makeShape(e)
  }
}
function makeShape(e: Enemy) {
  e.shape.length = 0
  for (let i = 0; i < 10; i++) e.shape.push(0.82 + Math.random() * 0.22)
}

function fireEnemy(g: Game, x: number, y: number, vx: number, vy: number, look: number, r = 5) {
  const b = grab(g.ebullets, CAP.ebullets, mkBullet)
  if (!b) return
  b.on = true
  b.x = x
  b.y = y
  b.vx = vx
  b.vy = vy
  b.r = r
  b.look = look
}

function drop(g: Game, kind: Pickup['kind'], x: number, y: number) {
  const p = grab(g.picks, CAP.picks, mkPick)
  if (!p) return
  p.on = true
  p.kind = kind
  p.x = x
  p.y = y
  p.vx = (Math.random() - 0.5) * 60
  p.vy = kind === 'star' ? -60 - Math.random() * 60 : -30
  p.age = 0
}

function killEnemy(g: Game, e: Enemy) {
  e.on = false
  const pts = registerKill(g.pilot, e.kind)
  const col = e.kind === 'jelly' && e.hue ? '#c59bff' : ENEMY_COLOR[e.kind]
  burst(g, e.x, e.y, col, e.kind === 'rock' ? 22 : 14, 170, 3.2, 0.6)
  burst(g, e.x, e.y, '#fff6c8', 6, 120, 2, 0.35)
  ring(g, e.x, e.y, col, e.r * 2.2, 0.35)
  popup(g, e.x, e.y - 8, `+${pts}`, g.pilot.combo >= 8 ? '#ffd94a' : '#ffffff', g.pilot.combo >= 8 ? 14 : 12)
  g.shake = Math.max(g.shake, e.kind === 'rock' ? 6 : 3)
  snd.pop()
  if (e.kind === 'rock') {
    for (const k of splitRock(e, Math.random)) {
      const c = grab(g.enemies, CAP.enemies, mkEnemy)
      if (!c) break
      c.on = true
      c.kind = 'rockling'
      c.pattern = 'fall'
      c.x = c.x0 = k.x
      c.y = c.y0 = k.y
      c.vx = k.vx
      c.vy = k.vy
      c.dir = 1
      c.age = 0
      c.hp = 2
      c.r = 12
      c.flash = 0
      c.spin = Math.random() * 6
      c.hue = 0
      c.fireT = 99
      makeShape(c)
    }
  }
  const nStar = e.kind === 'rockling' ? (Math.random() < 0.5 ? 1 : 0) : e.kind === 'rock' ? 3 : Math.random() < 0.7 ? 1 : 2
  for (let i = 0; i < nStar; i++) drop(g, 'star', e.x, e.y)
  const pChance = e.kind === 'donut' ? 0.1 : e.kind === 'rock' ? 0.14 : 0.05
  if (Math.random() < pChance) drop(g, randomPower(g), e.x, e.y)
}

function randomPower(g: Game): PowerKind {
  const r = Math.random()
  if (g.pilot.spread < 2 && r < 0.45) return 'spread'
  if (r < 0.75) return 'shield'
  return 'magnet'
}

// ─── 한 프레임 ───

function step(g: Game, dt: number, finish: (g: Game) => void) {
  g.time += dt
  g.phaseT += dt
  const H = g.view.H
  g.scroll += dt * (g.phase === 'play' ? 1 : 0.5)
  g.shake = Math.max(0, g.shake - dt * 30)
  g.hurt = Math.max(0, g.hurt - dt * 2)
  g.flashW = Math.max(0, g.flashW - dt * 3)
  g.banner.t = Math.max(0, g.banner.t - dt)

  const ship = g.ship
  if (g.phase === 'ready' || g.phase === 'over') {
    ship.x += (WORLD_W / 2 - ship.x) * Math.min(1, dt * 3)
    ship.y = H - 110 + Math.sin(g.time * 2) * 6
    ship.tilt *= 0.9
    stepParts(g, dt)
    return
  }

  const d = g.phase === 'dying' ? dt * 0.4 : dt
  const p = g.pilot

  if (g.phase === 'dying' && g.phaseT > 1.5) {
    finish(g)
    return
  }

  // 움직이기 (키보드)
  if (g.phase === 'play') {
    let kx = 0
    let ky = 0
    const k = g.keys
    if (k.has('ArrowLeft') || k.has('a') || k.has('A')) kx -= 1
    if (k.has('ArrowRight') || k.has('d') || k.has('D')) kx += 1
    if (k.has('ArrowUp') || k.has('w') || k.has('W')) ky -= 1
    if (k.has('ArrowDown') || k.has('s') || k.has('S')) ky += 1
    const before = ship.x
    ship.x += kx * 270 * d
    ship.y += ky * 240 * d
    clampShip(g)
    ship.tilt += ((ship.x - before) / Math.max(d, 0.001) / 900 - ship.tilt) * Math.min(1, d * 10)
    ship.tilt = Math.max(-0.35, Math.min(0.35, ship.tilt))
  }
  tickPilot(p, d)

  // 자동 사격
  if (g.phase === 'play') {
    ship.fireT -= d
    if (ship.fireT <= 0) {
      ship.fireT = 0.11
      for (const a of shotAngles(p.spread)) {
        const b = grab(g.shots, CAP.shots, mkBullet)
        if (!b) break
        b.on = true
        b.x = ship.x + Math.sin(a) * 6
        b.y = ship.y - 20
        b.vx = Math.sin(a) * 640
        b.vy = -Math.cos(a) * 640
        b.r = 4
        b.look = 0
      }
      g.pewFlip = !g.pewFlip
      if (g.pewFlip) snd.pew()
    }
  }

  // 일정: 웨이브 · 보스
  if (!g.boss.on && g.bossWarn <= 0 && g.phase === 'play') {
    g.stageT += d
    const w = waveAt(g.stageT)
    if (w !== g.wave) {
      g.wave = w
      showBanner(g, `웨이브 ${w}`, w >= 5 ? '점점 매워진다!' : '조심조심!', '#9ff7ff')
    }
    if (isBossDue(g.stageT, g.bossesSeen)) {
      g.bossWarn = 2.6
      g.queue.length = 0
      snd.alarm()
      showBanner(g, '경고! 보스 등장', '구름냥 함장이 온다', '#ff6b9a')
      g.banner.t = 2.6
    } else {
      g.spawnT -= d
      if (g.spawnT <= 0) {
        g.spawnT = spawnInterval(w)
        for (const s of nextGroup(w, Math.random)) g.queue.push({ t: s.delay, s })
      }
    }
  }
  if (g.bossWarn > 0) {
    g.bossWarn -= d
    if (g.bossWarn <= 0) startBoss(g)
  }
  for (let i = g.queue.length - 1; i >= 0; i--) {
    const q = g.queue[i]
    q.t -= d
    if (q.t <= 0) {
      spawnEnemy(g, q.s)
      g.queue.splice(i, 1)
    }
  }

  // 내 총알
  for (const b of g.shots) {
    if (!b.on) continue
    b.x += b.vx * d
    b.y += b.vy * d
    if (b.y < -20 || b.x < -20 || b.x > WORLD_W + 20) {
      b.on = false
      continue
    }
    for (const e of g.enemies) {
      if (!e.on || e.y < -10) continue
      if (circleHit(b.x, b.y, b.r, e.x, e.y, e.r)) {
        b.on = false
        e.hp--
        e.flash = 0.08
        burst(g, b.x, b.y - 4, '#bff9ff', 2, 80, 1.6, 0.2)
        if (e.hp <= 0) killEnemy(g, e)
        break
      }
    }
    const bo = g.boss
    if (b.on && bo.on && bo.dying <= 0 && bo.mode !== 'enter' && hitsBoss(bo, b.x, b.y, b.r)) {
      b.on = false
      bo.hp--
      bo.flash = 0.06
      burst(g, b.x, b.y - 4, '#ffe3ff', 2, 90, 1.8, 0.2)
      if (bo.hp <= 0) killBoss(g)
    }
  }

  // 적
  const eSpeed = Math.min(170, 105 + g.wave * 7)
  for (const e of g.enemies) {
    if (!e.on) continue
    e.age += d
    e.flash = Math.max(0, e.flash - d)
    if (e.kind === 'rockling') {
      e.x += e.vx * d
      e.y += e.vy * d
      e.spin += d * 2.4
    } else {
      patternPos(e.pattern, e.age, e.x0, e.y0, e.dir, e)
      e.spin += d * (e.kind === 'rock' ? 0.8 : 3)
    }
    if (e.y > H + 60 || e.y < -200 || (e.age > 1 && (e.x < -70 || e.x > WORLD_W + 70))) {
      e.on = false
      continue
    }
    // 쏘기 (웨이브가 오르면)
    if (g.phase === 'play' && e.y > 20 && e.y < H * 0.6) {
      e.fireT -= d
      if (e.fireT <= 0) {
        e.fireT = 2.6 + Math.random() * 2.6 - Math.min(1.2, g.wave * 0.12)
        if (e.kind === 'jelly' && g.wave >= 2) {
          const a = Math.atan2(ship.y - e.y, ship.x - e.x)
          fireEnemy(g, e.x, e.y + 8, Math.cos(a) * eSpeed, Math.sin(a) * eSpeed, 1)
        } else if (e.kind === 'donut' && g.wave >= 3) {
          fireEnemy(g, e.x, e.y + 8, 0, eSpeed + 10, 3)
        }
      }
    }
    // 몸통 박치기
    if (g.phase === 'play' && circleHit(e.x, e.y, e.r * 0.8, ship.x, ship.y, 9)) {
      if (hurtPlayer(g)) {
        e.hp = 0
        killEnemy(g, e)
      }
    }
  }

  // 보스
  if (g.boss.on) stepBoss(g, d)

  // 적 총알
  for (const b of g.ebullets) {
    if (!b.on) continue
    b.x += b.vx * d
    b.y += b.vy * d
    if (b.y > H + 20 || b.y < -30 || b.x < -30 || b.x > WORLD_W + 30) {
      b.on = false
      continue
    }
    if (g.phase === 'play' && circleHit(b.x, b.y, b.r * 0.75, ship.x, ship.y, 6)) {
      if (hurtPlayer(g)) b.on = false
    }
  }

  // 별 · 파워업
  for (const k of g.picks) {
    if (!k.on) continue
    k.age += d
    const dx = ship.x - k.x
    const dy = ship.y - k.y
    const dist = Math.hypot(dx, dy) || 1
    const pull = k.kind === 'star' && (dist < 46 || (p.magnet > 0 && dist < 260))
    if (pull && g.phase === 'play') {
      const sp = p.magnet > 0 ? 520 : 300
      k.vx += (dx / dist) * sp * d * 6
      k.vy += (dy / dist) * sp * d * 6
      const v = Math.hypot(k.vx, k.vy)
      if (v > sp) {
        k.vx = (k.vx / v) * sp
        k.vy = (k.vy / v) * sp
      }
    } else {
      k.vx *= 1 - Math.min(1, d * 2)
      k.vy += (k.kind === 'star' ? 130 : 60) * d
      k.vy = Math.min(k.vy, k.kind === 'star' ? 90 : 55)
      if (k.kind !== 'star') k.x += Math.sin(k.age * 3) * 20 * d
    }
    k.x += k.vx * d
    k.y += k.vy * d
    k.x = Math.max(8, Math.min(WORLD_W - 8, k.x))
    if (k.y > H + 20) {
      k.on = false
      continue
    }
    if (g.phase === 'play' && circleHit(k.x, k.y, k.kind === 'star' ? 10 : 14, ship.x, ship.y, 14)) {
      k.on = false
      if (k.kind === 'star') {
        const pts = collectStar(p)
        popup(g, k.x, k.y - 6, `+${pts}`, '#ffe066', 10)
        burst(g, k.x, k.y, '#ffe066', 4, 70, 1.6, 0.3)
        snd.star()
      } else {
        const bonus = applyPowerUp(p, k.kind)
        const label = k.kind === 'spread' ? (bonus ? `확산 MAX +${bonus}` : '확산탄!') : k.kind === 'shield' ? '방패!' : '자석!'
        popup(g, k.x, k.y - 10, label, POWER_COLOR[k.kind], 14)
        ring(g, ship.x, ship.y, POWER_COLOR[k.kind], 40, 0.4)
        burst(g, k.x, k.y, POWER_COLOR[k.kind], 12, 140, 2.4, 0.5)
        snd.power()
      }
    }
  }

  stepParts(g, d)
}

function stepParts(g: Game, d: number) {
  for (const q of g.parts) {
    if (!q.on) continue
    q.life -= d
    if (q.life <= 0) {
      q.on = false
      continue
    }
    q.x += q.vx * d
    q.y += q.vy * d
    q.vx *= 1 - Math.min(1, d * 2.5)
    q.vy *= 1 - Math.min(1, d * 2.5)
  }
  for (const q of g.pops) {
    if (!q.on) continue
    q.life -= d
    q.y -= 34 * d
    if (q.life <= 0) q.on = false
  }
}

function clampShip(g: Game) {
  const s = g.ship
  s.x = Math.max(16, Math.min(WORLD_W - 16, s.x))
  s.y = Math.max(g.view.H * 0.3, Math.min(g.view.H - 34, s.y))
}

/** 맞았으면(방패 포함) true */
function hurtPlayer(g: Game): boolean {
  const r = damagePlayer(g.pilot)
  const s = g.ship
  if (r === 'none') return false
  if (r === 'shield') {
    snd.shield()
    ring(g, s.x, s.y, '#8fdcff', 46, 0.45)
    burst(g, s.x, s.y, '#bfefff', 16, 180, 2.4, 0.5)
    popup(g, s.x, s.y - 30, '방패가 막았다!', '#8fdcff', 11)
    g.shake = Math.max(g.shake, 5)
    return true
  }
  snd.hurt()
  g.shake = Math.max(g.shake, 12)
  g.hurt = 1
  burst(g, s.x, s.y, '#ff7a8a', 20, 200, 3, 0.6)
  ring(g, s.x, s.y, '#ff7a8a', 50, 0.4)
  // 주변 적 총알 정리 (연달아 맞지 않게)
  for (const b of g.ebullets) if (b.on && Math.hypot(b.x - s.x, b.y - s.y) < 90) b.on = false
  if (r === 'dead') {
    g.lostToBoss = g.boss.on
    g.phase = 'dying'
    g.phaseT = 0
    sfx.boom()
    burst(g, s.x, s.y, '#ffd0a0', 40, 260, 3.6, 1.2)
    burst(g, s.x, s.y, '#ff8fc8', 14, 160, 2.6, 0.9)
    ring(g, s.x, s.y, '#ffd0a0', 90, 0.8)
    g.flashW = 0.8
    g.shake = 18
  }
  return true
}

// ─── 보스 ───

/** 보스가 머무는 높이 (체력 막대 아래) */
const BOSS_Y = 142

function hitsBoss(b: Boss, x: number, y: number, r: number) {
  // 접시(넓적) + 돔(동그라미) 두 개로
  const dx = (x - b.x) / 66
  const dy = (y - (b.y + 10)) / 22
  return dx * dx + dy * dy < 1 || circleHit(x, y, r, b.x, b.y - 12, 32)
}

function startBoss(g: Game) {
  const b = g.boss
  const n = g.bossesSeen + 1
  b.on = true
  b.x = WORLD_W / 2
  b.y = -90
  b.hp = b.max = bossHp(n)
  b.age = 0
  b.mode = 'enter'
  b.modeT = 2
  b.fireT = 0
  b.step = 0
  b.flash = 0
  b.dying = 0
}

const BOSS_CYCLE: BossMode[] = ['aim', 'rest', 'ring', 'rest', 'spiral', 'rest']

function stepBoss(g: Game, d: number) {
  const b = g.boss
  b.age += d
  b.flash = Math.max(0, b.flash - d)
  if (b.dying > 0) {
    b.dying -= d
    b.y += 14 * d
    if (Math.random() < d * 14) {
      const x = b.x + (Math.random() - 0.5) * 120
      const y = b.y + (Math.random() - 0.5) * 60
      burst(g, x, y, Math.random() < 0.5 ? '#c9a2ff' : '#ffd0a0', 10, 160, 3, 0.6)
      ring(g, x, y, '#ffe3ff', 30, 0.35)
      g.shake = Math.max(g.shake, 6)
      if (Math.random() < 0.4) noise(0.2, { vol: 0.25, lowpass: 900 })
    }
    if (b.dying <= 0) {
      b.on = false
      sfx.boom()
      sfx.win()
      burst(g, b.x, b.y, '#c9a2ff', 50, 300, 4, 1.1)
      burst(g, b.x, b.y, '#fff6c8', 30, 220, 2.6, 0.9)
      ring(g, b.x, b.y, '#ffffff', 160, 0.7)
      g.flashW = 0.7
      g.shake = 20
      for (let i = 0; i < 14; i++) drop(g, 'star', b.x + (Math.random() - 0.5) * 80, b.y)
      drop(g, randomPower(g), b.x, b.y)
      g.bossesSeen++
      showBanner(g, '보스 격파!', '별이 쏟아진다!', '#ffd94a')
    }
    return
  }
  if (b.mode === 'enter') {
    b.modeT -= d
    const k = 1 - Math.max(0, b.modeT) / 2
    const e = 1 - (1 - k) * (1 - k) * (1 - k)
    b.y = -90 + (BOSS_Y + 90) * e
    if (b.modeT <= 0) {
      b.mode = 'aim'
      b.modeT = 1.5
      b.fireT = 0.3
      b.step = 0
      b.cyc = 0
    }
    return
  }
  const t = b.age
  b.x = WORLD_W / 2 + Math.sin(t * 0.55) * 92
  b.y = BOSS_Y + Math.sin(t * 1.3) * 12
  const angry = b.hp < b.max * 0.5
  const pace = angry ? 0.78 : 1
  b.modeT -= d
  b.fireT -= d
  if (g.phase === 'play' && b.mode !== 'rest' && b.fireT <= 0) {
    const kind = b.mode as Volley
    const look = kind === 'aim' ? 1 : kind === 'ring' ? 2 : 3
    const ox = b.x
    const oy = b.y + 18
    for (const v of bossVolley(kind, t, ox, oy, g.ship.x, g.ship.y)) fireEnemy(g, ox, oy, v.vx, v.vy, look, kind === 'ring' ? 6 : 5)
    b.fireT = (kind === 'aim' ? 0.45 : kind === 'ring' ? 0.7 : 0.15) * pace
    if (kind !== 'spiral' || b.step % 3 === 0) snd.ebullet()
    b.step++
  }
  if (b.modeT <= 0) {
    b.cyc = (b.cyc + 1) % BOSS_CYCLE.length
    const next = BOSS_CYCLE[b.cyc]
    b.mode = next
    b.modeT = next === 'rest' ? 0.95 * pace : next === 'aim' ? 1.4 : next === 'ring' ? 1.45 : 1.7
    b.fireT = 0.15
  }
  // 몸통 박치기
  if (g.phase === 'play' && hitsBoss(b, g.ship.x, g.ship.y, 8)) hurtPlayer(g)
}

function killBoss(g: Game) {
  const b = g.boss
  b.dying = 1.4
  const pts = registerKill(g.pilot, 'boss')
  popup(g, b.x, b.y - 40, `+${pts.toLocaleString()}`, '#ffd94a', 18)
  for (const e of g.ebullets) e.on = false
  g.shake = 10
  snd.big()
}

// ─── 그림 재료 (한 번만 만든다) ───

interface Sprites {
  shot: HTMLCanvasElement
  eb: HTMLCanvasElement[]
  star: HTMLCanvasElement
  glow: HTMLCanvasElement
  nebula: HTMLCanvasElement
}
let SPR: Sprites | null = null

function mkCanvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  const k = 3
  cv.width = w * k
  cv.height = h * k
  const c = cv.getContext('2d')!
  c.scale(k, k)
  draw(c)
  return cv
}

function orb(core: string, mid: string, edge: string) {
  return mkCanvas(32, 32, (c) => {
    const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16)
    gr.addColorStop(0, '#ffffff')
    gr.addColorStop(0.22, core)
    gr.addColorStop(0.42, mid)
    gr.addColorStop(1, edge)
    c.fillStyle = gr
    c.beginPath()
    c.arc(16, 16, 16, 0, Math.PI * 2)
    c.fill()
  })
}

function sprites(): Sprites {
  if (SPR) return SPR
  const shot = mkCanvas(16, 34, (c) => {
    const gr = c.createRadialGradient(8, 17, 0, 8, 17, 16)
    gr.addColorStop(0, 'rgba(120,255,240,0.6)')
    gr.addColorStop(1, 'rgba(120,255,240,0)')
    c.fillStyle = gr
    c.fillRect(0, 0, 16, 34)
    c.fillStyle = '#7ffff0'
    c.beginPath()
    c.roundRect(4.5, 5, 7, 24, 3.5)
    c.fill()
    c.fillStyle = '#ffffff'
    c.beginPath()
    c.roundRect(6, 6, 4, 16, 2)
    c.fill()
  })
  const eb = [
    orb('#ffd6f0', 'rgba(255,90,170,0.95)', 'rgba(255,60,150,0)'),
    orb('#ffd6f0', 'rgba(255,80,160,0.95)', 'rgba(255,60,150,0)'),
    orb('#fff7c2', 'rgba(255,214,60,0.95)', 'rgba(255,200,40,0)'),
    orb('#ffe0c2', 'rgba(255,140,60,0.95)', 'rgba(255,120,40,0)'),
  ]
  const star = mkCanvas(24, 24, (c) => {
    const gr = c.createRadialGradient(12, 12, 0, 12, 12, 12)
    gr.addColorStop(0, 'rgba(255,230,120,0.55)')
    gr.addColorStop(1, 'rgba(255,230,120,0)')
    c.fillStyle = gr
    c.fillRect(0, 0, 24, 24)
    starPath(c, 12, 12.5, 7.5, 3.6)
    c.fillStyle = '#ffd84a'
    c.fill()
    c.lineWidth = 1.2
    c.strokeStyle = '#b8761a'
    c.stroke()
    c.fillStyle = '#fff8cf'
    c.beginPath()
    c.arc(10.5, 10.5, 1.6, 0, Math.PI * 2)
    c.fill()
  })
  const glow = mkCanvas(32, 32, (c) => {
    const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.3, 'rgba(255,255,255,0.45)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = gr
    c.fillRect(0, 0, 32, 32)
  })
  // 성운: 세로로 이어지는 타일 (위아래가 맞물리게 같은 덩어리를 ±H로 한 번 더)
  const NW = 120
  const NH = 240
  const nebula = document.createElement('canvas')
  nebula.width = NW
  nebula.height = NH
  {
    const c = nebula.getContext('2d')!
    const blobs: [number, number, number, string][] = [
      [20, 40, 70, 'rgba(160,80,255,0.32)'],
      [100, 110, 80, 'rgba(255,90,170,0.22)'],
      [40, 180, 75, 'rgba(70,170,255,0.25)'],
      [110, 220, 50, 'rgba(160,80,255,0.2)'],
      [70, 90, 40, 'rgba(90,240,220,0.12)'],
    ]
    for (const [x, y, r, col] of blobs)
      for (const oy of [-NH, 0, NH])
        for (const ox of [-NW, 0, NW]) {
          const gr = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r)
          gr.addColorStop(0, col)
          gr.addColorStop(1, 'rgba(0,0,0,0)')
          c.fillStyle = gr
          c.fillRect(0, 0, NW, NH)
        }
  }
  SPR = { shot, eb, star, glow, nebula }
  return SPR
}

function starPath(c: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number) {
  c.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? r2 : r1
    if (i === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  c.closePath()
}

function heartPath(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath()
  c.moveTo(x, y + s * 0.9)
  c.bezierCurveTo(x - s * 1.25, y + s * 0.05, x - s * 0.9, y - s * 0.95, x, y - s * 0.35)
  c.bezierCurveTo(x + s * 0.9, y - s * 0.95, x + s * 1.25, y + s * 0.05, x, y + s * 0.9)
  c.closePath()
}

// 배경 별 (3겹)
const BG: { x: number; y: number; s: number; tw: number }[][] = [[], [], []]
for (let l = 0; l < 3; l++)
  for (let i = 0; i < [55, 32, 16][l]; i++) BG[l].push({ x: Math.random(), y: Math.random(), s: [0.8, 1.3, 2][l] * (0.7 + Math.random() * 0.6), tw: Math.random() * 6 })

const POWER_COLOR: Record<PowerKind, string> = { spread: '#ffa24a', shield: '#6fd3ff', magnet: '#ff6b8b' }

// ─── 그리기 ───

function render(c: CanvasRenderingContext2D, g: Game, w: number, h: number) {
  const S = sprites()
  const f = g.view.f
  const sc = g.view.s
  const H = g.view.H

  // 바깥 (넓은 화면의 옆 패널 배경)
  c.fillStyle = '#14121f'
  c.fillRect(0, 0, w, h)
  if (f.side) drawSide(c, g, w, h)

  // 경기장
  c.save()
  c.beginPath()
  c.rect(f.x, f.y, f.w, f.h)
  c.clip()
  const shx = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0
  const shy = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0
  c.translate(f.x + shx, f.y + shy)
  c.scale(sc, sc)

  drawBackground(c, g, S, H)

  // 별 · 파워업
  for (const k of g.picks) if (k.on) drawPick(c, g, k, S)
  // 적
  for (const e of g.enemies) if (e.on) drawEnemy(c, g, e)
  if (g.boss.on) drawBoss(c, g)
  // 내 총알
  for (const b of g.shots) if (b.on) c.drawImage(S.shot, b.x - 8, b.y - 17, 16, 34)
  // 배
  if (g.phase === 'play') drawShip(c, g)
  // 적 총알 (가장 위 · 잘 보이게)
  for (const b of g.ebullets) {
    if (!b.on) continue
    const r = b.r * 2.6
    c.drawImage(S.eb[b.look], b.x - r, b.y - r, r * 2, r * 2)
  }
  drawParticles(c, g, S)
  // 점수 글씨
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  for (const q of g.pops) {
    if (!q.on) continue
    const a = Math.min(1, q.life / 0.35)
    c.globalAlpha = a
    c.lineWidth = 3
    c.strokeStyle = 'rgba(20,10,40,0.9)'
    c.font = `700 ${q.size}px ${GAME_FONT}`
    c.strokeText(q.text, q.x, q.y)
    c.fillStyle = q.color
    c.fillText(q.text, q.x, q.y)
  }
  c.globalAlpha = 1

  // 맞았을 때 붉은 테 · 하얀 번쩍
  if (g.hurt > 0) {
    const gr = c.createRadialGradient(WORLD_W / 2, H / 2, H * 0.3, WORLD_W / 2, H / 2, H * 0.75)
    gr.addColorStop(0, 'rgba(255,60,90,0)')
    gr.addColorStop(1, `rgba(255,60,90,${0.45 * g.hurt})`)
    c.fillStyle = gr
    c.fillRect(-20, -20, WORLD_W + 40, H + 40)
  }
  if (g.flashW > 0) {
    c.fillStyle = `rgba(255,255,255,${Math.min(0.7, g.flashW)})`
    c.fillRect(-20, -20, WORLD_W + 40, H + 40)
  }

  if (g.phase === 'play' || g.phase === 'dying') {
    drawHud(c, g, H)
    drawBanner(c, g, H)
  }
  if (g.phase === 'ready') drawReady(c, g, H)
  if (g.phase === 'over') drawOver(c, g, H)
  c.restore()

  // 경기장 테두리 (넓은 화면)
  if (f.side) {
    // 번진 빛 (shadowBlur 대신 굵은 반투명 선 몇 겹 — 가볍게)
    for (const [lw, a] of [
      [16, 0.06],
      [9, 0.12],
      [3, 0.6],
    ]) {
      c.strokeStyle = `rgba(160,120,255,${a})`
      c.lineWidth = lw
      c.strokeRect(f.x - 1.5, f.y - 10, f.w + 3, f.h + 20)
    }
  }
}

function drawBackground(c: CanvasRenderingContext2D, g: Game, S: Sprites, H: number) {
  const gr = c.createLinearGradient(0, 0, 0, H)
  gr.addColorStop(0, '#120c2c')
  gr.addColorStop(0.55, '#1c1240')
  gr.addColorStop(1, '#2a1647')
  c.fillStyle = gr
  c.fillRect(-20, -20, WORLD_W + 40, H + 40)
  // 성운 (느리게 흐른다)
  const tileW = WORLD_W
  const tileH = WORLD_W * 2
  const oy = (g.scroll * 12) % tileH
  c.globalAlpha = 0.95
  for (let y = oy - tileH; y < H; y += tileH) c.drawImage(S.nebula, 0, y, tileW, tileH)
  c.globalAlpha = 1
  // 먼 행성
  const py = ((g.scroll * 6 + 120) % (H + 240)) - 120
  c.save()
  c.globalAlpha = 0.55
  const pg = c.createRadialGradient(290, py - 10, 4, 300, py, 34)
  pg.addColorStop(0, '#ffb8d9')
  pg.addColorStop(1, '#6a3c9e')
  c.fillStyle = pg
  c.beginPath()
  c.arc(300, py, 30, 0, Math.PI * 2)
  c.fill()
  c.strokeStyle = 'rgba(255,220,250,0.6)'
  c.lineWidth = 3
  c.beginPath()
  c.ellipse(300, py, 50, 11, -0.35, 0, Math.PI * 2)
  c.stroke()
  c.restore()
  // 별 3겹 (가까울수록 빠르게)
  const speeds = [14, 40, 95]
  for (let l = 0; l < 3; l++) {
    const layer = BG[l]
    const off = g.scroll * speeds[l]
    c.fillStyle = l === 2 ? '#ffffff' : l === 1 ? '#d8d0ff' : '#9c90d0'
    for (const s of layer) {
      const y = (s.y * (H + 10) + off) % (H + 10)
      const tw = l === 0 ? 0.55 + 0.45 * Math.sin(g.time * 2 + s.tw) : 1
      c.globalAlpha = tw
      if (l === 2) {
        c.globalAlpha = 0.55
        c.fillRect(s.x * WORLD_W - s.s / 2, y - s.s, s.s, s.s * 2.2)
      } else c.fillRect(s.x * WORLD_W, y, s.s, s.s)
    }
  }
  c.globalAlpha = 1
}

function drawShip(c: CanvasRenderingContext2D, g: Game) {
  const s = g.ship
  const p = g.pilot
  c.save()
  if (p.invuln > 0 && g.phase === 'play' && Math.floor(g.time * 14) % 2 === 0) c.globalAlpha = 0.3
  c.translate(s.x, s.y)
  c.rotate(s.tilt * 0.6)
  // 불꽃
  const fl = 1 + Math.sin(g.time * 40) * 0.18 + Math.random() * 0.15
  const fg = c.createLinearGradient(0, 12, 0, 12 + 22 * fl)
  fg.addColorStop(0, '#fff7c0')
  fg.addColorStop(0.35, '#ffb347')
  fg.addColorStop(1, 'rgba(255,80,120,0)')
  c.fillStyle = fg
  c.beginPath()
  c.moveTo(-7, 12)
  c.quadraticCurveTo(0, 14 + 30 * fl, 7, 12)
  c.closePath()
  c.fill()
  c.fillStyle = '#ffffff'
  c.beginPath()
  c.ellipse(0, 15, 3, 5 * fl, 0, 0, Math.PI * 2)
  c.fill()
  // 날개
  c.fillStyle = '#ff6b8b'
  c.strokeStyle = '#3a1d4a'
  c.lineWidth = 2
  for (const k of [-1, 1]) {
    c.beginPath()
    c.moveTo(k * 9, -2)
    c.quadraticCurveTo(k * 21, 6, k * 19, 16)
    c.quadraticCurveTo(k * 13, 13, k * 8, 13)
    c.closePath()
    c.fill()
    c.stroke()
  }
  // 몸통
  const bg = c.createLinearGradient(-12, 0, 12, 0)
  bg.addColorStop(0, '#ffffff')
  bg.addColorStop(0.6, '#f1ecff')
  bg.addColorStop(1, '#c6bce8')
  c.fillStyle = bg
  c.beginPath()
  c.moveTo(0, -24)
  c.bezierCurveTo(13, -16, 13, 6, 9, 15)
  c.lineTo(-9, 15)
  c.bezierCurveTo(-13, 6, -13, -16, 0, -24)
  c.closePath()
  c.fill()
  c.stroke()
  // 코
  c.fillStyle = '#ff6b8b'
  c.beginPath()
  c.moveTo(0, -24)
  c.bezierCurveTo(6, -20, 8.5, -16, 9.5, -13)
  c.quadraticCurveTo(0, -16, -9.5, -13)
  c.bezierCurveTo(-8.5, -16, -6, -20, 0, -24)
  c.closePath()
  c.fill()
  c.stroke()
  // 창문 + 조종사
  c.fillStyle = '#5ad1ff'
  c.beginPath()
  c.arc(0, -3, 6.2, 0, Math.PI * 2)
  c.fill()
  c.stroke()
  c.fillStyle = '#ffe1c4'
  c.beginPath()
  c.arc(0, -1.6, 3.6, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#3a1d4a'
  c.fillRect(-1.8, -2.4, 1, 1.2)
  c.fillRect(0.8, -2.4, 1, 1.2)
  c.fillStyle = 'rgba(255,255,255,0.8)'
  c.beginPath()
  c.ellipse(-2.5, -5.5, 1.6, 1, -0.6, 0, Math.PI * 2)
  c.fill()
  // 꼬리 줄
  c.fillStyle = '#ffd94a'
  c.fillRect(-7, 8, 14, 3)
  c.restore()

  // 방패 거품
  if (p.shield) {
    c.save()
    const r = 26 + Math.sin(g.time * 5) * 1.5
    const sg = c.createRadialGradient(s.x - 6, s.y - 8, 2, s.x, s.y, r)
    sg.addColorStop(0, 'rgba(180,240,255,0.05)')
    sg.addColorStop(0.75, 'rgba(110,210,255,0.18)')
    sg.addColorStop(1, 'rgba(140,225,255,0.6)')
    c.fillStyle = sg
    c.beginPath()
    c.arc(s.x, s.y, r, 0, Math.PI * 2)
    c.fill()
    c.strokeStyle = 'rgba(200,245,255,0.9)'
    c.lineWidth = 1.5
    c.stroke()
    c.fillStyle = 'rgba(255,255,255,0.75)'
    c.beginPath()
    c.ellipse(s.x - 10, s.y - 13, 5, 2.5, -0.7, 0, Math.PI * 2)
    c.fill()
    c.restore()
  }
  if (p.magnet > 0) {
    c.save()
    const k = (g.time * 1.4) % 1
    c.strokeStyle = `rgba(255,107,139,${0.5 * (1 - k)})`
    c.lineWidth = 2
    c.setLineDash([4, 5])
    c.beginPath()
    c.arc(s.x, s.y, 30 + k * 40, 0, Math.PI * 2)
    c.stroke()
    c.restore()
  }
}

function drawEnemy(c: CanvasRenderingContext2D, g: Game, e: Enemy) {
  c.save()
  c.translate(e.x, e.y)
  const white = e.flash > 0
  if (e.kind === 'jelly') {
    const wob = Math.sin(g.time * 6 + e.spin) * 1.6
    const col = e.hue ? ['#e3ccff', '#a777f0'] : ['#c9fff0', '#3fd9a6']
    // 다리
    c.strokeStyle = white ? '#fff' : col[1]
    c.lineWidth = 3
    c.lineCap = 'round'
    for (let i = -1.5; i <= 1.5; i += 1) {
      c.beginPath()
      c.moveTo(i * 6, 4)
      c.quadraticCurveTo(i * 6 + Math.sin(g.time * 8 + i) * 4, 12, i * 6 + Math.sin(g.time * 8 + i + 1) * 3, 18)
      c.stroke()
    }
    // 머리
    const gr = c.createRadialGradient(-4, -8, 2, 0, -2, 18)
    gr.addColorStop(0, white ? '#fff' : col[0])
    gr.addColorStop(1, white ? '#fff' : col[1])
    c.fillStyle = gr
    c.strokeStyle = '#2a1640'
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(-15 - wob * 0.4, 6)
    c.bezierCurveTo(-17, -20 + wob, 17, -20 + wob, 15 + wob * 0.4, 6)
    c.quadraticCurveTo(10, 3, 5, 7)
    c.quadraticCurveTo(0, 3, -5, 7)
    c.quadraticCurveTo(-10, 3, -15 - wob * 0.4, 6)
    c.closePath()
    c.fill()
    c.stroke()
    // 얼굴 (장난꾸러기)
    c.fillStyle = '#2a1640'
    c.beginPath()
    c.arc(-5, -3, 2.4, 0, Math.PI * 2)
    c.arc(5, -3, 2.4, 0, Math.PI * 2)
    c.fill()
    c.strokeStyle = '#2a1640'
    c.lineWidth = 1.6
    c.beginPath()
    c.moveTo(-8, -8)
    c.lineTo(-3, -6.5)
    c.moveTo(8, -8)
    c.lineTo(3, -6.5)
    c.stroke()
    c.beginPath()
    c.moveTo(-3, 1.5)
    c.quadraticCurveTo(1, 4, 4, 0.5)
    c.stroke()
    c.fillStyle = 'rgba(255,255,255,0.7)'
    c.beginPath()
    c.ellipse(-7, -11, 3, 1.6, -0.5, 0, Math.PI * 2)
    c.fill()
  } else if (e.kind === 'donut') {
    // 도넛 접시
    c.rotate(Math.sin(g.time * 3 + e.spin) * 0.15)
    c.strokeStyle = '#2a1640'
    c.lineWidth = 2
    c.fillStyle = white ? '#fff' : '#e7a865'
    c.beginPath()
    c.ellipse(0, 2, 17, 9, 0, 0, Math.PI * 2)
    c.fill()
    c.stroke()
    c.fillStyle = white ? '#fff' : '#ff8fc8'
    c.beginPath()
    c.ellipse(0, 0, 15, 7.5, 0, 0, Math.PI * 2)
    c.fill()
    // 뿌린 설탕
    const sp = ['#fff36b', '#7cf5ff', '#ffffff', '#9cff7a']
    for (let i = 0; i < 7; i++) {
      const a = e.spin * 1.5 + i * 0.9
      const x = Math.cos(a) * 11
      const y = Math.sin(a) * 5
      if (Math.abs(x) < 6 && Math.abs(y) < 3.5) continue
      c.fillStyle = sp[i % 4]
      c.fillRect(x - 1.5, y - 0.6, 3, 1.4)
    }
    // 구멍의 유리 돔 + 외눈 외계인
    c.fillStyle = 'rgba(160,230,255,0.85)'
    c.beginPath()
    c.ellipse(0, -2, 6.5, 7, 0, Math.PI, 0)
    c.ellipse(0, -2, 6.5, 2.5, 0, 0, Math.PI)
    c.fill()
    c.stroke()
    c.fillStyle = '#b6ff8a'
    c.beginPath()
    c.arc(0, -2.5, 4, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = '#fff'
    c.beginPath()
    c.arc(0, -3, 2.3, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = '#2a1640'
    c.beginPath()
    c.arc(Math.sin(g.time * 2 + e.spin) * 0.8, -2.8, 1.2, 0, Math.PI * 2)
    c.fill()
    // 깜빡이 불
    for (let i = 0; i < 3; i++) {
      const on = Math.floor(g.time * 6 + i) % 3 === 0
      c.fillStyle = on ? '#fff36b' : '#8a5a2a'
      c.beginPath()
      c.arc(-10 + i * 10, 7.5, 1.6, 0, Math.PI * 2)
      c.fill()
    }
  } else {
    // 투덜 바위
    const r = e.r
    c.save()
    c.rotate(e.spin)
    c.beginPath()
    const n = e.shape.length
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const rr = r * e.shape[i]
      if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
      else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    c.closePath()
    const gr = c.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r)
    gr.addColorStop(0, white ? '#fff' : '#d9c0a5')
    gr.addColorStop(1, white ? '#fff' : '#7d6152')
    c.fillStyle = gr
    c.fill()
    c.strokeStyle = '#2a1640'
    c.lineWidth = 2
    c.lineJoin = 'round'
    c.stroke()
    c.fillStyle = 'rgba(80,55,50,0.45)'
    c.beginPath()
    c.arc(r * 0.45, r * 0.3, r * 0.17, 0, Math.PI * 2)
    c.arc(-r * 0.4, r * 0.45, r * 0.11, 0, Math.PI * 2)
    c.arc(r * 0.1, -r * 0.55, r * 0.12, 0, Math.PI * 2)
    c.fill()
    c.restore()
    // 얼굴은 똑바로 (투덜투덜)
    const k = r / 24
    c.strokeStyle = '#2a1640'
    c.fillStyle = '#2a1640'
    c.lineWidth = 2
    c.lineCap = 'round'
    if (e.kind === 'rock') {
      c.beginPath()
      c.arc(-7 * k, -1 * k, 2.6 * k, 0, Math.PI * 2)
      c.arc(7 * k, -1 * k, 2.6 * k, 0, Math.PI * 2)
      c.fill()
      c.beginPath()
      c.moveTo(-12 * k, -9 * k)
      c.lineTo(-3 * k, -5 * k)
      c.moveTo(12 * k, -9 * k)
      c.lineTo(3 * k, -5 * k)
      c.moveTo(-5 * k, 9 * k)
      c.quadraticCurveTo(0, 4 * k, 5 * k, 9 * k)
      c.stroke()
    } else {
      // 꼬마 바위: >_<
      c.beginPath()
      c.moveTo(-8 * k * 1.4, -5 * k)
      c.lineTo(-4 * k * 1.4, -2 * k)
      c.lineTo(-8 * k * 1.4, 1 * k)
      c.moveTo(8 * k * 1.4, -5 * k)
      c.lineTo(4 * k * 1.4, -2 * k)
      c.lineTo(8 * k * 1.4, 1 * k)
      c.moveTo(-3 * k, 6 * k)
      c.lineTo(3 * k, 6 * k)
      c.stroke()
    }
  }
  c.restore()
}

function drawBoss(c: CanvasRenderingContext2D, g: Game) {
  const b = g.boss
  const white = b.flash > 0
  const angry = b.hp < b.max * 0.5
  c.save()
  c.translate(b.x, b.y)
  if (b.dying > 0) c.rotate(Math.sin(b.age * 30) * 0.06)
  // 끌어당기는 빛
  const lg = c.createLinearGradient(0, 10, 0, 90)
  lg.addColorStop(0, 'rgba(255,240,160,0.32)')
  lg.addColorStop(1, 'rgba(255,240,160,0)')
  c.fillStyle = lg
  c.beginPath()
  c.moveTo(-26, 18)
  c.lineTo(26, 18)
  c.lineTo(48, 90)
  c.lineTo(-48, 90)
  c.closePath()
  c.fill()
  // 유리 돔 속 고양이 덩어리
  c.save()
  c.beginPath()
  c.ellipse(0, -8, 38, 40, 0, Math.PI, 0)
  c.lineTo(38, 2)
  c.lineTo(-38, 2)
  c.closePath()
  c.fillStyle = 'rgba(150,220,255,0.22)'
  c.fill()
  c.clip()
  const bob = Math.sin(g.time * 3) * 2
  const cg = c.createRadialGradient(-8, -26 + bob, 4, 0, -14 + bob, 34)
  cg.addColorStop(0, white ? '#fff' : '#ffe0f2')
  cg.addColorStop(1, white ? '#fff' : angry ? '#ff7fb5' : '#d9a6ff')
  c.fillStyle = cg
  c.strokeStyle = '#2a1640'
  c.lineWidth = 2.2
  // 귀
  for (const k of [-1, 1]) {
    c.beginPath()
    c.moveTo(k * 10, -30 + bob)
    c.lineTo(k * 24, -44 + bob)
    c.lineTo(k * 27, -22 + bob)
    c.closePath()
    c.fill()
    c.stroke()
    c.fillStyle = '#ff9ccf'
    c.beginPath()
    c.moveTo(k * 14, -30 + bob)
    c.lineTo(k * 22.5, -38 + bob)
    c.lineTo(k * 24, -26 + bob)
    c.closePath()
    c.fill()
    c.fillStyle = cg
  }
  c.beginPath()
  c.ellipse(0, -10 + bob, 30, 26, 0, 0, Math.PI * 2)
  c.fill()
  c.stroke()
  // 얼굴
  c.fillStyle = '#2a1640'
  if (angry) {
    c.lineWidth = 2.4
    c.beginPath()
    c.moveTo(-15, -19 + bob)
    c.lineTo(-6, -15 + bob)
    c.moveTo(15, -19 + bob)
    c.lineTo(6, -15 + bob)
    c.stroke()
  }
  c.beginPath()
  c.ellipse(-10, -11 + bob, 4, angry ? 3 : 4.5, 0, 0, Math.PI * 2)
  c.ellipse(10, -11 + bob, 4, angry ? 3 : 4.5, 0, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#fff'
  c.beginPath()
  c.arc(-11, -12.5 + bob, 1.4, 0, Math.PI * 2)
  c.arc(9, -12.5 + bob, 1.4, 0, Math.PI * 2)
  c.fill()
  c.lineWidth = 1.8
  c.beginPath()
  c.moveTo(-5, -3 + bob)
  c.quadraticCurveTo(-2.5, 0 + bob, 0, -3 + bob)
  c.quadraticCurveTo(2.5, 0 + bob, 5, -3 + bob)
  c.stroke()
  c.lineWidth = 1.2
  c.beginPath()
  for (const k of [-1, 1]) {
    c.moveTo(k * 16, -4 + bob)
    c.lineTo(k * 30, -7 + bob)
    c.moveTo(k * 16, -1 + bob)
    c.lineTo(k * 30, 0 + bob)
  }
  c.stroke()
  c.fillStyle = 'rgba(255,120,170,0.45)'
  c.beginPath()
  c.ellipse(-18, -3 + bob, 4, 2.4, 0, 0, Math.PI * 2)
  c.ellipse(18, -3 + bob, 4, 2.4, 0, 0, Math.PI * 2)
  c.fill()
  c.restore()
  // 돔 테두리 + 반짝
  c.strokeStyle = 'rgba(220,245,255,0.9)'
  c.lineWidth = 2
  c.beginPath()
  c.ellipse(0, -8, 38, 40, 0, Math.PI, 0)
  c.stroke()
  c.fillStyle = 'rgba(255,255,255,0.55)'
  c.beginPath()
  c.ellipse(-22, -30, 6, 3, -0.8, 0, Math.PI * 2)
  c.fill()
  // 접시
  const sg = c.createLinearGradient(0, -6, 0, 26)
  sg.addColorStop(0, white ? '#fff' : '#e9e4ff')
  sg.addColorStop(0.5, white ? '#fff' : '#9d8fd6')
  sg.addColorStop(1, white ? '#fff' : '#4d3f8c')
  c.fillStyle = sg
  c.strokeStyle = '#2a1640'
  c.lineWidth = 2.5
  c.beginPath()
  c.ellipse(0, 8, 66, 18, 0, 0, Math.PI * 2)
  c.fill()
  c.stroke()
  c.fillStyle = white ? '#fff' : '#6c5bb5'
  c.beginPath()
  c.ellipse(0, 16, 34, 9, 0, 0, Math.PI)
  c.fill()
  c.stroke()
  // 불빛 줄
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * Math.PI
    const x = -Math.cos(a) * 54
    const y = 9 + Math.sin(a) * 9
    const on = Math.floor(g.time * 8 + i) % 3 === 0
    c.fillStyle = on ? '#fff36b' : i % 2 ? '#ff8fc8' : '#7cf5ff'
    c.beginPath()
    c.arc(x, y, on ? 3.4 : 2.6, 0, Math.PI * 2)
    c.fill()
  }
  c.restore()
}

function drawPick(c: CanvasRenderingContext2D, g: Game, k: Pickup, S: Sprites) {
  if (k.kind === 'star') {
    const s = 22 + Math.sin(g.time * 8 + k.x) * 2
    c.save()
    c.translate(k.x, k.y)
    c.rotate(Math.sin(g.time * 3 + k.y * 0.05) * 0.4)
    c.drawImage(S.star, -s / 2, -s / 2, s, s)
    c.restore()
    return
  }
  const col = POWER_COLOR[k.kind]
  const r = 13 + Math.sin(g.time * 6) * 1
  c.save()
  c.translate(k.x, k.y)
  c.globalCompositeOperation = 'lighter'
  c.globalAlpha = 0.6
  c.drawImage(S.glow, -r * 2, -r * 2, r * 4, r * 4)
  c.globalAlpha = 1
  c.globalCompositeOperation = 'source-over'
  const gr = c.createRadialGradient(-4, -5, 1, 0, 0, r)
  gr.addColorStop(0, '#ffffff')
  gr.addColorStop(1, col)
  c.fillStyle = gr
  c.strokeStyle = '#2a1640'
  c.lineWidth = 2
  c.beginPath()
  c.arc(0, 0, r, 0, Math.PI * 2)
  c.fill()
  c.stroke()
  c.strokeStyle = '#2a1640'
  c.fillStyle = '#2a1640'
  c.lineWidth = 2.2
  c.lineCap = 'round'
  c.lineJoin = 'round'
  if (k.kind === 'spread') {
    for (const a of [-0.5, 0, 0.5]) {
      c.save()
      c.rotate(a)
      c.beginPath()
      c.moveTo(0, 5)
      c.lineTo(0, -6)
      c.moveTo(-2.6, -3.4)
      c.lineTo(0, -6.5)
      c.lineTo(2.6, -3.4)
      c.stroke()
      c.restore()
    }
  } else if (k.kind === 'shield') {
    c.beginPath()
    c.moveTo(0, -7)
    c.lineTo(6, -4.5)
    c.quadraticCurveTo(6, 4, 0, 7.5)
    c.quadraticCurveTo(-6, 4, -6, -4.5)
    c.closePath()
    c.fillStyle = '#ffffff'
    c.fill()
    c.stroke()
  } else {
    c.lineWidth = 3.4
    c.beginPath()
    c.arc(0, -1, 5, Math.PI, 0, false)
    c.lineTo(5, 5)
    c.moveTo(-5, -1)
    c.lineTo(-5, 5)
    c.stroke()
    c.fillStyle = '#ffffff'
    c.fillRect(-6.7, 3.5, 3.4, 3)
    c.fillRect(3.3, 3.5, 3.4, 3)
  }
  c.restore()
}

function drawParticles(c: CanvasRenderingContext2D, g: Game, S: Sprites) {
  c.globalCompositeOperation = 'lighter'
  for (const q of g.parts) {
    if (!q.on) continue
    const k = q.life / q.max
    if (q.kind === 1) {
      c.globalAlpha = k
      c.strokeStyle = q.color
      c.lineWidth = 3 * k + 0.5
      c.beginPath()
      c.arc(q.x, q.y, q.size * (1 - k * k) + 2, 0, Math.PI * 2)
      c.stroke()
    } else if (q.kind === 2) {
      c.globalAlpha = k
      const s = q.size * 3
      c.drawImage(S.glow, q.x - s, q.y - s, s * 2, s * 2)
    } else {
      c.globalAlpha = Math.min(1, k * 1.5)
      c.fillStyle = q.color
      const s = q.size * (0.4 + k * 0.6)
      c.fillRect(q.x - s / 2, q.y - s / 2, s, s)
    }
  }
  c.globalAlpha = 1
  c.globalCompositeOperation = 'source-over'
}

function drawHearts(c: CanvasRenderingContext2D, x: number, y: number, lives: number, size: number, gap: number, t: number) {
  for (let i = 0; i < 3; i++) {
    const on = i < lives
    const s = size * (on && i === lives - 1 ? 1 + Math.sin(t * 6) * 0.06 : 1)
    heartPath(c, x + i * gap, y, s)
    c.fillStyle = on ? '#ff5d8f' : 'rgba(255,255,255,0.12)'
    c.fill()
    c.lineWidth = 2
    c.strokeStyle = on ? '#2a1640' : 'rgba(255,255,255,0.25)'
    c.stroke()
    if (on) {
      c.fillStyle = 'rgba(255,255,255,0.75)'
      c.beginPath()
      c.ellipse(x + i * gap - s * 0.42, y - s * 0.3, s * 0.2, s * 0.12, -0.6, 0, Math.PI * 2)
      c.fill()
    }
  }
}

function outlined(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, px: number, fill: string) {
  c.lineWidth = Math.max(2, px / 5)
  c.strokeStyle = 'rgba(20,10,40,0.95)'
  c.lineJoin = 'round'
  // fitText가 고른 크기로 테두리도
  c.font = `700 ${px}px ${GAME_FONT}`
  const w = c.measureText(text).width
  if (w > maxW) c.font = `700 ${Math.max(6, Math.floor((px * maxW) / w))}px ${GAME_FONT}`
  c.strokeText(text, x, y)
  c.fillStyle = fill
  fitText(c, text, x, y, maxW, px)
}

function drawHud(c: CanvasRenderingContext2D, g: Game, H: number) {
  const p = g.pilot
  const side = g.view.f.side
  c.textBaseline = 'middle'
  if (!side) {
    // 위쪽 띠
    const tg = c.createLinearGradient(0, 0, 0, 52)
    tg.addColorStop(0, 'rgba(10,6,24,0.7)')
    tg.addColorStop(1, 'rgba(10,6,24,0)')
    c.fillStyle = tg
    c.fillRect(0, 0, WORLD_W, 52)
    c.textAlign = 'left'
    outlined(c, p.score.toLocaleString(), 12, 18, 170, 18, '#ffffff')
    c.textAlign = 'left'
    outlined(c, `웨이브 ${g.wave}`, 12, 38, 90, 10, '#9ff7ff')
    drawHearts(c, WORLD_W - 64, 18, p.lives, 8.5, 22, g.time)
    drawPowerIcons(c, g, WORLD_W - 14, 40, 'right')
  }
  // 콤보 (폰: 점수 밑 · 넓은 화면은 옆 패널에)
  if (p.combo >= 2 && !side) {
    const m = comboMult(p.combo)
    const k = Math.max(0, p.comboT / 2.5)
    const x = side ? WORLD_W / 2 : 12
    const y = side ? 22 : 58
    c.textAlign = side ? 'center' : 'left'
    outlined(c, `${p.combo} 콤보${m > 1 ? `  x${m.toFixed(1)}` : ''}`, x, y, 160, m > 1 ? 13 : 11, m >= 3 ? '#ff8fc8' : m > 1 ? '#ffd94a' : '#ffffff')
    c.fillStyle = 'rgba(255,255,255,0.18)'
    const bx = side ? x - 40 : x
    c.fillRect(bx, y + 10, 80, 3)
    c.fillStyle = m > 1 ? '#ffd94a' : '#ffffff'
    c.fillRect(bx, y + 10, 80 * k, 3)
  }
  // 보스 체력
  const b = g.boss
  if (b.on && b.dying <= 0) {
    const y = side ? 30 : 84
    const w = 220
    const x = (WORLD_W - w) / 2
    c.textAlign = 'center'
    outlined(c, '구름냥 함장', WORLD_W / 2, y - 9, 160, 10, '#ffd0ef')
    c.fillStyle = 'rgba(20,10,40,0.85)'
    c.beginPath()
    c.roundRect(x - 2, y - 2, w + 4, 12, 6)
    c.fill()
    const k = Math.max(0, b.hp / b.max)
    const hg = c.createLinearGradient(x, 0, x + w, 0)
    hg.addColorStop(0, '#ff5d8f')
    hg.addColorStop(1, '#c9a2ff')
    c.fillStyle = hg
    c.beginPath()
    c.roundRect(x, y, Math.max(8, w * k), 8, 4)
    c.fill()
    c.fillStyle = 'rgba(255,255,255,0.4)'
    c.fillRect(x + 4, y + 1.5, Math.max(0, w * k - 8), 2)
  }
  void H
}

function drawPowerIcons(c: CanvasRenderingContext2D, g: Game, x: number, y: number, align: 'right' | 'left') {
  const p = g.pilot
  const items: [PowerKind, number][] = []
  if (p.spread > 0) items.push(['spread', p.spread])
  if (p.shield) items.push(['shield', 1])
  if (p.magnet > 0) items.push(['magnet', p.magnet / 10])
  let cx = x
  for (const [k, v] of items) {
    const ix = align === 'right' ? cx - 8 : cx + 8
    c.fillStyle = POWER_COLOR[k]
    c.strokeStyle = '#2a1640'
    c.lineWidth = 1.5
    c.beginPath()
    c.arc(ix, y, 7, 0, Math.PI * 2)
    c.fill()
    c.stroke()
    c.fillStyle = '#2a1640'
    c.textAlign = 'center'
    c.font = `700 8px ${GAME_FONT}`
    c.fillText(k === 'spread' ? `${v + 1}` : k === 'shield' ? '방' : '자', ix, y + 0.5)
    if (k === 'magnet') {
      c.strokeStyle = '#ffffff'
      c.lineWidth = 1.6
      c.beginPath()
      c.arc(ix, y, 9.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v)
      c.stroke()
    }
    cx += align === 'right' ? -20 : 20
  }
}

function drawBanner(c: CanvasRenderingContext2D, g: Game, H: number) {
  const bn = g.banner
  if (bn.t <= 0) return
  const total = 2.2
  const age = Math.max(0, total - bn.t)
  const inK = Math.min(1, age / 0.25)
  const outK = Math.min(1, bn.t / 0.35)
  const a = Math.min(inK, outK)
  const y = H * 0.36
  c.save()
  c.globalAlpha = a
  const bw = WORLD_W * (0.5 + 0.5 * easeOut(inK))
  const gr = c.createLinearGradient(0, y - 30, 0, y + 30)
  gr.addColorStop(0, 'rgba(20,10,40,0)')
  gr.addColorStop(0.5, 'rgba(20,10,40,0.75)')
  gr.addColorStop(1, 'rgba(20,10,40,0)')
  c.fillStyle = gr
  c.fillRect((WORLD_W - bw) / 2, y - 34, bw, 68)
  const warn = bn.color === '#ff6b9a'
  if (warn && Math.floor(g.time * 4) % 2 === 0) {
    c.fillStyle = 'rgba(255,60,110,0.18)'
    c.fillRect(0, y - 34, WORLD_W, 68)
  }
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  const sc = 1 + (1 - easeOut(inK)) * 0.6
  c.translate(WORLD_W / 2, y - 6)
  c.scale(sc, sc)
  outlined(c, bn.text, 0, 0, 300, 24, bn.color)
  c.restore()
  c.save()
  c.globalAlpha = a
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  outlined(c, bn.sub, WORLD_W / 2, y + 20, 300, 11, '#ffffff')
  c.restore()
}

const easeOut = (k: number) => 1 - (1 - k) * (1 - k) * (1 - k)

function panel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const gr = c.createLinearGradient(0, y, 0, y + h)
  gr.addColorStop(0, 'rgba(48,32,92,0.94)')
  gr.addColorStop(1, 'rgba(28,18,58,0.94)')
  c.fillStyle = gr
  c.strokeStyle = '#0c0718'
  c.lineWidth = 3
  c.beginPath()
  c.roundRect(x, y, w, h, 16)
  c.fill()
  c.stroke()
  c.strokeStyle = 'rgba(201,162,255,0.45)'
  c.lineWidth = 1.5
  c.beginPath()
  c.roundRect(x + 5, y + 5, w - 10, h - 10, 12)
  c.stroke()
}

function drawReady(c: CanvasRenderingContext2D, g: Game, H: number) {
  c.fillStyle = 'rgba(10,6,24,0.35)'
  c.fillRect(0, 0, WORLD_W, H)
  drawShip(c, g)
  const top = Math.max(24, H * 0.08)
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  // 제목
  const bob = Math.sin(g.time * 2.2) * 3
  c.save()
  c.shadowColor = '#c08cff'
  c.shadowBlur = 18
  outlined(c, '우주 대결', WORLD_W / 2, top + 22 + bob, 300, 40, '#ffe680')
  c.restore()
  outlined(c, 'PC방 신작 · 별을 모아 최고 점수!', WORLD_W / 2, top + 56, 300, 11, '#cfc4ff')

  // 등장 친구들
  const py = top + 82
  const ph = 104
  panel(c, 20, py, WORLD_W - 40, ph)
  const demo: [EnemyKind, string, string][] = [
    ['jelly', '말랑해파리', '흔들흔들'],
    ['donut', '도넛 UFO', '휙 지나감'],
    ['rock', '투덜바위', '맞으면 쪼개짐'],
  ]
  for (let i = 0; i < 3; i++) {
    const cx = 20 + ((WORLD_W - 40) / 3) * (i + 0.5)
    const e = DEMO
    e.kind = demo[i][0]
    e.x = cx
    e.y = py + 36 + Math.sin(g.time * 3 + i) * 3
    e.r = e.kind === 'rock' ? 18 : 14
    e.hue = 0
    e.flash = 0
    e.spin = e.kind === 'rock' ? g.time * 0.5 : g.time
    if (e.shape.length === 0) makeShape(e)
    drawEnemy(c, g, e)
    outlined(c, demo[i][1], cx, py + 72, 96, 11, '#ffffff')
    outlined(c, demo[i][2], cx, py + 88, 96, 9, '#a99ccc')
  }

  // 하는 법
  const hy = py + ph + 12
  const lines = ['손가락으로 끌면 배가 따라와요', '컴퓨터는 ←→↑↓ · WASD', '총은 자동! 별과 파워업을 모아요', '45초마다 보스가 나타나요']
  panel(c, 20, hy, WORLD_W - 40, 24 + lines.length * 20)
  for (let i = 0; i < lines.length; i++) outlined(c, lines[i], WORLD_W / 2, hy + 22 + i * 20, WORLD_W - 70, 11, i === 0 ? '#9ff7ff' : '#ffffff')

  // 시작
  const blink = 0.75 + 0.25 * Math.sin(g.time * 5)
  const sy = Math.min(H - 40, hy + 24 + lines.length * 20 + 40)
  c.globalAlpha = blink
  outlined(c, '▶ 누르면 시작', WORLD_W / 2, sy, 260, 20, '#ffd94a')
  c.globalAlpha = 1
}
const DEMO: Enemy = mkEnemy()

function drawOver(c: CanvasRenderingContext2D, g: Game, H: number) {
  const r = g.result
  if (!r) return
  const k = easeOut(Math.min(1, g.phaseT / 0.5))
  c.fillStyle = `rgba(10,6,24,${0.55 * k})`
  c.fillRect(0, 0, WORLD_W, H)
  const pw = 300
  const ph = 300
  const px = (WORLD_W - pw) / 2
  const py = Math.max(20, (H - ph) / 2 - 10) + (1 - k) * 40
  c.globalAlpha = k
  panel(c, px, py, pw, ph)
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  const title = r.best ? '최고 기록!' : g.lostToBoss ? '보스한테 졌다…' : '게임 오버'
  if (r.best) {
    c.save()
    c.shadowColor = '#ffd94a'
    c.shadowBlur = 16
    outlined(c, title, WORLD_W / 2, py + 36, pw - 40, 26, '#ffe680')
    c.restore()
    for (let i = 0; i < 6; i++) {
      const a = g.time * 1.5 + (i * Math.PI) / 3
      c.drawImage(sprites().star, WORLD_W / 2 + Math.cos(a) * 110 - 8, py + 36 + Math.sin(a) * 18 - 8, 16, 16)
    }
  } else outlined(c, title, WORLD_W / 2, py + 36, pw - 40, 24, '#ff8fc8')
  // 점수 (올라가며 세기)
  const shown = Math.round(r.score * easeOut(Math.min(1, g.phaseT / 1.1)))
  outlined(c, '점수', WORLD_W / 2, py + 78, 100, 11, '#a99ccc')
  outlined(c, shown.toLocaleString(), WORLD_W / 2, py + 106, pw - 40, 34, '#ffffff')
  const stats: [string, string][] = [
    ['웨이브', `${r.wave}`],
    ['최대 콤보', `${r.combo}`],
    ['최고 기록', `${Math.max(r.prevBest, r.score).toLocaleString()}`],
  ]
  for (let i = 0; i < stats.length; i++) {
    const cx = px + (pw / 3) * (i + 0.5)
    outlined(c, stats[i][0], cx, py + 150, pw / 3 - 10, 10, '#a99ccc')
    outlined(c, stats[i][1], cx, py + 170, pw / 3 - 10, 15, '#9ff7ff')
  }
  // 버튼
  const bw = 124
  const bh = 46
  const by = py + ph - bh - 22
  const again = { x: px + 20, y: by, w: bw, h: bh }
  const quit = { x: px + pw - 20 - bw, y: by, w: bw, h: bh }
  g.buttons = { again, quit }
  button(c, again, '한 판 더', '#ffd94a', '#ff9f43', g.time)
  button(c, quit, '그만하기', '#e8e2ff', '#a99ccc', 0)
  c.globalAlpha = 1
}

function button(c: CanvasRenderingContext2D, r: Rect, label: string, top: string, bot: string, t: number) {
  const bob = t ? Math.sin(t * 4) * 1.5 : 0
  c.fillStyle = '#0c0718'
  c.beginPath()
  c.roundRect(r.x + 2, r.y + 4, r.w, r.h, 14)
  c.fill()
  const gr = c.createLinearGradient(0, r.y, 0, r.y + r.h)
  gr.addColorStop(0, top)
  gr.addColorStop(1, bot)
  c.fillStyle = gr
  c.strokeStyle = '#0c0718'
  c.lineWidth = 2.5
  c.beginPath()
  c.roundRect(r.x, r.y - bob, r.w, r.h, 14)
  c.fill()
  c.stroke()
  c.fillStyle = 'rgba(255,255,255,0.45)'
  c.beginPath()
  c.roundRect(r.x + 8, r.y + 5 - bob, r.w - 16, 6, 3)
  c.fill()
  c.fillStyle = '#2a1640'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  fitText(c, label, r.x + r.w / 2, r.y + r.h / 2 + 1 - bob, r.w - 16, 16)
}

/** 넓은 화면: 양옆 장식 패널 (점수 · 목숨 · 웨이브 · 조작법) */
function drawSide(c: CanvasRenderingContext2D, g: Game, w: number, h: number) {
  const f = g.view.f
  // 바닥 무늬: 은은한 별 + 그라데이션
  const bg = c.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#191431')
  bg.addColorStop(1, '#231a3d')
  c.fillStyle = bg
  c.fillRect(0, 0, w, h)
  c.fillStyle = 'rgba(200,180,255,0.35)'
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % w
    const y = (i * 53 + g.time * 4 * ((i % 3) + 1)) % h
    if (x > f.x - 6 && x < f.x + f.w + 6) continue
    c.globalAlpha = 0.3 + 0.3 * Math.sin(g.time * 2 + i)
    c.fillRect(x, y, 2, 2)
  }
  c.globalAlpha = 1
  const leftW = f.x
  if (leftW < 140) return
  const pw = Math.min(280, leftW - 48)
  const p = g.pilot
  const lx = f.x - 24 - pw
  const rx = f.x + f.w + 24
  const top = Math.max(24, h * 0.12)
  c.textAlign = 'center'
  c.textBaseline = 'middle'

  // 왼쪽: 점수 · 콤보 · 웨이브
  panel(c, lx, top, pw, 220)
  outlined(c, '점수', lx + pw / 2, top + 30, pw - 30, 15, '#a99ccc')
  outlined(c, p.score.toLocaleString(), lx + pw / 2, top + 66, pw - 30, 40, '#ffffff')
  outlined(c, `최고 ${Math.max(g.best, p.score).toLocaleString()}`, lx + pw / 2, top + 102, pw - 30, 14, '#ffd94a')
  c.fillStyle = 'rgba(201,162,255,0.25)'
  c.fillRect(lx + 24, top + 122, pw - 48, 2)
  outlined(c, '웨이브', lx + pw / 2 - pw / 4, top + 150, pw / 2 - 20, 14, '#a99ccc')
  outlined(c, `${g.wave}`, lx + pw / 2 - pw / 4, top + 182, pw / 2 - 20, 26, '#9ff7ff')
  outlined(c, '콤보', lx + pw / 2 + pw / 4, top + 150, pw / 2 - 20, 14, '#a99ccc')
  outlined(c, p.combo >= 2 ? `${p.combo}` : '-', lx + pw / 2 + pw / 4, top + 180, pw / 2 - 20, 26, p.combo >= 8 ? '#ffd94a' : '#ffffff')
  if (p.combo >= 8) outlined(c, `x${comboMult(p.combo).toFixed(1)}`, lx + pw / 2 + pw / 4, top + 204, pw / 2 - 20, 13, '#ff8fc8')

  // 왼쪽 아래: 작은 행성 장식
  const py2 = Math.min(h - 70, top + 300)
  const pg = c.createRadialGradient(lx + pw * 0.35 - 10, py2 - 10, 4, lx + pw * 0.35, py2, 40)
  pg.addColorStop(0, '#9ff7ff')
  pg.addColorStop(1, '#3a5fb0')
  c.fillStyle = pg
  c.beginPath()
  c.arc(lx + pw * 0.35, py2, 36, 0, Math.PI * 2)
  c.fill()
  c.strokeStyle = 'rgba(255,230,128,0.7)'
  c.lineWidth = 4
  c.beginPath()
  c.ellipse(lx + pw * 0.35, py2, 60, 13, -0.3, 0, Math.PI * 2)
  c.stroke()
  c.drawImage(sprites().star, lx + pw * 0.8 - 12, py2 - 30 + Math.sin(g.time * 2) * 4, 24, 24)
  c.drawImage(sprites().star, lx + pw * 0.7 - 8, py2 + 22 + Math.sin(g.time * 2 + 1) * 4, 16, 16)

  // 오른쪽: 목숨 · 파워업 · 조작
  panel(c, rx, top, pw, 150)
  outlined(c, '목숨', rx + pw / 2, top + 30, pw - 30, 15, '#a99ccc')
  drawHearts(c, rx + pw / 2 - 44, top + 66, p.lives, 16, 44, g.time)
  outlined(c, '파워업', rx + pw / 2, top + 104, pw - 30, 14, '#a99ccc')
  const n = (p.spread > 0 ? 1 : 0) + (p.shield ? 1 : 0) + (p.magnet > 0 ? 1 : 0)
  if (n === 0) outlined(c, '없음', rx + pw / 2, top + 128, pw - 30, 13, '#6f6496')
  else {
    c.save()
    c.translate(rx + pw / 2 - (n * 20 * 1.4) / 2, top + 128)
    c.scale(1.4, 1.4)
    drawPowerIcons(c, g, 0, 0, 'left')
    c.restore()
  }
  panel(c, rx, top + 168, pw, 150)
  outlined(c, '조작', rx + pw / 2, top + 196, pw - 30, 14, '#a99ccc')
  const help = ['←→↑↓ · WASD 이동', '마우스로 끌어도 OK', '총은 자동 발사', 'Esc 나가기']
  for (let i = 0; i < help.length; i++) outlined(c, help[i], rx + pw / 2, top + 224 + i * 23, pw - 30, 13, i === 0 ? '#9ff7ff' : '#ffffff')
}

// ─── 컴포넌트 ───

export default function SpaceGame({ onResult, onClose }: GameProps) {
  const [g] = useState(newGame)
  const [cb] = useState(() => ({ onResult, onClose }))
  cb.onResult = onResult
  cb.onClose = onClose

  const finish = (gm: Game) => {
    const p = gm.pilot
    const prevBest = bestScore('space')
    const best = saveScore('space', p.score)
    gm.result = { score: p.score, wave: gm.wave, best, combo: p.bestCombo, prevBest }
    gm.best = Math.max(prevBest, p.score)
    gm.phase = 'over'
    gm.phaseT = 0
    gm.drag = null
    if (best) sfx.win()
    else sfx.lose()
    if (!gm.reported) {
      gm.reported = true
      cb.onResult({ score: p.score, line: resultLine(p.score, gm.wave, best, gm.lostToBoss) })
    }
  }

  const ref = useCanvasLoop((ctx, dt, w, h) => {
    const f = playfield(w, h)
    const s = f.w / WORLD_W
    const v = g.view
    const oldH = v.H
    v.f = f
    v.s = s
    v.H = f.h / s
    v.w = w
    v.h = h
    if (oldH !== v.H) {
      if (g.phase === 'play') clampShip(g)
      else g.ship.y = v.H - 110
    }
    step(g, dt, finish)
    render(ctx, g, w, h)
  })

  useEffect(() => {
    void document.fonts?.load(`700 16px Galmuri11`)
    // 개발용: 화면 확인 스크립트가 상태를 들여다보게
    if (import.meta.env.DEV) (window as unknown as { __space?: Game }).__space = g
    const cv = ref.current
    if (!cv) return
    const toWorld = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      const v = g.view
      return { x: (e.clientX - r.left - v.f.x) / v.s, y: (e.clientY - r.top - v.f.y) / v.s, cx: e.clientX, cy: e.clientY }
    }
    const inside = (p: { x: number; y: number }, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y - 4 && p.y <= r.y + r.h + 6
    const down = (e: PointerEvent) => {
      e.preventDefault()
      const pt = toWorld(e)
      if (g.phase === 'ready') {
        sfx.click()
        resetRound(g)
      } else if (g.phase === 'over') {
        if (g.phaseT < 0.6 || !g.buttons) return
        if (inside(pt, g.buttons.again)) {
          sfx.click()
          resetRound(g)
        } else if (inside(pt, g.buttons.quit)) {
          sfx.click()
          cb.onClose()
        }
        return
      }
      if (g.phase === 'play') {
        g.drag = { id: e.pointerId, x: pt.cx, y: pt.cy }
        try {
          cv.setPointerCapture(e.pointerId)
        } catch {
          /* 무시 */
        }
      }
    }
    const move = (e: PointerEvent) => {
      const d = g.drag
      if (!d || d.id !== e.pointerId || g.phase !== 'play') return
      e.preventDefault()
      const k = 1.2 / g.view.s
      const before = g.ship.x
      g.ship.x += (e.clientX - d.x) * k
      g.ship.y += (e.clientY - d.y) * k
      d.x = e.clientX
      d.y = e.clientY
      clampShip(g)
      g.ship.tilt = Math.max(-0.35, Math.min(0.35, g.ship.tilt * 0.6 + (g.ship.x - before) * 0.03))
    }
    const up = (e: PointerEvent) => {
      if (g.drag?.id === e.pointerId) g.drag = null
    }
    const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's', 'A', 'D', 'W', 'S', ' '])
    const kd = (e: KeyboardEvent) => {
      if (GAME_KEYS.has(e.key)) e.preventDefault()
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        if (g.phase === 'ready' || (g.phase === 'over' && g.phaseT > 0.6)) {
          sfx.click()
          resetRound(g)
        }
        return
      }
      g.keys.add(e.key)
    }
    const ku = (e: KeyboardEvent) => {
      g.keys.delete(e.key)
      // Shift 등으로 대소문자가 바뀌어도 풀리게
      g.keys.delete(e.key.toLowerCase())
      g.keys.delete(e.key.toUpperCase())
    }
    const blur = () => g.keys.clear()
    cv.addEventListener('pointerdown', down)
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointercancel', up)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', blur)
    return () => {
      cv.removeEventListener('pointerdown', down)
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerup', up)
      cv.removeEventListener('pointercancel', up)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('blur', blur)
    }
  }, [g, cb, ref])

  return (
    <div className="space-game">
      <canvas ref={ref} className="space-canvas" aria-label="우주 대결 게임 화면" />
    </div>
  )
}
