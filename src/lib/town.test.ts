import { describe, expect, it } from 'vitest'
import {
  buildTown,
  doorStep,
  findTownPath,
  houseToUv,
  isArea,
  isPlace,
  layoutLots,
  lotAtYard,
  MAX_HOUSES,
  roomOfArea,
  safeVec,
  slotX,
  uvToHouse,
  yardToTown,
} from './town'

describe('동네 배치', () => {
  it('가운데부터 양옆으로 집을 채우고, 같은 방은 한 번만', () => {
    expect([0, 1, 2, 3, 4].map(slotX)).toEqual([0, -13, 13, -26, 26])
    const lots = layoutLots(['host', 'a', 'b', 'a', 'c'])
    expect(lots.map((l) => l.roomId)).toEqual(['host', 'a', 'b', 'c'])
    expect(lots[0].x).toBe(0)
  })

  it('집은 최대 9채', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `r${i}`)
    expect(layoutLots(ids)).toHaveLength(MAX_HOUSES)
  })

  it('마당 좌표는 오가도 그대로', () => {
    const [lot] = layoutLots(['host'])
    const p = yardToTown(lot, { u: 0.3, v: 0.7 })
    const back = lotAtYard([lot], p)
    expect(back?.lot.roomId).toBe('host')
    expect(back!.uv.u).toBeCloseTo(0.3)
    expect(back!.uv.v).toBeCloseTo(0.7)
    // 차도는 마당이 아니다
    expect(lotAtYard([lot], { x: 0, z: 0 })).toBeNull()
  })

  it('집 안 좌표도 오가도 그대로', () => {
    const uv = houseToUv(uvToHouse({ u: 0.2, v: 0.8 }))
    expect(uv.u).toBeCloseTo(0.2)
    expect(uv.v).toBeCloseTo(0.8)
  })
})

describe('골목 길찾기', () => {
  const map = buildTown(['host', 'a', 'b'])

  it('집과 울타리는 막혀 있고, 차도와 대문은 지나간다', () => {
    expect(map.blocked({ x: 0, z: -13 })).toBe(true)
    expect(map.blocked({ x: 3, z: -5 })).toBe(true)
    expect(map.blocked({ x: 0, z: -5 })).toBe(false)
    expect(map.blocked({ x: 5, z: 0 })).toBe(false)
  })

  it('옆집 마당으로 가려면 대문으로 나갔다 들어간다', () => {
    const [host, a] = map.lots
    const from = doorStep(host)
    const to = doorStep(a)
    const path = findTownPath(map, from, to)
    expect(path.length).toBeGreaterThan(1)
    expect(path[path.length - 1].x).toBeCloseTo(to.x, 0)
    // 중간에 인도(울타리 앞)를 지난다
    expect(path.some((p) => p.z > -5)).toBe(true)
    // 가는 길이 막힌 곳을 지나지 않는다
    let cur = from
    for (const p of path) {
      for (let k = 1; k < 10; k++) {
        const t = k / 10
        expect(map.blocked({ x: cur.x + (p.x - cur.x) * t, z: cur.z + (p.z - cur.z) * t })).toBe(false)
      }
      cur = p
    }
  })
})

describe('받은 값 검사', () => {
  it('곳 · 자리 · 둔 곳', () => {
    expect(isArea('town')).toBe(true)
    expect(isArea('house:abc123')).toBe(true)
    expect(isArea('house:<script>')).toBe(false)
    expect(isArea(3)).toBe(false)
    expect(roomOfArea('house:abc')).toBe('abc')
    expect(roomOfArea('town')).toBeNull()
    expect(safeVec({ x: 1, z: 2 })).toEqual({ x: 1, z: 2 })
    expect(safeVec({ x: Infinity, z: 2 })).toBeNull()
    expect(safeVec({ x: 1e6, z: 2 })).toBeNull()
    expect(safeVec('x')).toBeNull()
    expect(isPlace('yard')).toBe(true)
    expect(isPlace('roof')).toBe(false)
  })
})
