import { afterEach, describe, expect, it, vi } from 'vitest'
import { bgm } from './music'
import type { Song } from './songs'
import { turntable } from './turntable'

const song: Song = { id: 1, title: 'Ditto', artist: 'NewJeans', art: '', preview: 'https://audio.example/p.m4a', link: '' }

describe('턴테이블', () => {
  afterEach(() => {
    turntable.stop()
    vi.restoreAllMocks()
  })

  it('이미 30초가 지난 곡은 틀지 않는다', async () => {
    expect(await turntable.play({ by: '지윤', song, at: Date.now() - 31_000 })).toBe('ended')
    expect(turntable.current()).toBeNull()
  })

  it('브라우저가 자동 재생을 막으면 blocked, 곡은 기억해 두고 배경음악은 안 멈춘다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new DOMException('no', 'NotAllowedError'))
    expect(await turntable.play({ by: '지윤', song, at: Date.now() })).toBe('blocked')
    expect(turntable.current()?.by).toBe('지윤')
    expect(bgm.isHeld()).toBe(false)
  })

  it('틀면 배경음악을 멈추고, 끄면 다시', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    expect(await turntable.play({ by: '나', song, at: Date.now() })).toBe('playing')
    expect(bgm.isHeld()).toBe(true)
    turntable.stop()
    expect(bgm.isHeld()).toBe(false)
    expect(turntable.current()).toBeNull()
  })
})
