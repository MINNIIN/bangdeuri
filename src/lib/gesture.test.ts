import { describe, expect, it } from 'vitest'
import { pinchMode, ROTATE_GAIN, twist } from './gesture'

describe('두 손가락 제스처', () => {
  it('처음엔 아무것도 정하지 않는다 (손가락이 살짝 흔들리는 정도)', () => {
    expect(pinchMode('wait', 1.02, 0.03)).toBe('wait')
  })

  it('먼저 비틀면 회전으로 잠긴다 — 이후 거리가 좀 바뀌어도 확대하지 않는다', () => {
    expect(pinchMode('wait', 1.03, 0.2)).toBe('rotate')
    expect(pinchMode('rotate', 1.3, 0.3)).toBe('rotate')
  })

  it('먼저 벌리면 확대로 잠긴다', () => {
    expect(pinchMode('wait', 1.2, 0.05)).toBe('zoom')
    expect(pinchMode('wait', 0.8, 0.05)).toBe('zoom')
  })

  it('확대 중이라도 크게 비틀면 회전도 같이 된다', () => {
    expect(pinchMode('zoom', 1.4, 0.1)).toBe('zoom')
    expect(pinchMode('zoom', 1.4, 0.5)).toBe('both')
  })

  it('두 손가락을 나란히 옆으로 밀면 회전, 위아래로 밀면 기울이기로 잠긴다', () => {
    expect(pinchMode('wait', 1.01, 0.02, { dx: 10, dy: 4 })).toBe('wait')
    expect(pinchMode('wait', 1.01, 0.02, { dx: 40, dy: 8 })).toBe('rotate')
    expect(pinchMode('wait', 1.01, 0.02, { dx: -6, dy: 40 })).toBe('tilt')
    // 잠긴 뒤에는 손가락 거리가 바뀌어도 확대하지 않는다
    expect(pinchMode('rotate', 1.3, 0.02, { dx: 60, dy: 0 })).toBe('rotate')
    expect(pinchMode('tilt', 0.7, 0.02, { dx: 0, dy: 60 })).toBe('tilt')
  })

  it('벌리면서 가운데가 조금 움직여도 확대다', () => {
    expect(pinchMode('wait', 1.25, 0.02, { dx: 30, dy: 10 })).toBe('zoom')
  })

  it('회전은 손가락보다 조금 더 크게 돈다', () => {
    expect(ROTATE_GAIN).toBeGreaterThan(1)
  })

  it('각도 차이를 -π~π로 맞춘다', () => {
    expect(twist(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2)
    expect(twist(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2)
    expect(twist(0.1, 0.3)).toBeCloseTo(0.2)
  })
})
