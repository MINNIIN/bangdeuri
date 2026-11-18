/** 동네 효과음: 파일 없이 Web Audio로 만든다 (버스에 부딪힌 "빵! 쿵 으악!") */

let ac: AudioContext | null = null
function audio() {
  if (!ac) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ac = new Ctor()
  }
  if (ac.state !== 'running') void ac.resume()
  return ac
}

function env(g: GainNode, at: number, peak: number, attack: number, hold: number, release: number) {
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + attack)
  g.gain.setValueAtTime(peak, at + attack + hold)
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release)
}

function noiseBuf(c: AudioContext, sec: number) {
  const n = Math.floor(c.sampleRate * sec)
  const b = c.createBuffer(1, n, c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  return b
}

/** 버스 경적 "빵!" · 부딪히는 "쿵" · 목소리 "으악!" */
export function busOuch() {
  const c = audio()
  if (!c) return
  const t = c.currentTime + 0.01
  // 빵! (두 음 경적)
  for (const hz of [370, 466]) {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'square'
    o.frequency.value = hz
    env(g, t, 0.07, 0.01, 0.16, 0.06)
    o.connect(g).connect(c.destination)
    o.start(t)
    o.stop(t + 0.3)
  }
  // 쿵
  {
    const s = c.createBufferSource()
    s.buffer = noiseBuf(c, 0.3)
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 380
    const g = c.createGain()
    env(g, t + 0.2, 0.9, 0.005, 0.03, 0.22)
    s.connect(f).connect(g).connect(c.destination)
    s.start(t + 0.2)
    const o = c.createOscillator()
    const og = c.createGain()
    o.frequency.setValueAtTime(120, t + 0.2)
    o.frequency.exponentialRampToValueAtTime(45, t + 0.45)
    env(og, t + 0.2, 0.35, 0.005, 0.02, 0.25)
    o.connect(og).connect(c.destination)
    o.start(t + 0.2)
    o.stop(t + 0.5)
  }
  // 으악! — 성대(톱니파)를 모음 공명(두 bandpass)에 통과시켜 "으" → "아"로 바꾸고, 끝에 "ㄱ"처럼 뚝 끊는다
  {
    const v0 = t + 0.26
    const dur = 0.5
    const src = c.createOscillator()
    src.type = 'sawtooth'
    src.frequency.setValueAtTime(380, v0)
    src.frequency.linearRampToValueAtTime(560, v0 + 0.16)
    src.frequency.exponentialRampToValueAtTime(300, v0 + dur)
    // 떨리는 목소리
    const vib = c.createOscillator()
    const vibG = c.createGain()
    vib.frequency.value = 9
    vibG.gain.value = 14
    vib.connect(vibG).connect(src.frequency)
    const out = c.createGain()
    env(out, v0, 0.5, 0.03, dur - 0.1, 0.04)
    const formant = (f1: number, f2: number, q: number, gain: number) => {
      const bp = c.createBiquadFilter()
      bp.type = 'bandpass'
      bp.Q.value = q
      bp.frequency.setValueAtTime(f1, v0)
      bp.frequency.linearRampToValueAtTime(f2, v0 + 0.18)
      const g = c.createGain()
      g.gain.value = gain
      src.connect(bp).connect(g).connect(out)
    }
    // 첫째 공명: 으(350) → 아(850) · 둘째 공명: 으(1500) → 아(1250)
    formant(350, 850, 6, 1.4)
    formant(1500, 1250, 8, 0.7)
    out.connect(c.destination)
    src.start(v0)
    vib.start(v0)
    src.stop(v0 + dur + 0.05)
    vib.stop(v0 + dur + 0.05)
    // ㄱ: 짧은 숨 끊김
    const k = c.createBufferSource()
    k.buffer = noiseBuf(c, 0.05)
    const kf = c.createBiquadFilter()
    kf.type = 'bandpass'
    kf.frequency.value = 2200
    const kg = c.createGain()
    env(kg, v0 + dur - 0.02, 0.25, 0.003, 0.01, 0.03)
    k.connect(kf).connect(kg).connect(c.destination)
    k.start(v0 + dur - 0.02)
  }
  navigator.vibrate?.([60, 40, 120])
}

/** 카페 커피 바 소리: 원두 갈기 · 추출 · 스팀 · 얼음 퐁당 · 붓기 · 완성 종 */
export function barSound(kind: 'grind' | 'brew' | 'steam' | 'plop' | 'pour' | 'pump' | 'ding') {
  const c = audio()
  if (!c) return
  const t = c.currentTime + 0.01
  const noise = (dur: number, type: BiquadFilterType, hz: number, vol: number, wobble = 0) => {
    const s = c.createBufferSource()
    s.buffer = noiseBuf(c, dur)
    const f = c.createBiquadFilter()
    f.type = type
    f.frequency.value = hz
    f.Q.value = 1.2
    if (wobble) {
      const lfo = c.createOscillator()
      const lg = c.createGain()
      lfo.frequency.value = wobble
      lg.gain.value = hz * 0.35
      lfo.connect(lg).connect(f.frequency)
      lfo.start(t)
      lfo.stop(t + dur)
    }
    const g = c.createGain()
    env(g, t, vol, 0.04, Math.max(0.01, dur - 0.2), 0.15)
    s.connect(f).connect(g).connect(c.destination)
    s.start(t)
  }
  const tone = (hz: number, to: number, dur: number, vol: number, wave: OscillatorType = 'sine', delay = 0) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = wave
    o.frequency.setValueAtTime(hz, t + delay)
    o.frequency.exponentialRampToValueAtTime(to, t + delay + dur)
    env(g, t + delay, vol, 0.005, 0.01, dur)
    o.connect(g).connect(c.destination)
    o.start(t + delay)
    o.stop(t + delay + dur + 0.05)
  }
  switch (kind) {
    case 'grind':
      noise(1.5, 'bandpass', 1400, 0.22, 23)
      break
    case 'brew':
      noise(2.2, 'lowpass', 500, 0.12, 3)
      break
    case 'steam':
      noise(1.8, 'highpass', 3500, 0.12, 6)
      break
    case 'plop':
      tone(900, 260, 0.12, 0.25)
      break
    case 'pour':
      noise(1.0, 'lowpass', 800, 0.14, 5)
      break
    case 'pump':
      tone(220, 120, 0.08, 0.2, 'triangle')
      break
    case 'ding':
      tone(1568, 1560, 0.6, 0.18)
      tone(2093, 2090, 0.8, 0.12, 'sine', 0.12)
      break
  }
}
