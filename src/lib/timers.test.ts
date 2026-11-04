import { beforeEach, describe, expect, it } from 'vitest'
import { nextPomodoro, POMODORO, remaining, type Timer, timers } from './timers'

const base = (over: Partial<Timer> = {}): Timer => ({
  id: 't1',
  label: '집중',
  source: 'desk',
  endsAt: 1_000_000,
  total: 60,
  ...over,
})

describe('타이머', () => {
  beforeEach(() => localStorage.clear())

  it('남은 시간은 초 단위, 0 밑으로 안 간다', () => {
    expect(remaining(base(), 1_000_000 - 30_000)).toBe(30)
    expect(remaining(base(), 1_000_000 + 5_000)).toBe(0)
  })

  it('뽀모도로: 집중이 끝나면 같은 라운드 휴식', () => {
    const now = 2_000_000
    const n = nextPomodoro(base({ pomodoro: { phase: 'focus', round: 1 } }), now)
    expect(n.pomodoro).toEqual({ phase: 'break', round: 1 })
    expect(n.endsAt).toBe(now + POMODORO.break * 1000)
    expect(n.total).toBe(POMODORO.break)
  })

  it('뽀모도로: 휴식이 끝나면 다음 라운드 집중', () => {
    const now = 2_000_000
    const n = nextPomodoro(base({ pomodoro: { phase: 'break', round: 1 } }), now)
    expect(n.pomodoro).toEqual({ phase: 'focus', round: 2 })
    expect(n.endsAt).toBe(now + POMODORO.focus * 1000)
  })

  it('시작하면 목록에 있고 취소하면 사라진다, 이 기기에 남는다', () => {
    const t = timers.start({ label: '컵라면', source: 'microwave', endsAt: Date.now() + 180_000, total: 180 })
    expect(timers.list().map((x) => x.id)).toEqual([t.id])
    expect(JSON.parse(localStorage.getItem('bangdeuri:timers') ?? '[]')).toHaveLength(1)
    timers.cancel(t.id)
    expect(timers.list()).toEqual([])
  })

  it('바꾸기(뽀모도로 다음 단계)', () => {
    const t = timers.start({ label: '집중', source: 'desk', endsAt: 5, total: 1, pomodoro: { phase: 'focus', round: 1 } })
    timers.replace({ ...t, endsAt: 10 })
    expect(timers.list()[0].endsAt).toBe(10)
  })
})
