import { describe, expect, it } from 'vitest'
import { CHUTE_EDGE, gripChance, makePile, mulberry32, pickTarget, PLUSH_INFO, prizeScore, restY, resultLine, rollGrab } from './claw'

/** 정해진 수를 차례로 내놓는 가짜 난수 */
const seq = (...v: number[]) => {
  let i = 0
  return () => v[i++ % v.length]
}

describe('gripChance', () => {
  it('정가운데면 거의 확실하게 잡는다', () => {
    expect(gripChance(0, 0.1)).toBeGreaterThan(0.9)
  })
  it('가장자리로 갈수록 약해진다', () => {
    const a = gripChance(0.02, 0.1)
    const b = gripChance(0.05, 0.1)
    const c = gripChance(0.09, 0.1)
    expect(a).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(c)
    expect(c).toBeGreaterThan(0)
  })
  it('집게 폭을 벗어나면 0', () => {
    expect(gripChance(0.1, 0.1)).toBe(0)
    expect(gripChance(0.3, 0.1)).toBe(0)
  })
  it('왼쪽·오른쪽 대칭', () => {
    expect(gripChance(-0.04, 0.1)).toBeCloseTo(gripChance(0.04, 0.1))
  })
})

describe('rollGrab', () => {
  it('잡기 굴림이 확률보다 크면 못 잡는다', () => {
    expect(rollGrab(0, 0.1, 0, seq(0.99, 0))).toEqual({ grabbed: false, slipAt: null })
  })
  it('가운데를 잡고 운도 좋으면 끝까지 들고 간다', () => {
    expect(rollGrab(0, 0.1, 0, seq(0.1, 0.1, 0.5))).toEqual({ grabbed: true, slipAt: null })
  })
  it('잡았어도 버티기 굴림에 지면 도중에 놓친다 (0.15~0.85 사이)', () => {
    const r = rollGrab(0, 0.1, 0, seq(0.1, 0.99, 0.5))
    expect(r.grabbed).toBe(true)
    expect(r.slipAt).not.toBeNull()
    expect(r.slipAt!).toBeGreaterThanOrEqual(0.15)
    expect(r.slipAt!).toBeLessThanOrEqual(0.85)
  })
  it('무거운 인형은 더 잘 미끄러진다', () => {
    // 같은 굴림(0.7)인데 가벼우면 버티고 무거우면 놓친다
    expect(rollGrab(0.01, 0.1, 0, seq(0.1, 0.7, 0.5)).slipAt).toBeNull()
    expect(rollGrab(0.01, 0.1, 0.3, seq(0.1, 0.7, 0.5)).slipAt).not.toBeNull()
  })
  it('가운데에서 대략 60~85% 확률로 상품이 된다', () => {
    const rand = mulberry32(7)
    let ok = 0
    for (let i = 0; i < 4000; i++) {
      const r = rollGrab(0, 0.1, 0.05, rand)
      if (r.grabbed && r.slipAt === null) ok++
    }
    expect(ok / 4000).toBeGreaterThan(0.6)
    expect(ok / 4000).toBeLessThan(0.85)
  })
})

describe('makePile', () => {
  it('같은 씨앗이면 같은 더미', () => {
    expect(makePile(mulberry32(3))).toEqual(makePile(mulberry32(3)))
  })
  it('인형은 상품 구멍 너머 칸에만 있다', () => {
    for (let s = 1; s < 30; s++) {
      const pile = makePile(mulberry32(s))
      expect(pile.length).toBeGreaterThanOrEqual(9)
      for (const p of pile) {
        expect(p.x - p.r).toBeGreaterThan(CHUTE_EDGE)
        expect(p.x + p.r).toBeLessThanOrEqual(1)
      }
    }
  })
  it('황금곰은 많아야 하나', () => {
    for (let s = 1; s < 60; s++) {
      expect(makePile(mulberry32(s)).filter((p) => p.kind === 'gold').length).toBeLessThanOrEqual(1)
    }
  })
  it('id는 서로 다르다', () => {
    const pile = makePile(mulberry32(9))
    expect(new Set(pile.map((p) => p.id)).size).toBe(pile.length)
  })
})

describe('pickTarget', () => {
  const pile = [
    { id: 1, x: 0.5, y: 1.1, r: 0.08 },
    { id: 2, x: 0.56, y: 0.98, r: 0.07 },
    { id: 3, x: 0.8, y: 1.1, r: 0.08 },
  ]
  it('집게 아래 닿는 인형 중 가장 위에 있는 걸 고른다', () => {
    expect(pickTarget(pile, 0.53, 0.1)?.id).toBe(2)
  })
  it('닿는 게 없으면 null', () => {
    expect(pickTarget(pile, 0.3, 0.05)).toBeNull()
  })
})

describe('restY', () => {
  it('바닥에 떨어지면 바닥 위에 선다', () => {
    expect(restY(0.5, 0.05, [], 1.25)).toBeCloseTo(1.2)
  })
  it('다른 인형 위에 떨어지면 그 위에 얹힌다', () => {
    const y = restY(0.5, 0.05, [{ x: 0.5, y: 1.15, r: 0.1 }], 1.25)
    expect(y).toBeCloseTo(1.0)
  })
})

describe('점수와 한마디', () => {
  it('황금곰이 가장 비싸다', () => {
    const max = Math.max(...Object.values(PLUSH_INFO).map((i) => i.points))
    expect(PLUSH_INFO.gold.points).toBe(max)
  })
  it('점수는 상품 점수의 합', () => {
    expect(prizeScore(['bear', 'gold'])).toBe(PLUSH_INFO.bear.points + PLUSH_INFO.gold.points)
    expect(prizeScore([])).toBe(0)
  })
  it('한마디는 20자 미만', () => {
    const cases: Parameters<typeof resultLine>[0][] = [[], ['bear'], ['gold'], ['star', 'cat'], ['penguin', 'chick', 'bunny']]
    for (const c of cases) expect(resultLine(c).length).toBeLessThan(20)
  })
  it('못 뽑으면 아쉬운 말, 뽑으면 이름이 들어간다', () => {
    expect(resultLine([])).toBe('오늘은 집게가 약하네…')
    expect(resultLine(['bear'])).toContain('곰돌이')
    expect(resultLine(['bear', 'gold'])).toContain('황금곰')
  })
})
