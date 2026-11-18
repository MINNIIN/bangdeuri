import { describe, expect, it } from 'vitest'
import { brewSteps, DRINKS, drinkOf } from './cafe'

describe('카페 음료 만들기 순서', () => {
  it('메뉴가 여럿이고 id가 겹치지 않는다', () => {
    expect(DRINKS.length).toBeGreaterThanOrEqual(6)
    expect(new Set(DRINKS.map((d) => d.id)).size).toBe(DRINKS.length)
    expect(drinkOf('latte')?.name).toBe('카페 라떼')
    expect(drinkOf('nope')).toBeUndefined()
  })

  for (const d of DRINKS)
    it(`${d.name}: 컵을 꺼내 다 채우고, 마지막엔 픽업대에 내놓는다`, () => {
      const steps = brewSteps(d)
      expect(steps.at(-1)!.at).toBe('pickup')
      // 다 만들면 컵이 거의 가득
      const last = [...steps].reverse().find((s) => s.cup.fill !== undefined)!
      expect(last.cup.fill).toBeGreaterThan(0.8)
      // 채우는 양은 줄지 않는다
      let fill = 0
      for (const s of steps) {
        if (s.cup.fill !== undefined) {
          expect(s.cup.fill).toBeGreaterThanOrEqual(fill)
          fill = s.cup.fill
        }
      }
      // 너무 길지도 짧지도 않게 (구경하기 좋은 8~20초)
      const total = steps.reduce((t, s) => t + s.ms, 0)
      expect(total).toBeGreaterThanOrEqual(8000)
      expect(total).toBeLessThanOrEqual(20000)
      // 바리스타가 말하는 줄이 있다
      expect(steps.every((s) => s.line.length > 0)).toBe(true)
    })

  it('커피 음료는 원두를 갈고 에스프레소를 내린다, 딸기 라떼는 커피가 없다', () => {
    const at = (id: string) => brewSteps(drinkOf(id)!).map((s) => s.at)
    expect(at('ice_americano')).toEqual(expect.arrayContaining(['grinder', 'machine']))
    expect(at('latte')).toEqual(expect.arrayContaining(['grinder', 'machine', 'steam']))
    expect(at('strawberry')).not.toContain('machine')
    expect(at('strawberry')).toContain('syrup')
  })

  it('아이스는 얼음을 넣고, 따뜻한 우유 음료는 스팀을 하고 라떼 아트를 올린다', () => {
    expect(brewSteps(drinkOf('ice_americano')!).some((s) => s.cup.ice)).toBe(true)
    expect(brewSteps(drinkOf('latte')!).some((s) => s.cup.ice)).toBe(false)
    expect(brewSteps(drinkOf('latte')!).some((s) => s.cup.top === 'art')).toBe(true)
  })

  it('컵은 줄기가 흐르는 동안에만 차오른다 (채우는 단계마다 차오르는 구간이 있다)', () => {
    for (const d of DRINKS)
      for (const st of brewSteps(d))
        if (st.cup.fill !== undefined) {
          expect(st.win).toBeDefined()
          expect(st.win![0]).toBeGreaterThanOrEqual(0)
          expect(st.win![1]).toBeLessThanOrEqual(1)
          expect(st.win![0]).toBeLessThan(st.win![1])
        }
  })

  it('아이스 커피는 샷잔에 뽑아 얼음 컵에 붓는다 (컵은 추출구 아래로 안 간다)', () => {
    for (const id of ['ice_americano', 'ice_latte']) {
      const steps = brewSteps(drinkOf(id)!)
      const at = steps.map((s) => s.at)
      expect(at.indexOf('pour')).toBeGreaterThan(at.indexOf('ice'))
      expect(at.indexOf('ice')).toBeGreaterThan(at.indexOf('machine'))
      expect(steps.every((s) => s.cup.place !== 'spout')).toBe(true)
    }
    // 따뜻한 커피는 컵에 바로 내린다
    expect(brewSteps(drinkOf('latte')!).some((s) => s.cup.place === 'spout')).toBe(true)
    expect(brewSteps(drinkOf('latte')!).some((s) => s.at === 'pour')).toBe(false)
  })

  it('아이스는 다 채운 뒤에야 뚜껑을 닫고, 따뜻한 음료(머그)는 뚜껑이 없다', () => {
    for (const d of DRINKS) {
      const steps = brewSteps(d)
      const lidAt = steps.findIndex((s) => s.cup.lid)
      if (!d.iced) {
        expect(lidAt).toBe(-1)
        continue
      }
      expect(lidAt).toBeGreaterThan(0)
      // 뚜껑 뒤로는 더 채우지 않는다 (픽업만 남는다)
      expect(steps.slice(lidAt + 1).every((s) => s.cup.fill === undefined)).toBe(true)
      expect(steps.slice(lidAt + 1).map((s) => s.at)).toEqual(['pickup'])
    }
  })
})
