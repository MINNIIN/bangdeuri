import { describe, expect, it } from 'vitest'
import {
  BOSS_EVERY,
  bossHp,
  bossVolley,
  circleHit,
  comboMult,
  damagePlayer,
  applyPowerUp,
  killScore,
  makeRng,
  newPilot,
  nextGroup,
  patternPos,
  registerKill,
  resultLine,
  shotAngles,
  spawnInterval,
  splitRock,
  tickPilot,
  waveAt,
  isBossDue,
  playfield,
} from './space'

describe('충돌', () => {
  it('두 원이 겹치면 맞는다', () => {
    expect(circleHit(0, 0, 5, 8, 0, 4)).toBe(true)
    expect(circleHit(0, 0, 5, 10, 0, 4)).toBe(false)
    expect(circleHit(0, 0, 3, 3, 4, 2.1)).toBe(true)
  })
})

describe('웨이브 · 보스 일정', () => {
  it('시간이 갈수록 웨이브가 오른다', () => {
    expect(waveAt(0)).toBe(1)
    expect(waveAt(14.9)).toBe(1)
    expect(waveAt(15)).toBe(2)
    expect(waveAt(100)).toBeGreaterThan(waveAt(50))
  })
  it('보스는 약 45초마다 나온다', () => {
    expect(BOSS_EVERY).toBe(45)
    expect(isBossDue(44, 0)).toBe(false)
    expect(isBossDue(45, 0)).toBe(true)
    // 이미 1번 나왔으면 다음은 90초
    expect(isBossDue(60, 1)).toBe(false)
    expect(isBossDue(90, 1)).toBe(true)
  })
  it('보스 체력은 회차마다 커진다', () => {
    expect(bossHp(1)).toBeGreaterThan(150)
    expect(bossHp(2)).toBeGreaterThan(bossHp(1))
  })
  it('출현 간격은 웨이브가 오를수록 짧아지되 바닥이 있다', () => {
    expect(spawnInterval(1)).toBeGreaterThan(spawnInterval(4))
    expect(spawnInterval(99)).toBeGreaterThanOrEqual(0.9)
  })
  it('웨이브 1에는 쉬운 무리만, 높을수록 더 많이', () => {
    const rng = makeRng(7)
    for (let i = 0; i < 40; i++) {
      const g = nextGroup(1, rng)
      expect(g.length).toBeGreaterThan(0)
      for (const s of g) expect(['jelly', 'rock']).toContain(s.kind)
    }
    const count = (wave: number) => {
      const r = makeRng(3)
      let n = 0
      for (let i = 0; i < 60; i++) n += nextGroup(wave, r).length
      return n
    }
    expect(count(6)).toBeGreaterThan(count(1))
  })
  it('출현 위치는 화면 안(가로 0~360), 지연은 0 이상', () => {
    const rng = makeRng(11)
    for (let w = 1; w < 9; w++)
      for (let i = 0; i < 20; i++)
        for (const s of nextGroup(w, rng)) {
          expect(s.x).toBeGreaterThanOrEqual(-40)
          expect(s.x).toBeLessThanOrEqual(400)
          expect(s.delay).toBeGreaterThanOrEqual(0)
        }
  })
})

describe('움직임 패턴', () => {
  it('sine은 아래로 내려가며 좌우로 흔든다', () => {
    const a = patternPos('sine', 0, 180, -20, 1)
    const b = patternPos('sine', 1, 180, -20, 1)
    expect(a.y).toBe(-20)
    expect(b.y).toBeGreaterThan(a.y)
    expect(b.x).not.toBe(180)
  })
  it('swoop은 옆에서 들어와 반대쪽으로 휘어 지나간다', () => {
    const a = patternPos('swoop', 0, -20, 80, 1)
    const b = patternPos('swoop', 2, -20, 80, 1)
    expect(b.x).toBeGreaterThan(a.x + 100)
    const c = patternPos('swoop', 2, 380, 80, -1)
    expect(c.x).toBeLessThan(380 - 100)
  })
  it('dive는 머물다가 아래로 빠르게 내려간다', () => {
    const early = patternPos('dive', 0.5, 100, -20, 1)
    const late = patternPos('dive', 3, 100, -20, 1)
    expect(late.y - early.y).toBeGreaterThan(200)
  })
})

describe('점수 · 콤보', () => {
  it('콤보 배수는 1에서 시작해 오르고 상한이 있다', () => {
    expect(comboMult(0)).toBe(1)
    expect(comboMult(8)).toBeGreaterThan(1)
    expect(comboMult(1000)).toBe(5)
  })
  it('처치하면 콤보가 쌓이고 배수가 점수에 곱해진다', () => {
    const p = newPilot()
    const first = registerKill(p, 'jelly')
    expect(first).toBe(killScore('jelly'))
    expect(p.combo).toBe(1)
    for (let i = 0; i < 20; i++) registerKill(p, 'jelly')
    expect(registerKill(p, 'jelly')).toBeGreaterThan(killScore('jelly'))
    expect(p.score).toBeGreaterThan(21 * killScore('jelly'))
  })
  it('한동안 못 잡으면 콤보가 끊긴다', () => {
    const p = newPilot()
    registerKill(p, 'jelly')
    registerKill(p, 'jelly')
    tickPilot(p, 1)
    expect(p.combo).toBe(2)
    tickPilot(p, 2)
    expect(p.combo).toBe(0)
  })
  it('보스가 제일 비싸다', () => {
    expect(killScore('boss')).toBeGreaterThan(killScore('donut'))
    expect(killScore('rock')).toBeGreaterThan(killScore('rockling'))
  })
})

