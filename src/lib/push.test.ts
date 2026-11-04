import { beforeEach, describe, expect, it } from 'vitest'
import { allOff, savedPrefs } from './push'

describe('알림 설정', () => {
  beforeEach(() => localStorage.clear())

  it('예전에 저장한 설정(들어옴·물건만)도 읽고, 새 항목은 꺼진 채로', () => {
    localStorage.setItem('bangdeuri:push', JSON.stringify({ enter: true, drop: false }))
    expect(savedPrefs()).toEqual({ enter: true, drop: false, event: false, alarm: false })
  })

  it('하나라도 켜져 있으면 구독을 지우지 않는다', () => {
    expect(allOff({ enter: false, drop: false, event: false, alarm: true })).toBe(false)
    expect(allOff({ enter: false, drop: false, event: false, alarm: false })).toBe(true)
  })
})
