import { afterEach, describe, expect, it, vi } from 'vitest'

/** 소리 없는 가짜 AudioContext: 몇 번 만들어졌는지, 깨웠는지만 센다 */
function fakeAudio() {
  const made: FakeCtx[] = []
  class FakeCtx {
    state = 'suspended'
    currentTime = 0
    destination = {}
    sampleRate = 44100
    resume = vi.fn(async () => {
      this.state = 'running'
    })
    constructor() {
      made.push(this)
    }
    createOscillator() {
      return { type: '', frequency: { value: 0 }, connect: (x: unknown) => x, start() {}, stop() {} }
    }
    createGain() {
      const g = { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 }, connect: (x: unknown) => x }
      return g
    }
    createBuffer() {
      return {}
    }
    createBufferSource() {
      return { buffer: null, connect: (x: unknown) => x, start() {} }
    }
  }
  vi.stubGlobal('AudioContext', FakeCtx)
  return made
}

describe('알람·타이머 소리', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('첫 터치 때 소리 장치를 깨워 두고, 나중에 울릴 때 같은 걸 쓴다 (아이폰은 터치 안에서만 깨울 수 있다)', async () => {
    const made = fakeAudio()
    const { armChime, ring } = await import('./chime')
    armChime()
    expect(made).toHaveLength(0)
    window.dispatchEvent(new Event('pointerdown'))
    expect(made).toHaveLength(1)
    expect(made[0].resume).toHaveBeenCalled()
    const stop = ring('timer')
    stop()
    expect(made).toHaveLength(1)
  })
})
