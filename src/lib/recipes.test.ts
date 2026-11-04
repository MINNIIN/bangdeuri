import { describe, expect, it } from 'vitest'
import { BASICS, PANTRY, RECIPES, recipesWith } from './recipes'
import { toolFor } from './tools'

describe('레시피', () => {
  it('레시피가 20개 이상이고 id가 겹치지 않는다', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(20)
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length)
    for (const r of RECIPES) {
      expect(r.steps.length).toBeGreaterThanOrEqual(2)
      expect(r.minutes).toBeGreaterThan(0)
    }
  })

  it('기본양념은 없어도 된다', () => {
    const fake = [{ id: 'x', name: 'x', minutes: 5, level: 1 as const, ingredients: ['라면', '물', '계란'], steps: ['a', 'b'], tags: [] }]
    expect(recipesWith(['라면', '계란'], fake).map((r) => r.id)).toEqual(['x'])
  })

  it('재료가 하나라도 없으면 빠진다', () => {
    for (const r of recipesWith(['라면'])) expect(r.ingredients).not.toContain('계란')
  })

  it('빈 냉장고면 기본양념만으로 되는 것만', () => {
    for (const r of recipesWith([])) for (const i of r.ingredients) expect(BASICS).toContain(i)
  })

  it('걸리는 시간 짧은 순', () => {
    const list = recipesWith(PANTRY)
    expect(list.length).toBe(RECIPES.length)
    for (let i = 1; i < list.length; i++) expect(list[i].minutes).toBeGreaterThanOrEqual(list[i - 1].minutes)
  })

  it('PANTRY에 기본양념은 없다', () => {
    for (const b of BASICS) expect(PANTRY).not.toContain(b)
  })
})

describe('가구 도구', () => {
  it('가구마다 쓸 수 있는 도구', () => {
    expect(toolFor('counter')).toBe('recipe')
    expect(toolFor('fridge')).toBe('pantry')
    expect(toolFor('alarm')).toBe('alarm')
    expect(toolFor('sofa')).toBeUndefined()
  })
})
