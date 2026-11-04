import { describe, expect, it } from 'vitest'
import { CHARACTERS } from '../art/characters'
import { artById, FIXTURE_SPRITES } from '../art/fixtures'
import { ITEMS } from '../art/items'
import { backSprite, headSprite, OUTFITS, sitSprite, withOutfit } from '../art/poses'
import { BASE_PALETTE } from '../art/sprite'
import { clearLine, FIXTURES, findPath, isBlocked, nearestFree, ZONES, zoneAt } from './home'
import { INTERACTIONS } from './interactions'

describe('설비 그림', () => {
  it.each(Object.entries(FIXTURE_SPRITES))('%s: 줄 길이가 같고 팔레트에 있는 색만 쓴다', (_id, { sprite }) => {
    expect(new Set(sprite.rows.map((r) => r.length)).size).toBe(1)
    const used = new Set(sprite.rows.join('').replace(/\./g, ''))
    for (const ch of used) expect(sprite.palette[ch] ?? BASE_PALETTE[ch], `'${ch}'`).toBeTruthy()
  })

  it('집 가구는 모두 그림과 상호작용이 있다', () => {
    for (const f of FIXTURES) {
      expect(artById(f.item), f.item).toBeTruthy()
      expect(INTERACTIONS[f.item], f.item).toBeTruthy()
    }
  })

  it('친구가 놓는 아이템도 전부 상호작용이 있다', () => {
    for (const it of ITEMS) expect(INTERACTIONS[it.id], it.id).toBeTruthy()
  })

  it('거실에 턴테이블·달력이 있고 미니미가 그 앞까지 갈 수 있다', () => {
    for (const id of ['fx-turntable', 'fx-calendar']) {
      const f = FIXTURES.find((x) => x.id === id)
      expect(f, id).toBeTruthy()
      expect(zoneAt(f!)).toBe('living')
      const front = nearestFree({ u: f!.u + 0.06, v: f!.v + 0.06 })
      expect(findPath(ZONES[0].spot, front).length, id).toBeGreaterThan(0)
    }
  })

  it('가구끼리 겹치지 않는다', () => {
    for (const a of FIXTURES)
      for (const b of FIXTURES) if (a !== b) expect(Math.hypot(a.u - b.u, a.v - b.v), `${a.id}·${b.id}`).toBeGreaterThan(0.07)
  })

  it('가구는 벽에 박혀 있지 않다', () => {
    for (const f of FIXTURES) expect(isBlocked(f), f.id).toBe(false)
  })
})

describe('미니미 자세', () => {
  it.each(CHARACTERS)('$id: 뒷모습은 얼굴이 없고 크기는 그대로', (c) => {
    const back = backSprite(c.sprite)
    expect(back.rows).toHaveLength(c.sprite.rows.length)
    expect(back.rows.slice(7, 15).join('')).not.toMatch(/[sbm]/)
  })

  it.each(CHARACTERS)('$id: 앉으면 다리만 잘린다', (c) => {
    const sit = sitSprite(c.sprite)
    expect(sit.rows.length).toBeLessThan(c.sprite.rows.length)
    expect(sit.rows.length).toBeGreaterThanOrEqual(23)
    expect(headSprite(c.sprite).rows).toHaveLength(16)
  })

  it.each(CHARACTERS)('$id: 옷을 갈아입으면 색만 바뀐다', (c) => {
    expect(OUTFITS.length).toBeGreaterThan(1)
    const dressed = withOutfit(c.sprite, 1)
    expect(dressed.rows).toBe(c.sprite.rows)
    expect(dressed.palette).not.toEqual(c.sprite.palette)
  })
})

describe('집 구조와 길찾기', () => {
  it('방 칩 자리는 그 방 안에 있다', () => {
    for (const z of ZONES) {
      expect(isBlocked(z.spot), z.id).toBe(false)
      expect(zoneAt(z.spot)).toBe(z.id)
    }
  })

  it('안방과 거실 사이 벽은 문으로만 지나간다', () => {
    expect(clearLine({ u: 0.4, v: 0.05 }, { u: 0.6, v: 0.05 })).toBe(false)
    expect(clearLine({ u: 0.4, v: 0.23 }, { u: 0.6, v: 0.23 })).toBe(true)
  })

  it('거실에서 화장실까지 벽을 뚫지 않고 간다', () => {
    const from = ZONES[0].spot
    const path = findPath(from, ZONES[4].spot)
    expect(path.length).toBeGreaterThan(1)
    let cur = from
    for (const p of path) {
      expect(clearLine(cur, p)).toBe(true)
      cur = p
    }
    expect(zoneAt(cur)).toBe('bath')
  })

  it('모든 방끼리 길이 있다', () => {
    for (const a of ZONES) for (const b of ZONES) expect(findPath(a.spot, b.spot).length, `${a.id}→${b.id}`).toBeGreaterThan(0)
  })

  it('벽 위나 집 밖을 누르면 가까운 빈 자리로', () => {
    const p = nearestFree({ u: 0.5, v: 0.05 })
    expect(isBlocked(p)).toBe(false)
    expect(isBlocked(nearestFree({ u: -1, v: 2 }))).toBe(false)
  })
})

describe('옷 갈아입은 자세', () => {
  it('뒷모습·앉은 모습에도 갈아입은 옷 색이 남는다', () => {
    const c = CHARACTERS[0]
    const dressed = withOutfit(c.sprite, 1)
    expect(backSprite(dressed).palette).toEqual(dressed.palette)
    expect(sitSprite(dressed).palette).toEqual(dressed.palette)
    expect(backSprite(c.sprite).palette).toEqual(c.sprite.palette)
  })
})
