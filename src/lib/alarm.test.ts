import { describe, expect, it } from 'vitest'
import { type Alarm, dueAlarms, nextAlarmAt } from './alarm'

/** 한국 시각 → epoch ms (월은 1부터) */
const kst = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h - 9, mi)

describe('다음 알람 시각 (한국 시간)', () => {
  it('한 번짜리: 오늘 그 시각이 아직이면 오늘', () => {
    expect(nextAlarmAt({ time: '07:30', days: [] }, kst(2026, 11, 4, 6))).toBe(kst(2026, 11, 4, 7, 30))
  })

  it('한 번짜리: 이미 지났으면 내일', () => {
    expect(nextAlarmAt({ time: '07:30', days: [] }, kst(2026, 11, 4, 8))).toBe(kst(2026, 11, 5, 7, 30))
  })

  it('정확히 그 시각이면 다음 날 (지금보다 뒤인 시각만)', () => {
    expect(nextAlarmAt({ time: '07:30', days: [] }, kst(2026, 11, 4, 7, 30))).toBe(kst(2026, 11, 5, 7, 30))
  })

  it('평일 알람: 토요일 아침이면 월요일', () => {
    // 2026-11-07은 토요일
    expect(nextAlarmAt({ time: '07:30', days: [1, 2, 3, 4, 5] }, kst(2026, 11, 7, 9))).toBe(kst(2026, 11, 9, 7, 30))
  })

  it('자정 넘는 경계: 한국 23:50에 00:10 알람 → 다음 날 00:10', () => {
    expect(nextAlarmAt({ time: '00:10', days: [] }, kst(2026, 11, 4, 23, 50))).toBe(kst(2026, 11, 5, 0, 10))
  })

  it('UTC로는 전날이어도 한국 요일 기준 (한국 월요일 08:00 = UTC 일요일 23:00)', () => {
    // 2026-11-09 월요일 08:00 KST, 월요일만 울리는 09:00 알람 → 같은 날 09:00
    expect(nextAlarmAt({ time: '09:00', days: [1] }, kst(2026, 11, 9, 8))).toBe(kst(2026, 11, 9, 9))
  })
})

describe('지금 울릴 알람', () => {
  const now = kst(2026, 11, 4, 7, 30, ) + 30_000
  const a = (over: Partial<Alarm>): Alarm => ({
    id: 'a',
    time: '07:30',
    days: [],
    label: '',
    enabled: true,
    nextAt: new Date(kst(2026, 11, 4, 7, 30)).toISOString(),
    ...over,
  })

  it('30초 전에 울렸어야 하면 울린다', () => {
    expect(dueAlarms([a({})], now)).toHaveLength(1)
  })

  it('2분 넘게 지난 건 (앱을 늦게 열었을 때) 안 울린다', () => {
    expect(dueAlarms([a({})], now + 2 * 60_000)).toHaveLength(0)
  })

  it('꺼진 알람·아직인 알람·시각 없는 알람은 안 울린다', () => {
    expect(dueAlarms([a({ enabled: false }), a({ nextAt: new Date(now + 60_000).toISOString() }), a({ nextAt: null })], now)).toHaveLength(0)
  })
})
