import { describe, expect, it } from 'vitest'
import { interactionFor } from './interactions'
import { buildTown, findTownPath, guestSpot, MAX_HOUSES, parkSeats } from './town'
import { BUS_PERIOD, busPhase, CAT_SEEDS, catAt, catRoute } from './townLife'

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
