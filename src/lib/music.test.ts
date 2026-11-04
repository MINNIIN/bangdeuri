import { beforeEach, describe, expect, it } from 'vitest'
import { bgm, bgmEnabled, midiToHz, TRACKS } from './music'

describe('배경음악', () => {
  beforeEach(() => localStorage.clear())

  it('방 종류마다 곡이 있고, 마디가 맞게 짜여 있다', () => {
    for (const t of Object.values(TRACKS)) {
      expect(t.lead.length % 8).toBe(0)
      expect(t.lead.length % t.bass.length).toBe(0)
      expect(t.lead.length % t.hat.length).toBe(0)
      for (const n of [...t.lead, ...t.bass]) if (n != null) expect(n).toBeGreaterThan(30)
    }
  })

  it('라(69) = 440Hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440)
    expect(midiToHz(81)).toBeCloseTo(880)
  })

  it('처음엔 켜져 있고, 끄면 이 기기에 기억한다', () => {
    expect(bgmEnabled()).toBe(true)
    bgm.toggle('pink')
    expect(bgmEnabled()).toBe(false)
    bgm.toggle('pink')
    expect(bgmEnabled()).toBe(true)
    bgm.stop()
  })
})

describe('배경음악 잠깐 멈추기', () => {
  it('멈춘 이유가 여러 개면 다 풀려야 다시 나온다', () => {
    bgm.hold('song', true)
    bgm.hold('alarm', true)
    bgm.hold('song', false)
    expect(bgm.isHeld()).toBe(true)
    bgm.hold('alarm', false)
    expect(bgm.isHeld()).toBe(false)
  })
})
