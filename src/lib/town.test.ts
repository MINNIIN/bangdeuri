import { describe, expect, it } from 'vitest'
import { interactionFor } from './interactions'
import { itemDepth } from '../three/furniture3d'
import { SHOPS, shopMap, shopOfArea, shopOfKey } from './shops'
import {
  buildTown,
  groundY,
  HILL_H,
  PIER_Y,
  SEA_Y,
  colX,
  doorStep,
  emptySlots,
  houseSlots,
  rowOff,
  SHOP_IDS,
  SHOP_SLOTS,
  shopDoor,
  shopRect,
  findHouseWorldPath,
  findTownPath,
  guestSpot,
  houseToUv,
  isArea,
  isPlace,
  layoutLots,
  nearestOpen,
  lotAtYard,
  MAX_HOUSES,
  obstacleBlocker,
  parkSeats,
  roomOfArea,
  townVendors,
  safeVec,
  uvToHouse,
  yardToTown,
} from './town'

describe('동네 배치', () => {
  it('칸 표: 내 집 칸(줄0 가운데)부터 가까운 순, 가게 칸은 빠진다', () => {
    const slots = houseSlots()
    expect(slots).toHaveLength(21)
    expect(slots[0]).toEqual({ row: 0, col: 0, x: 0, zOff: 0 })
    expect(slots.slice(1, 3).map((s) => [s.row, s.col])).toEqual([[0, -1], [0, 1]])
    expect([slots[3].row, slots[3].col]).toEqual([1, 0])
    for (const id of SHOP_IDS) expect(slots.some((s) => s.row === SHOP_SLOTS[id].row && s.col === SHOP_SLOTS[id].col)).toBe(false)
    expect([-4, -2, -1, 0, 1, 2, 4].map(colX)).toEqual([-56, -30, -13, 0, 13, 30, 56])
    expect([0, 1, 2].map(rowOff)).toEqual([0, -16, -32])
  })

  it('같은 방은 한 번만, 내 집은 가운데', () => {
    const lots = layoutLots(['host', 'a', 'b', 'a', 'c'])
    expect(lots.map((l) => l.roomId)).toEqual(['host', 'a', 'b', 'c'])
    expect(lots[0].x).toBe(0)
    expect(lots[0].zOff).toBe(0)
  })

  it('친구가 늘어도 원래 집은 제자리', () => {
    const ids = Array.from({ length: 17 }, (_, i) => `r${i}`)
    const all = layoutLots(ids)
    layoutLots(ids.slice(0, 5)).forEach((l, i) => {
      expect(all[i].x).toBe(l.x)
      expect(all[i].zOff).toBe(l.zOff)
    })
  })

  it('집은 최대 17채 (친구 집 16 + 내 집), 서로 다른 칸', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `r${i}`)
    const lots = layoutLots(ids)
    expect(lots).toHaveLength(MAX_HOUSES)
    expect(MAX_HOUSES).toBe(17)
    expect(new Set(lots.map((l) => `${l.x},${l.zOff}`)).size).toBe(17)
    // 남은 칸은 빈 집터
    expect(emptySlots(lots)).toHaveLength(21 - 17)
    expect(emptySlots(layoutLots(['host']))).toHaveLength(20)
    const map = buildTown(ids)
    expect(map.blocked({ x: 0, z: 0 })).toBe(false)
  })

  it('뒷골목·샛길은 열려 있고, 뒷줄 집 안은 막혀 있다', () => {
    const map = buildTown(Array.from({ length: 17 }, (_, i) => `r${i}`))
    for (const p of [{ x: 0, z: -19 }, { x: 5, z: -35 }, { x: 21.5, z: -30 }, { x: -21.5, z: -12 }, { x: -64.5, z: -25 }, { x: 64.5, z: -25 }])
      expect(map.blocked(p)).toBe(false)
    expect(map.blocked({ x: 0, z: -29 })).toBe(true)
    expect(map.blocked({ x: 0, z: -45 })).toBe(true)
    // 맨 뒷줄 뒤는 숲
    expect(map.blocked({ x: 0, z: -50 })).toBe(true)
  })

  it('이웃집 사이 샛길: 앞 인도에서 집 옆을 지나 뒷골목까지 곧장 간다 (큰 샛길로 돌지 않는다)', () => {
    const map = buildTown(Array.from({ length: 17 }, (_, i) => `r${i}`))
    // 줄0 가운데 집(칸0)과 동쪽 옆집(칸1) 사이
    const gap = colX(0) + 6.5
    for (const z of [-6, -10, -13, -16.5]) expect(map.blocked({ x: gap, z })).toBe(false)
    const from = { x: gap, z: -4.3 }
    const to = { x: gap, z: -19 }
    const path = findTownPath(map, from, to)
    let len = 0
    let cur = from
    for (const p of path) {
      len += Math.hypot(p.x - cur.x, p.z - cur.z)
      cur = p
    }
    expect(path.length).toBeGreaterThan(0)
    expect(len).toBeLessThan(17)
    // 집 건물 · 울타리 안 마당은 여전히 막혀 있다 (마당은 대문으로)
    expect(map.blocked({ x: colX(0), z: -13 })).toBe(true)
  })

  it('가게 건물은 문으로만 들어간다', () => {
    const map = buildTown(['host'])
    for (const id of SHOP_IDS) {
      const r = shopRect(id)
      expect(map.blocked({ x: r.x, z: r.z1 - 2 })).toBe(true)
      expect(map.blocked(shopDoor(id))).toBe(false)
    }
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

describe('동네 장소 (편의점 · 포장마차 · 뒷산 · 바닷가)', () => {
  const towns = { '집 한 채': ['host'], '집 열일곱 채': Array.from({ length: MAX_HOUSES }, (_, i) => `r${i}`) }

  for (const [name, ids] of Object.entries(towns)) {
    describe(name, () => {
      const map = buildTown(ids)
      const z = map.zones!
      const seats = parkSeats(map.props).filter((s) => !s.item.startsWith('p_'))

      it('집 수와 상관없이 다 있고, 집과 겹치지 않는다', () => {
        for (const item of ['o_table', 'o_vending', 'o_pocha', 'm_pavilion', 'm_scope', 'm_summit', 'm_twister', 'm_spring', 'b_sunbed', 'b_ball', 'b_castle', 'b_shell', 'b_wade', 'b_firework', 'b_tower', 'b_fish'])
          expect(seats.some((s) => s.item === item)).toBe(true)
        // 뒷산은 격자 서쪽, 모래사장은 동쪽 (집 수와 상관없이 같은 자리)
        expect(z.hill.x + z.hill.rx).toBeLessThan(z.hw)
        expect(z.sand).toBeGreaterThan(z.he)
        expect(z.hw).toBe(-66.5)
        expect(z.he).toBe(66.5)
      })

      it('손님 자리에서 모든 문 · 가게 · 장소까지 걸어갈 수 있다', () => {
        const start = guestSpot('promo')
        const goals = [
          ...map.lots.map(doorStep),
          ...SHOP_IDS.map(shopDoor),
          { x: z.hill.x + 1.2, z: z.hill.z + 1.6 },
          { x: z.pocha.x, z: z.pocha.z - 2.4 },
          { x: z.he + 14.5, z: 4.2 },
          { x: z.pier.x1 - 3, z: z.pier.z },
        ]
        for (const g of goals) {
          expect(map.blocked(g)).toBe(false)
          const path = findTownPath(map, start, g)
          expect(path.length).toBeGreaterThan(0)
          const end = path[path.length - 1]
          expect(Math.hypot(end.x - g.x, end.z - g.z)).toBeLessThan(0.3)
        }
      })
    })
  }

  it('땅 높이: 길은 평평, 뒷산 꼭대기는 높고, 물가는 물속으로, 방파제는 물 위', () => {
    const map = buildTown(['host'])
    const z = map.zones!
    expect(groundY(z, 0, 0)).toBe(0)
    expect(groundY(z, z.hill.x, z.hill.z)).toBeCloseTo(HILL_H)
    // 산기슭(인도 앞)은 0에 가깝고 올라갈수록 높다
    expect(groundY(z, z.hill.x, -5.5)).toBeLessThan(0.05)
    expect(groundY(z, z.hill.x, -10)).toBeGreaterThan(groundY(z, z.hill.x, -7))
    expect(groundY(z, z.wet - 0.2, 0)).toBeLessThan(SEA_Y)
    expect(groundY(z, z.pier.x1 - 2, z.pier.z)).toBeCloseTo(PIER_Y)
    // 바다 깊은 데는 못 들어가고, 방파제 위는 끝까지 간다
    expect(map.blocked({ x: z.wet + 2, z: 0 })).toBe(true)
    expect(map.blocked({ x: z.wet + 2, z: z.pier.z })).toBe(false)
  })

  it('편의점은 실시간으로 주고받는 곳 이름으로 받는다', () => {
    expect(isArea('cvs')).toBe(true)
    expect(roomOfArea('cvs')).toBeNull()
  })
})

describe('가게 안 (가게 목록 전체)', () => {
  it('모든 가게: 들어온 자리에서 모든 물건 앞까지 걸어가고, 나가는 매트까지도 간다', () => {
    for (const id of SHOP_IDS) {
      const def = SHOPS[id]
      expect(def.id).toBe(id)
      const map = shopMap(def)
      expect(map.blocked(def.entrance)).toBe(false)
      expect(map.blocked(def.exit)).toBe(false)
      expect(def.spots.length).toBeGreaterThan(0)
      for (const s of def.spots) {
        expect(s.key.startsWith(id + '/')).toBe(true)
        const goal = { x: s.x + Math.sin(s.yaw) * 0.75, z: s.z + Math.cos(s.yaw) * 0.75 }
        const path = findTownPath(map, def.entrance, goal)
        expect(path.length, `${s.key}`).toBeGreaterThan(0)
      }
      expect(new Set(def.spots.map((s) => s.key)).size).toBe(def.spots.length)
      // 누름 자리 item은 동작이 있다
      for (const s of def.spots) expect(interactionFor(s.item), s.item).toBeDefined()
      if (def.npc) expect(map.blocked(def.npc.spot)).toBe(true)
    }
  })

  it('앉는 자리는 의자 가까이에서 앉는다 (책상 건너편으로 돌아가지 않는다)', () => {
    for (const id of SHOP_IDS) {
      const def = SHOPS[id]
      const map = shopMap(def)
      for (const s of def.spots) {
        const inter = interactionFor(s.item)!
        if (inter.pose !== 'sit') continue
        // World.standSpot와 같은 계산
        const d = itemDepth(s.item) * 0.7 + 0.35
        const want = inter.exact ? { x: s.x, z: s.z } : { x: s.x + Math.sin(s.yaw) * d, z: s.z + Math.cos(s.yaw) * d }
        const at = nearestOpen(map, want)
        expect(Math.hypot(at.x - s.x, at.z - s.z), s.key).toBeLessThan(1.2)
      }
    }
  })

  it('가게 이름으로 받고, 이상한 값은 버린다', () => {
    for (const id of SHOP_IDS) {
      expect(isArea(id)).toBe(true)
      expect(shopOfArea(id)?.id).toBe(id)
      expect(shopOfKey(SHOPS[id].spots[0].key)?.id).toBe(id)
    }
    expect(isArea('shop:x')).toBe(false)
    expect(isArea('pcbang')).toBe(false)
    expect(shopOfArea('town')).toBeNull()
    expect(shopOfKey('park/swing0:1')).toBeNull()
  })
})

describe('노점 사장님', () => {
  const props = buildTown([]).props
  const vendors = townVendors(props)
  it('붕어빵 사장님은 천막에 가리지 않게 수레 옆에 서서 손님 자리(북)를 본다', () => {
    const v = vendors.find((x) => x.kind === 'bungeo')!
    const cart = props.find((p) => p.kind === 'bungeo')!
    const guest = parkSeats(props).find((s) => s.item === 'o_bungeo')!
    expect(Math.abs(v.x - cart.x)).toBeGreaterThan(0.9)
    expect(guest.z).toBeLessThanOrEqual(cart.z)
    const toGuest = Math.atan2(guest.x - v.x, guest.z - 0.9 - v.z)
    expect(Math.cos(v.yaw - toGuest)).toBeGreaterThan(0.9)
  })
  it('포차 이모는 의자 반대편 조리대 안쪽(천막 안)에 서서 의자 쪽을 본다', () => {
    const v = vendors.find((x) => x.kind === 'pocha')!
    const tent = props.find((p) => p.kind === 'pocha')!
    const seats = parkSeats(props).filter((s) => s.item === 'o_pocha')
    expect(Math.hypot(v.x - tent.x, v.z - tent.z)).toBeLessThan(1.2)
    for (const s of seats) expect(Math.sign(s.z - tent.z)).toBe(-Math.sign(v.z - tent.z))
    const toSeat = Math.atan2(seats[1].x - v.x, seats[1].z - v.z)
    expect(Math.cos(v.yaw - toSeat)).toBeGreaterThan(0.9)
  })
})
