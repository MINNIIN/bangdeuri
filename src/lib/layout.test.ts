import { describe, expect, it } from 'vitest'
import { normalizeDecor } from '../art/decor'
import { MAX_LAYOUT, mergeLayout, normalizeLayout, wrapAngle } from './layout'

describe('가구 배치 저장', () => {
  it('받은 값을 믿지 않고 맞춘다', () => {
    expect(normalizeLayout(null)).toBeUndefined()
    expect(normalizeLayout([1, 2, 3])).toBeUndefined()
    expect(
      normalizeLayout({
        'fx-sofa': [0.2, 0.3, 1.5708],
        'bad key!': [0.1, 0.1, 0],
        'fx-bed': [0.1, 'x', 0],
        'fx-tv': [0.1, 0.2],
        'fx-desk': [Infinity, 0, 0],
        'fx-chair': [-3, 9, 10],
      }),
    ).toEqual({ 'fx-sofa': [0.2, 0.3, 1.57], 'fx-chair': [0, 1, -2.57] })
    expect(Math.abs(wrapAngle(Math.PI * 3))).toBeCloseTo(Math.PI)
  })

  it('너무 많으면 자른다', () => {
    const raw = Object.fromEntries(Array.from({ length: MAX_LAYOUT + 30 }, (_, i) => [`k${i}`, [0.5, 0.5, 0]]))
    expect(Object.keys(normalizeLayout(raw)!)).toHaveLength(MAX_LAYOUT)
  })

  it('바꾼 자리 합치기: 되돌리기는 지우고, 치워진 아이템은 버린다', () => {
    const base = { 'fx-sofa': [0.2, 0.3, 0] as [number, number, number], gone: [0.5, 0.5, 0] as [number, number, number] }
    const next = mergeLayout(
      base,
      [
        ['fx-bed', [0.7, 0.2, Math.PI / 2]],
        ['fx-sofa', null],
      ],
      (k) => k !== 'gone',
    )
    expect(next).toEqual({ 'fx-bed': [0.7, 0.2, 1.57] })
    expect(mergeLayout(base, [['fx-sofa', null]], (k) => k !== 'gone')).toBeUndefined()
  })

  it('방 꾸미기에 배치가 같이 저장된다', () => {
    const d = normalizeDecor({ layout: { 'fx-sofa': [0.2, 0.3, 0] } }, 'studio')
    expect(d.layout).toEqual({ 'fx-sofa': [0.2, 0.3, 0] })
    expect(normalizeDecor({}, 'studio').layout).toBeUndefined()
  })
})
