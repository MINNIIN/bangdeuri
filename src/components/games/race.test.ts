import { describe, expect, it } from 'vitest'
import {
  buildTrack,
  CAM_DEPTH,
  CAM_H,
  checkpointSeg,
  hitCar,
  kmh,
  MAX_SPEED,
  metres,
  OFF_LIMIT,
  overlap,
  project,
  type Proj,
  recycleTraffic,
  resultLine,
  ROAD_W,
  SEG_LEN,
  segIndexAt,
  spawnTraffic,
  stepPlayer,
} from './race'

describe('buildTrack', () => {
  it('같은 씨앗이면 같은 길, 길이는 넉넉하게', () => {
    const a = buildTrack(7)
    const b = buildTrack(7)
    expect(a.length).toBeGreaterThan(1000)
    expect(a.map((s) => s.curve)).toEqual(b.map((s) => s.curve))
  })
  it('출발선 근처는 평평한 직선', () => {
    const t = buildTrack(3)
    for (let i = 0; i < 20; i++) {
      expect(t[i].curve).toBe(0)
      expect(t[i].y1).toBe(0)
    }
  })
  it('높이가 이어지고 한 바퀴 돌면 처음 높이로 돌아온다', () => {
    const t = buildTrack(11)
    for (let i = 0; i < t.length - 1; i++) expect(t[i].y2).toBeCloseTo(t[i + 1].y1, 6)
    expect(t[t.length - 1].y2).toBeCloseTo(0, 6)
  })
  it('굽은 길도 언덕도 있다', () => {
    const t = buildTrack(5)
    expect(t.some((s) => Math.abs(s.curve) >= 3)).toBe(true)
    expect(t.some((s) => Math.abs(s.y2) > 2000)).toBe(true)
  })
})

describe('segIndexAt', () => {
  it('길이를 넘으면 처음으로 감는다', () => {
    expect(segIndexAt(0, 100)).toBe(0)
    expect(segIndexAt(SEG_LEN * 5.5, 100)).toBe(5)
    expect(segIndexAt(SEG_LEN * 103, 100)).toBe(3)
    expect(segIndexAt(-SEG_LEN, 100)).toBe(99)
  })
})

describe('project', () => {
  const o: Proj = { sx: 0, sy: 0, sw: 0, scale: 0 }
  it('바로 앞 가운데는 화면 가운데 x, 카메라 높이 아래 점은 cy+ky', () => {
    project(o, 0, 0, CAM_H * CAM_DEPTH, 0, CAM_H, 0, 200, 100, 180, 300)
    expect(o.sx).toBeCloseTo(200)
    expect(o.sy).toBeCloseTo(400)
    expect(o.sw).toBeCloseTo((ROAD_W / CAM_H) * 180)
  })
  it('멀수록 작고 지평선에 가까워진다', () => {
    project(o, 0, 0, 1000, 0, CAM_H, 0, 200, 100, 180, 300)
    const near = o.sy
    project(o, 0, 0, 20000, 0, CAM_H, 0, 200, 100, 180, 300)
    expect(o.sy).toBeLessThan(near)
    expect(o.sy).toBeGreaterThan(100)
  })
})