describe('바위 쪼개기', () => {
  it('큰 바위는 작은 바위 2~3개로, 작은 바위는 안 쪼개진다', () => {
    const kids = splitRock({ kind: 'rock', x: 100, y: 100 }, makeRng(1))
    expect(kids.length).toBeGreaterThanOrEqual(2)
    expect(kids.length).toBeLessThanOrEqual(3)
    for (const k of kids) expect(k.kind).toBe('rockling')
    expect(new Set(kids.map((k) => Math.sign(k.vx))).size).toBeGreaterThan(1)
    expect(splitRock({ kind: 'rockling', x: 0, y: 0 }, makeRng(1))).toEqual([])
  })
})

describe('파워업 · 피격', () => {
  it('확산탄은 단계마다 갈래가 늘고 3단계가 끝', () => {
    const p = newPilot()
    expect(shotAngles(p.spread)).toHaveLength(1)
    applyPowerUp(p, 'spread')
    expect(shotAngles(p.spread)).toHaveLength(3)
    applyPowerUp(p, 'spread')
    applyPowerUp(p, 'spread')
    applyPowerUp(p, 'spread')
    expect(p.spread).toBe(2)
    expect(shotAngles(p.spread)).toHaveLength(5)
    // 이미 꽉 차면 점수로
    expect(p.score).toBeGreaterThan(0)
  })
  it('갈래는 좌우 대칭', () => {
    const a = shotAngles(2)
    expect(a[0]).toBeCloseTo(-a[a.length - 1])
  })
  it('방패는 한 번 막아 주고 목숨은 그대로', () => {
    const p = newPilot()
    applyPowerUp(p, 'shield')
    expect(damagePlayer(p)).toBe('shield')
    expect(p.lives).toBe(3)
    expect(p.shield).toBe(false)
  })
  it('맞으면 목숨 하나, 잠깐 무적, 확산 한 단계 내려감, 콤보 끊김', () => {
    const p = newPilot()
    applyPowerUp(p, 'spread')
    registerKill(p, 'jelly')
    expect(damagePlayer(p)).toBe('hurt')
    expect(p.lives).toBe(2)
    expect(p.invuln).toBeGreaterThan(1)
    expect(p.spread).toBe(0)
    expect(p.combo).toBe(0)
    // 무적 동안은 안 맞음
    expect(damagePlayer(p)).toBe('none')
    tickPilot(p, 5)
    expect(p.invuln).toBe(0)
  })
  it('마지막 목숨을 잃으면 dead', () => {
    const p = newPilot()
    damagePlayer(p)
    tickPilot(p, 5)
    damagePlayer(p)
    tickPilot(p, 5)
    expect(damagePlayer(p)).toBe('dead')
    expect(p.lives).toBe(0)
  })
  it('자석은 시간이 지나면 꺼진다', () => {
    const p = newPilot()
    applyPowerUp(p, 'magnet')
    expect(p.magnet).toBeGreaterThan(5)
    tickPilot(p, 30)
    expect(p.magnet).toBe(0)
  })
})

describe('보스 탄막', () => {
  it('조준탄은 플레이어 쪽을 향한 3갈래', () => {
    const v = bossVolley('aim', 0, 180, 100, 180, 500)
    expect(v).toHaveLength(3)
    const mid = v[1]
    expect(Math.abs(mid.vx)).toBeLessThan(1e-6)
    expect(mid.vy).toBeGreaterThan(0)
  })
  it('고리탄에는 빠져나갈 틈이 있다', () => {
    const v = bossVolley('ring', 0, 180, 100, 180, 500)
    expect(v.length).toBeGreaterThan(8)
    const angles = v.map((b) => Math.atan2(b.vy, b.vx)).sort((a, b) => a - b)
    let maxGap = 0
    for (let i = 0; i < angles.length; i++) {
      const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2
      maxGap = Math.max(maxGap, next - angles[i])
    }
    expect(maxGap).toBeGreaterThan((Math.PI * 2) / v.length * 1.8)
  })
  it('탄 속도는 피할 만하다 (초당 220 이하)', () => {
    for (const k of ['aim', 'ring', 'spiral'] as const)
      for (const b of bossVolley(k, 1.3, 180, 100, 60, 500)) expect(Math.hypot(b.vx, b.vy)).toBeLessThanOrEqual(220)
  })
})

describe('화면 배치', () => {
  it('폰 세로는 화면 전체가 경기장', () => {
    const f = playfield(360, 600)
    expect(f.x).toBe(0)
    expect(f.w).toBe(360)
    expect(f.side).toBe(false)
  })
  it('넓은 데스크톱은 가운데 세로 경기장 + 옆 패널', () => {
    const f = playfield(1280, 740)
    expect(f.side).toBe(true)
    expect(f.w).toBeLessThan(600)
    expect(f.x + f.w / 2).toBeCloseTo(640)
    expect(f.h).toBe(740)
  })
})

describe('한 줄 소감', () => {
  it('20자 미만', () => {
    for (const best of [true, false])
      for (const boss of [true, false]) expect(resultLine(12345, 3, best, boss).length).toBeLessThan(20)
  })
  it('최고 기록이면 자랑', () => {
    expect(resultLine(500, 2, true, false)).toContain('최고')
    expect(resultLine(500, 2, false, true)).toContain('보스')
  })
})
