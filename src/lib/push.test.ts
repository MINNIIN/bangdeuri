import { beforeEach, describe, expect, it } from 'vitest'
import { allOff, needsUpgrade, prefsFor, savedPrefs } from './push'

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

  it('알림은 스위치 하나: 켜면 모든 종류가, 끄면 전부 꺼진다', () => {
    expect(prefsFor(true)).toEqual({ enter: true, drop: true, event: true, alarm: true })
    expect(prefsFor(false)).toEqual({ enter: false, drop: false, event: false, alarm: false })
  })

  it('예전에 일부만 켜 둔 기기는 전부 켜짐으로 올린다 (다 꺼진 기기는 그대로)', () => {
    expect(needsUpgrade({ enter: true, drop: false, event: false, alarm: false })).toBe(true)
    expect(needsUpgrade(prefsFor(true))).toBe(false)
    expect(needsUpgrade(prefsFor(false))).toBe(false)
  })
})
