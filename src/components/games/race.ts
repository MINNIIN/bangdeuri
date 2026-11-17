/**
 * 붕붕레이서 순수 로직: 길 만들기 · 원근 투영 · 차 움직임 · 부딪힘 · 점수.
 * 화면 그리기는 RaceGame.tsx. 여기는 테스트하기 쉬운 계산만.
 *
 * 좌표: z = 길을 따라 간 거리(월드 단위), x = 길 폭 기준 (−1 왼쪽 가장자리 · 0 가운데 · 1 오른쪽 가장자리)
 */

export const SEG_LEN = 200
/** 길 반폭 (월드 단위) */
export const ROAD_W = 2000
export const LANES = 3
/** 몇 조각마다 연석 색이 바뀌나 */
export const RUMBLE = 3
export const CAM_H = 1000
export const CAM_DEPTH = 1 / Math.tan(((100 / 2) * Math.PI) / 180)
/** 카메라에서 내 차까지 거리 */
export const PLAYER_Z = CAM_H * CAM_DEPTH
export const DRAW_DIST = 150

export const MAX_SPEED = SEG_LEN * 60
const ACCEL = MAX_SPEED / 4.5
const BRAKE = -MAX_SPEED * 1.1
const OFF_DECEL = -MAX_SPEED / 1.6
export const OFF_LIMIT = MAX_SPEED / 4
const CENTRIFUGAL = 0.3
const X_LIMIT = 2.2

/** 차 폭 (길 반폭 기준) */
export const PLAYER_W = 0.36
export const CAR_W = 0.36

// ─── 길 장식 ───
export const D = { NONE: 0, TREE: 1, PINE: 2, BUSH: 3, LAMP: 4, CHEV_L: 5, CHEV_R: 6, BOARD: 7, HOUSE: 8 } as const

export interface Seg {
  i: number
  curve: number
  y1: number
  y2: number
  /** 왼쪽 · 오른쪽 장식 종류와 위치(x) */
  dl: number
  dlx: number
  dr: number
  drx: number
  /** 그리기용 (매 프레임 덮어쓴다 · 할당 없이) */
  sx1: number
  sy1: number
  sw1: number
  sc1: number
  sx2: number
  sy2: number
  sw2: number
  clip: number
  vis: boolean
}

/** 씨앗으로 정해지는 난수 (mulberry32) */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const easeIn = (a: number, b: number, k: number) => a + (b - a) * k * k
const easeInOut = (a: number, b: number, k: number) => a + (b - a) * (-Math.cos(k * Math.PI) / 2 + 0.5)

export function buildTrack(seed: number): Seg[] {
  const r = rng(seed)
  const segs: Seg[] = []
  const lastY = () => (segs.length ? segs[segs.length - 1].y2 : 0)
  const add = (curve: number, y: number) => {
    segs.push({ i: segs.length, curve, y1: lastY(), y2: y, dl: 0, dlx: 0, dr: 0, drx: 0, sx1: 0, sy1: 0, sw1: 0, sc1: 0, sx2: 0, sy2: 0, sw2: 0, clip: 0, vis: false })
  }
  const road = (enter: number, hold: number, leave: number, curve: number, height: number) => {
    const y0 = lastY()
    const y1 = y0 + height * SEG_LEN
    const total = enter + hold + leave
    let k = 0
    for (let n = 0; n < enter; n++) add(easeIn(0, curve, n / enter), easeInOut(y0, y1, ++k / total))
    for (let n = 0; n < hold; n++) add(curve, easeInOut(y0, y1, ++k / total))
    for (let n = 0; n < leave; n++) add(easeInOut(curve, 0, n / leave), easeInOut(y0, y1, ++k / total))
  }
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]
  const sign = () => (r() < 0.5 ? -1 : 1)
  const hill = (h: number) => {
    // 너무 높이 · 깊이 가지 않게
    const now = lastY() / SEG_LEN
    if (Math.abs(now + h) > 70) return -h
    return h
  }

  road(10, 30, 10, 0, 0)
  while (segs.length < 1500) {
    const kind = r()
    if (kind < 0.15) road(25, 25, 25, 0, 0)
    else if (kind < 0.4) road(25, 30 + Math.floor(r() * 30), 25, sign() * pick([2, 4, 4, 6]), hill(pick([0, 0, 20, -20])))
    else if (kind < 0.55) {
      const s = sign()
      road(25, 25, 25, s * pick([2, 4]), 0)
      road(25, 25, 25, -s * pick([4, 6]), hill(pick([20, -20, 40])))
    } else if (kind < 0.75) road(30, 30, 30, 0, hill(sign() * pick([20, 40, 60])))
    else if (kind < 0.88) {
      for (const h of [8, -12, 10, -6]) road(10, 10, 10, 0, hill(h))
    } else road(30, 40, 30, sign() * pick([4, 6]), hill(sign() * 40))
  }
  // 처음 높이로 돌아와서 한 바퀴가 이어지게
  road(30, 20, 30, 0, -lastY() / SEG_LEN)
  segs[segs.length - 1].y2 = 0

  decorate(segs, r)
  return segs
}

