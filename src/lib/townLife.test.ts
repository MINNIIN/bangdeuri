import { describe, expect, it } from 'vitest'
import { interactionFor } from './interactions'
import { buildTown, findTownPath, guestSpot, MAX_HOUSES, parkSeats } from './town'
import { BUS_PERIOD, BUS_RUN, BUS_STOP, busAt, busHits, busPhase, CAT_SEEDS, catAt, catRoute } from './townLife'

const towns = { '집 한 채': ['host'], '집 열일곱 채': Array.from({ length: MAX_HOUSES }, (_, i) => `r${i}`) }

describe('붕어빵 노점 · 버스정류장 · 입주 대기 팻말', () => {
  for (const [name, ids] of Object.entries(towns)) {
    it(`${name}: 자리가 있고, 손님 자리에서 걸어갈 수 있고, 누르면 할 일이 있다`, () => {
      const map = buildTown(ids)
      const seats = parkSeats(map.props)
      const start = guestSpot('promo')
      for (const item of ['o_bungeo', 'o_bus']) {
        const list = seats.filter((s) => s.item === item)
        expect(list.length, item).toBeGreaterThan(0)
        expect(interactionFor(item), item).toBeDefined()
        for (const s of list) {
          const goal = { x: s.x + Math.sin(s.yaw) * 0.6, z: s.z + Math.cos(s.yaw) * 0.6 }
          expect(findTownPath(map, start, goal).length, s.key).toBeGreaterThan(0)
        }
      }
      expect(seats.filter((s) => s.item === 'o_bus')).toHaveLength(3)
      // 빈 집터 팻말은 빈 칸마다 하나
      expect(seats.filter((s) => s.item === 'e_lotsign')).toHaveLength(21 - ids.length)
      expect(interactionFor('e_lotsign')).toBeDefined()
    })
  }
})

describe('버스', () => {
  it('주기마다 같은 모습, 대부분은 안 다닌다', () => {
    const t = 1_700_000_000_000
    for (let k = 0; k < BUS_PERIOD; k += 7000) expect(busPhase(t + k)).toEqual(busPhase(t + k + BUS_PERIOD))
    let on = 0
    for (let k = 0; k < BUS_PERIOD; k += 1000) if (busPhase(t + k) !== null) on++
    expect(on).toBeGreaterThan(0)
    expect(on).toBeLessThan(BUS_PERIOD / 1000 / 3)
    for (let k = 0; k < BUS_PERIOD; k += 500) {
      const p = busPhase(t + k)
      if (p !== null) {
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThanOrEqual(1)
      }
    }
  })
  // 한 주기의 시작 (busPhase가 0인 때)
  const t0 = Math.ceil(1_700_000_000_000 / BUS_PERIOD) * BUS_PERIOD
  const route = { x0: -90, x1: 90 }

  it('버스 자리: 서쪽에서 와서 정류장에 섰다가 동쪽으로 간다, 안 다닐 때는 없다', () => {
    expect(busAt(t0 + BUS_RUN + 1000, route)).toBeNull()
    const start = busAt(t0, route)!
    expect(start.x).toBeCloseTo(route.x0)
    expect(start.moving).toBe(true)
    const stop = busAt(t0 + BUS_RUN * 0.5, route)!
    expect(stop.x).toBeCloseTo(BUS_STOP.x)
    expect(stop.moving).toBe(false)
    const late = busAt(t0 + BUS_RUN * 0.9, route)!
    expect(late.x).toBeGreaterThan(BUS_STOP.x)
    expect(late.moving).toBe(true)
    // 큰길 남쪽 차선 (인도가 아니다)
    expect(start.z).toBeGreaterThan(0)
    expect(start.z).toBeLessThan(3.4)
  })

  it('달리는 버스 앞을 지나가면 부딪힌다, 서 있는 버스나 인도는 괜찮다', () => {
    const run = busAt(t0 + BUS_RUN * 0.2, route)!
    expect(busHits(run, { x: run.x + 1, z: run.z })).toBe(true)
    expect(busHits(run, { x: run.x, z: run.z + 1.2 })).toBe(true)
    // 버스 옆 인도
    expect(busHits(run, { x: run.x, z: 5.5 })).toBe(false)
    expect(busHits(run, { x: run.x + 6, z: run.z })).toBe(false)
    const stop = busAt(t0 + BUS_RUN * 0.5, route)!
    expect(busHits(stop, { x: stop.x, z: stop.z })).toBe(false)
    expect(busHits(null, { x: 0, z: 1.7 })).toBe(false)
  })

  it('화면이 버벅여 버스가 한 번에 많이 움직여도 지나간 자리에 있던 사람은 치인다', () => {
    const run = busAt(t0 + BUS_RUN * 0.2, route)!
    // 지난 화면에선 12m 뒤에 있었고, 그 사이에 서 있던 사람
    expect(busHits(run, { x: run.x - 8, z: run.z }, 0.3, run.x - 12)).toBe(true)
    // 지나간 길 밖이면 안 치인다
    expect(busHits(run, { x: run.x - 20, z: run.z }, 0.3, run.x - 12)).toBe(false)
  })
})

describe('동네 고양이', () => {
  const map = buildTown(['host', 'a'])
  const route = catRoute(map)

  it('같은 시각이면 어느 화면에서나 같은 자리', () => {
    for (const seed of CAT_SEEDS) expect(catAt(route, 123456789, seed)).toEqual(catAt(catRoute(buildTown(['host', 'a'])), 123456789, seed))
    expect(catAt(route, 123456789, CAT_SEEDS[0]).pos).not.toEqual(catAt(route, 123456789, CAT_SEEDS[1]).pos)
  })

  it('늘 막히지 않은 곳에 있고, 순간 이동하지 않는다', () => {
    expect(route.length).toBeGreaterThan(10)
    for (const seed of CAT_SEEDS) {
      let prev = catAt(route, 0, seed).pos
      for (let s = 1; s <= 600; s++) {
        const c = catAt(route, s * 1000, seed)
        expect(map.blocked(c.pos), `${seed}@${s}`).toBe(false)
        expect(Math.hypot(c.pos.x - prev.x, c.pos.z - prev.z)).toBeLessThan(1.5)
        prev = c.pos
      }
    }
  })

  it('가끔 쉬면서 낮잠을 잔다', () => {
    let naps = 0
    for (let s = 0; s < 600; s++) if (catAt(route, s * 1000, CAT_SEEDS[0]).nap) naps++
    expect(naps).toBeGreaterThan(0)
    expect(naps).toBeLessThan(600)
  })
})
