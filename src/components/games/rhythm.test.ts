import { describe, expect, it } from 'vitest'
import {
  SONG,
  LANES,
  applyJudgement,
  buildChart,
  expandSong,
  judgeOffset,
  newPlay,
  parseMelody,
  rankOf,
  resultLine,
  scoreOf,
  songLength,
  stepDur,
  WINDOWS,
} from './rhythm'

describe('곡 데이터', () => {
  it('멜로디 한 마디 문자열을 16분음표 칸으로 읽는다 (- 는 늘이기, . 은 쉼)', () => {
    const notes = parseMelody('c-e-....g---C---', 32)
    expect(notes.map((n) => n.step)).toEqual([32, 34, 40, 44])
    expect(notes.map((n) => n.len)).toEqual([2, 2, 4, 4])
    expect(notes[0].midi).toBe(72) // C5
    expect(notes[3].midi).toBe(84) // C6
  })

  it('한 마디는 반드시 16칸', () => {
    for (const bar of SONG.bars) expect(bar.mel.length).toBe(16)
  })

  it('곡 길이는 60~75초 · 120~128 BPM', () => {
    expect(SONG.bpm).toBeGreaterThanOrEqual(120)
    expect(SONG.bpm).toBeLessThanOrEqual(128)
    const len = songLength(SONG)
    expect(len).toBeGreaterThanOrEqual(60)
    expect(len).toBeLessThanOrEqual(75)
  })

  it('펼친 곡: 칸마다 하나, 4박마다 킥', () => {
    const steps = expandSong(SONG)
    expect(steps.length).toBe(SONG.bars.length * 16)
    const body = steps.slice(32, steps.length - 32)
    for (const s of body) if (s.step % 4 === 0) expect(s.kick).toBe(true)
  })
})

describe('채보 (곡에서 만든다)', () => {
  const easy = buildChart(SONG, 'easy')
  const hard = buildChart(SONG, 'hard')
  const sd = stepDur(SONG.bpm)

  it('노트는 박자 칸 위에 정확히 놓인다', () => {
    for (const n of [...easy, ...hard]) {
      expect(Number.isInteger(n.step)).toBe(true)
      expect(n.t).toBeCloseTo(n.step * sd, 9)
      expect(n.lane).toBeGreaterThanOrEqual(0)
      expect(n.lane).toBeLessThan(LANES)
    }
  })

  it('시간 순으로 정렬되어 있다', () => {
    for (const c of [easy, hard]) for (let i = 1; i < c.length; i++) expect(c[i].t).toBeGreaterThanOrEqual(c[i - 1].t)
  })

  it('쉬움은 4칸(한 박) 이상 띄우고, 신나게가 더 많다', () => {
    expect(hard.length).toBeGreaterThan(easy.length * 1.4)
    expect(easy.length).toBeGreaterThan(80)
    for (let i = 1; i < easy.length; i++) expect(easy[i].step - easy[i - 1].step).toBeGreaterThanOrEqual(4)
  })

  it('신나게: 같은 줄 노트는 2칸 이상 띄운다 · 동시치기는 두 줄까지', () => {
    const lastAt = new Map<number, number>()
    const perStep = new Map<number, number>()
    for (const n of hard) {
      const prev = lastAt.get(n.lane)
      if (prev !== undefined) expect(n.step - prev).toBeGreaterThanOrEqual(2)
      lastAt.set(n.lane, n.step)
      perStep.set(n.step, (perStep.get(n.step) ?? 0) + 1)
    }
    expect(Math.max(...perStep.values())).toBeLessThanOrEqual(2)
    expect([...perStep.values()].some((v) => v === 2)).toBe(true)
  })

  it('네 줄을 고루 쓴다', () => {
    for (const c of [easy, hard]) {
      const cnt = [0, 0, 0, 0]
      for (const n of c) cnt[n.lane]++
      for (const k of cnt) expect(k).toBeGreaterThan(c.length * 0.12)
    }
  })

  it('같은 곡이면 늘 같은 채보', () => {
    expect(buildChart(SONG, 'hard')).toEqual(hard)
  })
})

describe('판정', () => {
  it('어긋난 시간으로 판정한다', () => {
    expect(judgeOffset(0)).toBe('perfect')
    expect(judgeOffset(-WINDOWS.perfect + 0.001)).toBe('perfect')
    expect(judgeOffset(0.07)).toBe('great')
    expect(judgeOffset(-0.12)).toBe('good')
    expect(judgeOffset(0.25)).toBeNull()
  })

  it('콤보·최대 콤보·그루브 게이지', () => {
    let p = newPlay()
    p = applyJudgement(p, 'perfect')
    p = applyJudgement(p, 'great')
    p = applyJudgement(p, 'good')
    expect(p.combo).toBe(3)
    p = applyJudgement(p, 'miss')
    expect(p.combo).toBe(0)
    expect(p.maxCombo).toBe(3)
    expect(p.counts).toEqual({ perfect: 1, great: 1, good: 1, miss: 1 })
    for (let i = 0; i < 100; i++) p = applyJudgement(p, 'miss')
    expect(p.groove).toBe(0)
    for (let i = 0; i < 200; i++) p = applyJudgement(p, 'perfect')
    expect(p.groove).toBe(1)
  })
})

describe('점수 · 등급', () => {
  it('전부 PERFECT 풀콤보면 1,000,000점, 전부 MISS면 0점', () => {
    expect(scoreOf({ perfect: 100, great: 0, good: 0, miss: 0 }, 100)).toBe(1_000_000)
    expect(scoreOf({ perfect: 0, great: 0, good: 0, miss: 100 }, 0)).toBe(0)
  })

  it('정확도가 높을수록 점수가 높다', () => {
    const a = scoreOf({ perfect: 80, great: 20, good: 0, miss: 0 }, 100)
    const b = scoreOf({ perfect: 60, great: 30, good: 10, miss: 0 }, 100)
    expect(a).toBeGreaterThan(b)
    expect(a).toBeLessThan(1_000_000)
  })

  it('등급 S/A/B/C', () => {
    expect(rankOf(990_000)).toBe('S')
    expect(rankOf(900_000)).toBe('A')
    expect(rankOf(750_000)).toBe('B')
    expect(rankOf(300_000)).toBe('C')
  })

  it('한 줄 결과는 20자 미만, 풀콤보/망함 구분', () => {
    const fc = resultLine({ perfect: 90, great: 10, good: 0, miss: 0 }, 970_000)
    expect(fc).toBe('풀콤보 달성!!')
    const bad = resultLine({ perfect: 10, great: 10, good: 10, miss: 70 }, 200_000)
    expect(bad).toBe('발이 꼬였다…')
    for (const s of [1_000_000, 960_000, 880_000, 720_000, 100_000]) {
      const line = resultLine({ perfect: 1, great: 1, good: 1, miss: 1 }, s)
      expect(line.length).toBeLessThan(20)
    }
    expect(resultLine({ perfect: 100, great: 0, good: 0, miss: 0 }, 1_000_000).length).toBeLessThan(20)
  })
})
