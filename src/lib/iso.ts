/**
 * 아이소메트릭 방 좌표. SVG viewBox는 340×300.
 * 바닥 마름모의 뒤 꼭짓점이 (170, 125), u축은 오른쪽 아래, v축은 왼쪽 아래로 160칸씩.
 */
export const VIEW_W = 340
export const VIEW_H = 300
const BACK_X = 170
const BACK_Y = 125
const EX = 160
const EY = 80

export const FLOOR_MIN = 0.04
export const FLOOR_MAX = 0.96

export function floorPoint(u: number, v: number) {
  return { x: BACK_X + EX * (u - v), y: BACK_Y + EY * (u + v) }
}

export function toFloor(x: number, y: number) {
  const a = (x - BACK_X) / EX
  const b = (y - BACK_Y) / EY
  return { u: (a + b) / 2, v: (b - a) / 2 }
}

const clamp = (n: number) => Math.min(FLOOR_MAX, Math.max(FLOOR_MIN, n))

/** 바닥 밖을 눌러도 가장 가까운 바닥 안쪽으로 붙인다 */
export function clampFloor(p: { u: number; v: number }) {
  return { u: clamp(p.u), v: clamp(p.v) }
}

/** 뒤(작은 값)부터 그린다 */
export const depth = (p: { u: number; v: number }) => p.u + p.v

/** 방 주인 미니미가 서 있는 자리 */
export const CHARACTER_SPOT = { u: 0.5, v: 0.5 }

/** 방 가운데를 축으로 바닥 좌표를 돌린다 (θ 라디안, 화면에서 보는 회전) */
export function rotateFloor(p: { u: number; v: number }, theta: number) {
  const du = p.u - 0.5
  const dv = p.v - 0.5
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  return { u: 0.5 + du * c - dv * s, v: 0.5 + du * s + dv * c }
}

/** 돌아간 방에서의 바닥 좌표 → 화면 좌표 */
export const project = (p: { u: number; v: number }, theta: number) => {
  const r = rotateFloor(p, theta)
  return floorPoint(r.u, r.v)
}

/** 화면 좌표 → 원래(안 돌린) 바닥 좌표 */
export function unproject(x: number, y: number, theta: number) {
  return rotateFloor(toFloor(x, y), -theta)
}

/** 화면 기준 깊이: 뒤(작은 값)부터 그린다 */
export const viewDepth = (p: { u: number; v: number }, theta: number) => depth(rotateFloor(p, theta))

/** 방은 좌우로 살짝만 돌아간다 (±30°). 이 안에서는 처음 보이던 두 벽이 계속 보인다 */
export const MAX_TILT = Math.PI / 6

export const clampTilt = (theta: number) => Math.min(MAX_TILT, Math.max(-MAX_TILT, theta))

/** 끌 때 한도를 넘으면 고무줄처럼 조금만 더 따라간다 */
export function rubberTilt(theta: number) {
  const over = Math.abs(theta) - MAX_TILT
  if (over <= 0) return theta
  return Math.sign(theta) * (MAX_TILT + over * 0.2)
}