function decorate(segs: Seg[], r: () => number) {
  const greens = [D.TREE, D.TREE, D.PINE, D.PINE, D.BUSH]
  for (const s of segs) {
    const i = s.i
    if (i < 6) continue
    const c = s.curve
    if (Math.abs(c) >= 3 && i % 6 === 0) {
      // 굽은 길 바깥쪽에 화살표
      if (c > 0) {
        s.dl = D.CHEV_R
        s.dlx = -1.3
      } else {
        s.dr = D.CHEV_L
        s.drx = 1.3
      }
    }
    if (i % 24 === 0) {
      if (!s.dl) {
        s.dl = D.LAMP
        s.dlx = -1.18
      }
      if (!s.dr) {
        s.dr = D.LAMP
        s.drx = 1.18
      }
      continue
    }
    if (i % 137 === 40) {
      const left = r() < 0.5
      if (left && !s.dl) {
        s.dl = D.BOARD
        s.dlx = -1.75
      } else if (!s.dr) {
        s.dr = D.BOARD
        s.drx = 1.75
      }
      continue
    }
    if (!s.dl && r() < 0.42) {
      const far = r() < 0.12
      s.dl = far ? D.HOUSE : greens[Math.floor(r() * greens.length)]
      s.dlx = far ? -(3.4 + r() * 2) : -(1.45 + r() * 2.4)
    }
    if (!s.dr && r() < 0.42) {
      const far = r() < 0.12
      s.dr = far ? D.HOUSE : greens[Math.floor(r() * greens.length)]
      s.drx = far ? 3.4 + r() * 2 : 1.45 + r() * 2.4
    }
  }
}

/** 월드 z → 조각 번호 (한 바퀴 감기) */
export function segIndexAt(z: number, len: number) {
  const n = Math.floor(z / SEG_LEN) % len
  return n < 0 ? n + len : n
}

export interface Proj {
  sx: number
  sy: number
  sw: number
  scale: number
}

/**
 * 원근 투영 (out에 써서 할당 없음).
 * cx, cy = 화면 기준점(소실점), kx, ky = 가로·세로 배율.
 */
export function project(out: Proj, x: number, y: number, z: number, camX: number, camY: number, camZ: number, cx: number, cy: number, kx: number, ky: number) {
  const scale = CAM_DEPTH / (z - camZ)
  out.scale = scale
  out.sx = cx + scale * (x - camX) * kx
  out.sy = cy - scale * (y - camY) * ky
  out.sw = scale * ROAD_W * kx
  return out
}

export interface Car {
  x: number
  speed: number
}
export interface Input {
  left: boolean
  right: boolean
  brake: boolean
}

