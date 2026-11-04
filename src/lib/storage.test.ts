import { beforeEach, describe, expect, it } from 'vitest'
import { PRESET_LOOKS } from '../art/avatar'
import { store, VISITS_KEEP } from './storage'

const room = (id: string, name = id) => ({
  id,
  slug: `s${id}`,
  name,
  ownerId: `o${id}`,
  owner: { nickname: `주인${id}`, look: PRESET_LOOKS[0].look },
})

describe('놀러 간 방 기록', () => {
  beforeEach(() => localStorage.clear())

  it('들어간 친구 방을 최근 순으로 기억한다', () => {
    store.rememberVisit(room('a'), '2026-11-01T00:00:00Z')
    store.rememberVisit(room('b'), '2026-11-02T00:00:00Z')
    expect(store.visits().map((v) => v.id)).toEqual(['b', 'a'])
  })

  it('다시 가면 맨 앞으로 올리고 이름·링크를 새로 바꾼다', () => {
    store.rememberVisit(room('a'))
    store.rememberVisit(room('b'))
    store.rememberVisit({ ...room('a', '새이름'), slug: 'newslug' })
    const list = store.visits()
    expect(list.map((v) => v.id)).toEqual(['a', 'b'])
    expect(list[0].name).toBe('새이름')
    expect(list[0].slug).toBe('newslug')
  })

  it(`최대 ${VISITS_KEEP}개까지만 남긴다`, () => {
    for (let i = 0; i < VISITS_KEEP + 5; i++) store.rememberVisit(room(String(i)))
    expect(store.visits()).toHaveLength(VISITS_KEEP)
    expect(store.visits()[0].id).toBe(String(VISITS_KEEP + 4))
  })

  it('목록에서 지울 수 있다', () => {
    store.rememberVisit(room('a'))
    store.rememberVisit(room('b'))
    store.forgetVisit('a')
    expect(store.visits().map((v) => v.id)).toEqual(['b'])
  })

  it('예전 저장 형식(visits 없음)도 깨지지 않는다', () => {
    localStorage.setItem('bangdeuri:v2', JSON.stringify({ guest: null, dropped: [], seen: {}, kicked: {} }))
    expect(store.visits()).toEqual([])
  })
})

describe('기기 비밀 키', () => {
  beforeEach(() => localStorage.clear())

  it('처음 부를 때 만들고 그다음부터 같은 값', () => {
    const k = store.deviceKey()
    expect(k).toMatch(/^[a-z0-9]{32}$/)
    expect(store.deviceKey()).toBe(k)
  })
})
