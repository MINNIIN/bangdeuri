import { describe, expect, it } from 'vitest'
import {
  buildTown,
  doorStep,
  findHouseWorldPath,
  findTownPath,
  guestSpot,
  houseToUv,
  isArea,
  isPlace,
  layoutLots,
  lotAtYard,
  MAX_HOUSES,
  obstacleBlocker,
  parkSeats,
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

describe('집 안 길찾기', () => {
  it('가구가 있으면 뚫고 가지 않고 돌아간다', () => {
    // 거실 한가운데 탁자 (가로 2m, 돌려 놓음)
    const table = { x: -2, z: -1.5, hw: 1, hd: 0.4, yaw: 0.3 }
    const block = obstacleBlocker([table])
    const from = { x: -2, z: -0.6 }
    const to = { x: -2, z: -2.4 }
    const path = findHouseWorldPath(from, to, block)
    expect(path.length).toBeGreaterThan(1)
    let cur = from
    for (const p of path) {
      for (let k = 1; k < 20; k++) {
        const t = k / 20
        const q = { x: cur.x + (p.x - cur.x) * t, z: cur.z + (p.z - cur.z) * t }
        const c = Math.cos(table.yaw)
        const s = Math.sin(table.yaw)
        const lx = (q.x - table.x) * c - (q.z - table.z) * s
        const lz = (q.x - table.x) * s + (q.z - table.z) * c
        expect(Math.abs(lx) < table.hw && Math.abs(lz) < table.hd).toBe(false)
      }
      cur = p
    }
    // 가구가 없으면 곧장 간다
    expect(findHouseWorldPath(from, to)).toHaveLength(1)
  })
})

describe('손님이 처음 서는 자리', () => {
  it('같은 접속 id면 어느 화면에서나 같은 자리, 다른 사람은 다른 자리', () => {
    expect(guestSpot('abc123')).toEqual(guestSpot('abc123'))
    expect(guestSpot('abc123')).not.toEqual(guestSpot('zzz999'))
  })
  it('방 주인 대문 앞 인도 위, 막힌 곳이 아니다', () => {
    const map = buildTown(['host'])
    for (const id of ['a', 'b7', 'cid-01', 'x9y8z7', 'promo']) {
      const p = guestSpot(id)
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1.2)
      expect(p.z).toBeLessThanOrEqual(-3.6)
      expect(p.z).toBeGreaterThanOrEqual(-4.4)
      expect(map.blocked(p)).toBe(false)
    }
  })
})

describe('공원 놀이터', () => {
  it('그네 두 자리 · 미끄럼틀 · 벤치 두 자리를 탈 수 있고, 어느 화면에서나 같은 자리·같은 이름', () => {
    const a = parkSeats(buildTown(['host', 'a', 'b']).props)
    const b = parkSeats(buildTown(['host', 'a', 'b']).props)
    expect(a).toEqual(b)
    expect(new Set(a.map((s) => s.key)).size).toBe(a.length)
    expect(a.filter((s) => s.item === 'p_swing')).toHaveLength(2)
    expect(a.filter((s) => s.item === 'p_slide')).toHaveLength(1)
    expect(a.filter((s) => s.item === 'p_bench').length).toBeGreaterThanOrEqual(2)
    expect(a.filter((s) => s.item === 'p_seesaw')).toHaveLength(2)
    expect(a.filter((s) => s.item === 'p_sand')).toHaveLength(2)
    // 시소 두 자리는 양 끝에서 서로 마주 본다
    const [s0, s1] = a.filter((s) => s.item === 'p_seesaw')
    expect(Math.hypot(s0.x - s1.x, s0.z - s1.z)).toBeCloseTo(2, 1)
    const face = (s: typeof s0, o: typeof s0) => Math.sin(s.yaw) * (o.x - s.x) + Math.cos(s.yaw) * (o.z - s.z)
    expect(face(s0, s1)).toBeGreaterThan(1.9)
    expect(face(s1, s0)).toBeGreaterThan(1.9)
    for (const s of a) expect(s.key.startsWith('park/')).toBe(true)
    // 그네 두 자리는 나란히 (같은 그네 틀 안에서 좌우로)
    const [l, r] = a.filter((s) => s.item === 'p_swing')
    expect(Math.abs(l.z - r.z)).toBeLessThan(0.01)
    expect(Math.abs(l.x - r.x)).toBeCloseTo(1.2, 1)
  })

  it('집이 한 채뿐이어도 공원이 꾸며져 있고, 놀이터 사이로 걸어 다닐 수 있다', () => {
    const map = buildTown(['host'])
    const kinds = new Set(map.props.map((p) => p.kind))
    for (const k of ['swing', 'slide', 'bench', 'seesaw', 'sandbox', 'mat', 'tree']) expect(kinds.has(k as never)).toBe(true)
    // 횡단보도 남쪽 끝에서 공원 안쪽으로 들어가는 길은 열려 있다
    expect(map.blocked({ x: 0, z: 5.8 })).toBe(false)
    expect(map.blocked({ x: -1.6, z: 9 })).toBe(false)
    // 시소·모래놀이터는 막혀 있다
    const seesaw = map.props.find((p) => p.kind === 'seesaw')!
    expect(map.blocked({ x: seesaw.x, z: seesaw.z })).toBe(true)
  })
})
