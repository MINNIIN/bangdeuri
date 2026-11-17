import { describe, expect, it } from 'vitest'
import {
  PUNCHES,
  accuracyFromRing,
  accuracyGrade,
  gaugePower,
  gaugeSpeed,
  punchScore,
  rankLabel,
  resultLine,
  ringScale,
  RING_TARGET,
  rollValue,
  roundBest,
} from './punch'

describe('꽝꽝펀치 — 힘 게이지', () => {
  it('한 판은 3번 친다', () => {
    expect(PUNCHES).toBe(3)
  })
  it('게이지는 0에서 시작해 반 주기에 꽉 차고 다시 내려온다', () => {
    const sp = 1 // 1초에 한 번 왕복
    expect(gaugePower(0, sp)).toBeCloseTo(0)
    expect(gaugePower(0.25, sp)).toBeCloseTo(0.5)
    expect(gaugePower(0.5, sp)).toBeCloseTo(1)
    expect(gaugePower(0.75, sp)).toBeCloseTo(0.5)
    expect(gaugePower(1, sp)).toBeCloseTo(0)
    expect(gaugePower(1.5, sp)).toBeCloseTo(1)
  })
  it('펀치를 거듭할수록 게이지가 빨라진다', () => {
    expect(gaugeSpeed(1)).toBeGreaterThan(gaugeSpeed(0))
    expect(gaugeSpeed(2)).toBeGreaterThan(gaugeSpeed(1))
  })
})

describe('꽝꽝펀치 — 정확도 링', () => {
  it('링은 1에서 시작해 작아지고 0 아래로 가지 않는다', () => {
    expect(ringScale(0, 1)).toBeCloseTo(1)
    expect(ringScale(0.5, 1)).toBeLessThan(1)
    expect(ringScale(100, 1)).toBeGreaterThanOrEqual(0)
  })
  it('링이 과녁 크기와 딱 맞으면 정확도 1, 멀수록 0으로', () => {
    expect(accuracyFromRing(RING_TARGET)).toBeCloseTo(1)
    expect(accuracyFromRing(RING_TARGET + 0.05)).toBeGreaterThan(accuracyFromRing(RING_TARGET + 0.15))
    expect(accuracyFromRing(1)).toBe(0)
    expect(accuracyFromRing(0)).toBe(0)
  })
  it('정확도 등급', () => {
    expect(accuracyGrade(0.97)).toBe('완벽!')
    expect(accuracyGrade(0.8)).toBe('좋아!')
    expect(accuracyGrade(0.5)).toBe('괜찮아')
    expect(accuracyGrade(0.1)).toBe('빗맞음')
  })
})

describe('꽝꽝펀치 — 점수', () => {
  it('힘 1 + 정확도 1 = 999 (만점)', () => {
    expect(punchScore(1, 1)).toBe(999)
  })
  it('힘 0이면 0점', () => {
    expect(punchScore(0, 1)).toBe(0)
  })
  it('점수는 0~999 정수, 힘·정확도가 오르면 점수도 오른다', () => {
    const a = punchScore(0.6, 0.5)
    expect(Number.isInteger(a)).toBe(true)
    expect(punchScore(0.8, 0.5)).toBeGreaterThan(a)
    expect(punchScore(0.6, 0.9)).toBeGreaterThan(a)
    expect(punchScore(2, 2)).toBe(999)
    expect(punchScore(-1, -1)).toBe(0)
  })
  it('빗맞아도 힘이 세면 어느 정도는 나온다', () => {
    expect(punchScore(1, 0)).toBeGreaterThan(200)
    expect(punchScore(1, 0)).toBeLessThan(500)
  })
  it('한 판 기록 = 세 번 중 최고', () => {
    expect(roundBest([120, 870, 640])).toBe(870)
    expect(roundBest([])).toBe(0)
  })
})

describe('꽝꽝펀치 — 등급·한 줄', () => {
  it('점수별 등급', () => {
    expect(rankLabel(999)).toBe('전설의 주먹')
    expect(rankLabel(950)).toBe('펀치왕')
    expect(rankLabel(900)).toBe('펀치왕')
    expect(rankLabel(899)).toBe('헬스장 단골')
    expect(rankLabel(700)).toBe('헬스장 단골')
    expect(rankLabel(400)).toBe('보통 주먹')
    expect(rankLabel(399)).toBe('솜주먹')
    expect(rankLabel(0)).toBe('솜주먹')
  })
  it('결과 한 줄은 20자 미만', () => {
    for (const s of [0, 50, 199, 200, 512, 912, 999]) {
      expect(resultLine(s).length).toBeLessThan(20)
    }
    expect(resultLine(912)).toBe('펀치 912점!')
    expect(resultLine(999)).toContain('999')
    expect(resultLine(80)).toBe('손목 나갈 뻔…')
  })
})

describe('꽝꽝펀치 — 숫자 굴리기', () => {
  it('0에서 시작해 끝에서 정확히 목표값', () => {
    expect(rollValue(912, 0)).toBe(0)
    expect(rollValue(912, 1)).toBe(912)
    expect(rollValue(912, 2)).toBe(912)
  })
  it('중간엔 커지기만 한다 (감속)', () => {
    let prev = -1
    for (let k = 0; k <= 1; k += 0.05) {
      const v = rollValue(700, k)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
    expect(rollValue(700, 0.5)).toBeGreaterThan(350) // 빠르게 올라가다 천천히 멈춘다
  })
})
