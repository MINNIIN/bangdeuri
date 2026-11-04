/** 타이머·알람 소리: 파일 없이 Web Audio로. 울리는 동안 배경음악은 잠깐 멈춘다 */
import { bgm } from './music'

let ac: AudioContext | null = null

function audio() {
  if (ac) return ac
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ac = new Ctor()
  return ac
}

function beep(c: AudioContext, hz: number, at: number, dur: number, vol = 0.18, wave: OscillatorType = 'square') {
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = wave
  osc.frequency.value = hz
  g.gain.setValueAtTime(vol, at)
  g.gain.exponentialRampToValueAtTime(0.001, at + dur)
  osc.connect(g).connect(c.destination)
  osc.start(at)
  osc.stop(at + dur + 0.02)
}

/** 타이머: 삑삑삑 세 번 */
function timerSound(c: AudioContext) {
  const t = c.currentTime + 0.02
  for (let i = 0; i < 3; i++) beep(c, 1320, t + i * 0.22, 0.14)
}

/** 알람: 따르르릉 (빠르게 번갈아 치는 종) */
function alarmSound(c: AudioContext) {
  const t = c.currentTime + 0.02
  for (let i = 0; i < 12; i++) beep(c, i % 2 ? 1568 : 1319, t + i * 0.07, 0.06, 0.2)
}

/**
 * 울린다. timer는 한 번, alarm은 멈출 때까지 2초마다 다시.
 * 돌려준 함수를 부르면 멈춘다.
 */
export function ring(kind: 'timer' | 'alarm'): () => void {
  const c = audio()
  const reason = `chime:${kind}:${Math.random()}`
  bgm.hold(reason, true)
  if (!c) {
    bgm.hold(reason, false)
    return () => {}
  }
  void c.resume()
  let stopped = false
  let loop = 0
  if (kind === 'timer') {
    timerSound(c)
    loop = window.setTimeout(() => bgm.hold(reason, false), 900)
  } else {
    alarmSound(c)
    loop = window.setInterval(() => alarmSound(c), 2000)
  }
  // 진동도 (되는 기기만)
  navigator.vibrate?.(kind === 'alarm' ? [400, 200, 400, 200, 400] : [200, 100, 200])
  return () => {
    if (stopped) return
    stopped = true
    window.clearTimeout(loop)
    window.clearInterval(loop)
    navigator.vibrate?.(0)
    bgm.hold(reason, false)
  }
}

export const chime = { ring }
