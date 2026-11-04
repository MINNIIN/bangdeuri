import { describe, expect, it } from 'vitest'
import { addMonths, kstToday, monthGrid, monthRange } from './calendar'

describe('달력 날짜', () => {
  it('윤년 2월: 42칸, 그달 29일, 일요일부터', () => {
    const g = monthGrid('2028-02')
    expect(g).toHaveLength(42)
    expect(g.filter((d) => d.inMonth)).toHaveLength(29)
    expect(g[0]).toEqual({ date: '2028-01-30', inMonth: false })
  })

  it('1일이 일요일이면 첫 칸이 1일', () => {
    expect(monthGrid('2026-11')[0]).toEqual({ date: '2026-11-01', inMonth: true })
  })

  it('1일이 토요일이면 앞에 6칸', () => {
    const g = monthGrid('2026-08')
    expect(g[0].date).toBe('2026-07-26')
    expect(g[6]).toEqual({ date: '2026-08-01', inMonth: true })
  })

  it('달 넘기기', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  it('오늘은 한국 날짜', () => {
    expect(kstToday(Date.UTC(2026, 10, 3, 15, 30))).toBe('2026-11-04')
  })

  it('불러올 범위는 격자 처음~끝', () => {
    expect(monthRange('2026-08')).toEqual({ from: '2026-07-26', to: '2026-09-05' })
  })
})