describe('stepPlayer', () => {
  const idle = { left: false, right: false, brake: false }
  it('저절로 가속하고 최고 속도를 넘지 않는다', () => {
    const p = { x: 0, speed: 0 }
    stepPlayer(p, idle, 0, 0.1)
    expect(p.speed).toBeGreaterThan(0)
    for (let i = 0; i < 200; i++) stepPlayer(p, idle, 0, 0.1)
    expect(p.speed).toBe(MAX_SPEED)
  })
  it('왼쪽 / 오른쪽으로 핸들', () => {
    const p = { x: 0, speed: MAX_SPEED / 2 }
    stepPlayer(p, { ...idle, left: true }, 0, 0.1)
    expect(p.x).toBeLessThan(0)
    const q = { x: 0, speed: MAX_SPEED / 2 }
    stepPlayer(q, { ...idle, right: true }, 0, 0.1)
    expect(q.x).toBeGreaterThan(0)
  })
  it('굽은 길에서는 바깥으로 밀린다', () => {
    const p = { x: 0, speed: MAX_SPEED }
    stepPlayer(p, idle, 4, 0.1)
    expect(p.x).toBeLessThan(0)
  })
  it('풀밭에서는 느려지고, 브레이크는 줄인다', () => {
    const p = { x: 1.5, speed: MAX_SPEED }
    const off = stepPlayer(p, idle, 0, 0.1)
    expect(off).toBe(true)
    expect(p.speed).toBeLessThan(MAX_SPEED)
    for (let i = 0; i < 100; i++) stepPlayer(p, idle, 0, 0.1)
    expect(p.speed).toBeLessThanOrEqual(OFF_LIMIT + 1)
    const b = { x: 0, speed: MAX_SPEED }
    stepPlayer(b, { ...idle, brake: true }, 0, 0.1)
    expect(b.speed).toBeLessThan(MAX_SPEED * 0.95)
  })
  it('너무 멀리 나가지 않는다', () => {
    const p = { x: 0, speed: MAX_SPEED }
    for (let i = 0; i < 300; i++) stepPlayer(p, { ...idle, right: true }, 0, 0.1)
    expect(p.x).toBeLessThanOrEqual(2.2)
  })
})

describe('overlap · hitCar', () => {
  it('겹치는지', () => {
    expect(overlap(0, 0.3, 0.2, 0.3)).toBe(true)
    expect(overlap(0, 0.3, 0.8, 0.3)).toBe(false)
  })
  it('바로 앞 같은 줄 차에만 부딪힌다', () => {
    const cars = [
      { z: 1000 + SEG_LEN * 0.3, x: 0.05, speed: 2000, color: 0, kind: 0 },
      { z: 1000 + SEG_LEN * 10, x: 0, speed: 2000, color: 0, kind: 0 },
    ]
    expect(hitCar(cars, 1000, 0, MAX_SPEED)).toBe(0)
    expect(hitCar(cars, 1000, 0.8, MAX_SPEED)).toBe(-1)
    // 내가 더 느리면 안 부딪힌다 (뒤에서 박는 것만)
    expect(hitCar(cars, 1000, 0, 1000)).toBe(-1)
  })
})

describe('traffic', () => {
  it('앞쪽에 흩어 놓고, 뒤로 처진 차는 앞으로 다시 보낸다', () => {
    const cars = spawnTraffic(10, 0, 1)
    expect(cars).toHaveLength(10)
    for (const c of cars) expect(c.z).toBeGreaterThan(SEG_LEN * 10)
    cars[0].z = 5000
    recycleTraffic(cars, 50000, Math.random)
    expect(cars[0].z).toBeGreaterThan(50000)
  })
})

describe('checkpoint · 점수', () => {
  it('체크포인트 간격은 갈수록 길어진다', () => {
    expect(checkpointSeg(1)).toBeGreaterThan(0)
    const g1 = checkpointSeg(2) - checkpointSeg(1)
    const g2 = checkpointSeg(3) - checkpointSeg(2)
    expect(g2).toBeGreaterThan(g1)
  })
  it('속도·거리 환산', () => {
    expect(kmh(MAX_SPEED)).toBe(280)
    expect(kmh(0)).toBe(0)
    expect(metres(SEG_LEN * 100)).toBe(200)
  })
  it('한 줄 평은 20자 안, 상황에 맞게', () => {
    const lines = [
      resultLine({ metres: 3000, crashes: 8, drift: 0, checkpoints: 1 }),
      resultLine({ metres: 9000, crashes: 0, drift: 2, checkpoints: 4 }),
      resultLine({ metres: 6000, crashes: 2, drift: 9, checkpoints: 3 }),
      resultLine({ metres: 1200, crashes: 2, drift: 1, checkpoints: 0 }),
    ]
    for (const l of lines) expect(l.length).toBeLessThan(20)
    expect(lines[0]).toContain('박았다')
    expect(lines[2]).toContain('드리프트')
  })
})
