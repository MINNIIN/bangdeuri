/**
 * 두 손가락 제스처: 벌리기(확대)와 비틀기(회전)를 한꺼번에 받으면
 * 비틀 때 손가락 거리도 조금씩 바뀌어서 확대가 회전을 가로챈다.
 * 그래서 먼저 뚜렷하게 움직인 쪽으로 잠근다.
 */
export type PinchMode = 'wait' | 'zoom' | 'rotate' | 'both'

/** 이만큼 비틀면 회전으로 본다 (라디안, 약 6°) */
const ROTATE_START = 0.1
/** 손가락 거리가 이만큼 바뀌면 확대로 본다 (배율) */
const ZOOM_START = 0.12
/** 확대하던 중 이만큼 크게 비틀면 회전도 같이 한다 (약 23°) */
const ROTATE_LATE = 0.4

/** 회전은 ±30°밖에 안 되니 손가락보다 조금 더 돌린다 */
export const ROTATE_GAIN = 1.6

/** ratio: 지금 손가락 거리 / 처음 거리, turn: 처음보다 비튼 각도 */
export function pinchMode(mode: PinchMode, ratio: number, turn: number): PinchMode {
  const zoomed = Math.abs(Math.log(ratio)) > ZOOM_START
  const turned = Math.abs(turn)
  if (mode === 'wait') {
    if (turned > ROTATE_START) return 'rotate'
    if (zoomed) return 'zoom'
    return 'wait'
  }
  if (mode === 'zoom' && turned > ROTATE_LATE) return 'both'
  return mode
}

/** 두 각도 차이 (to - from)를 -π~π로 */
export function twist(from: number, to: number) {
  let t = to - from
  while (t > Math.PI) t -= Math.PI * 2
  while (t < -Math.PI) t += Math.PI * 2
  return t
}
