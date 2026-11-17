import { describe, expect, it } from 'vitest'
import { SHOPS } from './shops'
import { gameFor, toolFor } from './tools'

describe('가게 기계 → 미니게임 · 주문대 → 메뉴', () => {
  it('오락실 인형뽑기·펀치·레이싱·리듬, PC방 자리는 게임이 열린다', () => {
    expect(gameFor('ar_claw')).toBe('claw')
    expect(gameFor('ar_punch')).toBe('punch')
    expect(gameFor('ar_race')).toBe('race')
    expect(gameFor('ar_rhythm')).toBe('rhythm')
    expect(gameFor('pc_seat')).toBe('space')
    expect(gameFor('cf_seat')).toBeUndefined()
  })
  it('게임이 열리는 기계는 정말 그 가게에 있다', () => {
    const items = new Set(Object.values(SHOPS).flatMap((s) => s.spots.map((p) => p.item)))
    for (const it of ['ar_claw', 'ar_punch', 'ar_race', 'ar_rhythm', 'pc_seat']) expect(items.has(it)).toBe(true)
  })
  it('카페 주문대에 가면 메뉴판이 열린다', () => {
    expect(toolFor('cf_order')).toBe('cafe')
  })
})