/** 한 프레임 운전. 풀밭이면 true */
export function stepPlayer(p: Car, input: Input, curve: number, dt: number): boolean {
  const pct = p.speed / MAX_SPEED
  const dx = dt * 2 * pct
  if (input.left && !input.right) p.x -= dx
  else if (input.right && !input.left) p.x += dx
  p.x -= dx * pct * curve * CENTRIFUGAL
  if (input.brake) p.speed += BRAKE * dt
  else p.speed += ACCEL * dt
  const off = Math.abs(p.x) > 1
  if (off && p.speed > OFF_LIMIT) p.speed = Math.max(OFF_LIMIT, p.speed + OFF_DECEL * dt)
  p.x = Math.max(-X_LIMIT, Math.min(X_LIMIT, p.x))
  p.speed = Math.max(0, Math.min(MAX_SPEED, p.speed))
  return off
}

export function overlap(x1: number, w1: number, x2: number, w2: number) {
  return Math.abs(x1 - x2) < (w1 + w2) / 2
}

export interface Traffic {
  /** 월드 z (감지 않은 누적 거리) */
  z: number
  x: number
  speed: number
  /** 색 번호 */
  color: number
  /** 모양 번호 */
  kind: number
}

const LANE_X = [-0.66, 0, 0.66]

/** playerZ(차 위치) 바로 앞에 있고 같은 줄이며 내가 더 빠르면 부딪힌 차 번호 */
export function hitCar(cars: Traffic[], playerZ: number, playerX: number, speed: number): number {
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i]
    const dz = c.z - playerZ
    if (dz < 0 || dz > SEG_LEN * 0.8) continue
    if (speed <= c.speed) continue
    if (overlap(playerX, PLAYER_W, c.x, CAR_W)) return i
  }
  return -1
}

export function spawnTraffic(n: number, startZ: number, seed: number): Traffic[] {
  const r = rng(seed)
  const cars: Traffic[] = []
  for (let i = 0; i < n; i++) {
    cars.push({
      z: startZ + SEG_LEN * (25 + i * 22 + r() * 12),
      x: LANE_X[Math.floor(r() * 3)],
      speed: MAX_SPEED * (0.25 + r() * 0.3),
      color: Math.floor(r() * 6),
      kind: Math.floor(r() * 3),
    })
  }
  return cars
}

export function moveTraffic(cars: Traffic[], dt: number) {
  for (const c of cars) c.z += c.speed * dt
}

/** 뒤로 한참 처진 차는 저 앞으로 다시 보낸다 */
export function recycleTraffic(cars: Traffic[], playerZ: number, rnd: () => number) {
  for (const c of cars) {
    if (c.z > playerZ - SEG_LEN * 3) continue
    c.z = playerZ + SEG_LEN * (DRAW_DIST * 0.7 + rnd() * DRAW_DIST * 0.6)
    c.x = LANE_X[Math.floor(rnd() * 3)]
    c.speed = MAX_SPEED * (0.25 + rnd() * 0.3)
    c.color = Math.floor(rnd() * 6)
    c.kind = Math.floor(rnd() * 3)
  }
}

/** k번째(1부터) 체크포인트가 있는 누적 조각 번호. 갈수록 멀어진다 */
export function checkpointSeg(k: number) {
  return 550 * k + 100 * k * (k - 1)
}

export const START_TIME = 60
export const CHECK_BONUS = 10

export const kmh = (speed: number) => Math.round((speed / MAX_SPEED) * 280)
export const metres = (z: number) => Math.round((z / SEG_LEN) * 2)

export interface RunStats {
  metres: number
  crashes: number
  /** 빠르게 굽은 길을 탄 초 */
  drift: number
  checkpoints: number
}

/** 게임 끝나고 미니미가 말할 한 줄 (20자 안) */
export function resultLine(s: RunStats): string {
  if (s.crashes >= 6) return '차를 너무 많이 박았다…'
  if (s.drift >= 6) return '드리프트 장인 등극!'
  if (s.crashes === 0 && s.metres >= 5000) return '무사고 베스트 드라이버!'
  if (s.checkpoints >= 4) return '체크포인트 사냥꾼!'
  return `${s.metres.toLocaleString()}m 붕붕 달렸다!`
}
