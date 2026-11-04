/**
 * 턴테이블 플레이어: 같은 방 사람들이 같은 곡을 같은 위치부터 듣는다.
 * 곡을 튼 시각(at)만 주고받고, 받는 쪽이 지난 시간만큼 건너뛰어 튼다. 저장하지 않는다 (방에 있을 때만의 일).
 */
import { bgm } from './music'
import { PREVIEW_SEC, type Song, songOffset } from './songs'

export interface NowPlaying {
  /** 튼 사람 이름 */
  by: string
  song: Song
  /** 튼 시각 (epoch ms, 튼 사람 시계) */
  at: number
}

const HOLD = 'turntable'

let audio: HTMLAudioElement | null = null
let cur: NowPlaying | null = null
let muted = false
let endTimer = 0
const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}

function release() {
  window.clearTimeout(endTimer)
  if (audio) {
    audio.onended = null
    audio.pause()
    audio = null
  }
  bgm.hold(HOLD, false)
}

export const turntable = {
  current: () => cur,
  isPlaying: () => !!audio && !!cur,
  muted: () => muted,
  setMuted(on: boolean) {
    muted = on
    if (audio) audio.muted = on
    emit()
  },
  /** 'blocked': 브라우저가 자동 재생을 막았다 (사용자가 한 번 눌러야 한다). 다시 부르면 된다 */
  async play(np: NowPlaying): Promise<'playing' | 'blocked' | 'ended'> {
    release()
    const offset = songOffset(np.at, Date.now())
    if (offset === null) {
      cur = null
      emit()
      return 'ended'
    }
    cur = np
    const a = new Audio(np.song.preview)
    a.muted = muted
    a.currentTime = offset
    audio = a
    a.onended = () => turntable.stop()
    try {
      await a.play()
    } catch {
      if (audio === a) audio = null
      // 끝까지 아무도 안 눌러도 미리듣기 시간이 지나면 잊는다 (같이 듣기 버튼이 계속 남지 않게)
      window.clearTimeout(endTimer)
      endTimer = window.setTimeout(() => {
        if (cur === np && !audio) turntable.stop()
      }, (PREVIEW_SEC - offset) * 1000)
      emit()
      return 'blocked'
    }
    if (audio !== a) return 'playing' // 그새 다른 곡으로 바뀜
    bgm.hold(HOLD, true)
    endTimer = window.setTimeout(() => turntable.stop(), (PREVIEW_SEC - offset) * 1000 + 1000)
    emit()
    return 'playing'
  },
  stop() {
    release()
    cur = null
    emit()
  },
  subscribe(cb: () => void) {
    listeners.add(cb)
    return () => void listeners.delete(cb)
  },
}
