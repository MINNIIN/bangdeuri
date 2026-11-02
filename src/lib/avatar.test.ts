import { describe, expect, it } from 'vitest'
import {
  ANON_LOOK,
  type AvatarLook,
  BOTTOM_OPTIONS,
  buildAvatar,
  DEFAULT_LOOK,
  EYES_OPTIONS,
  HAIR_OPTIONS,
  HAT_OPTIONS,
  normalizeLook,
  PRESET_LOOKS,
  randomLook,
  TOP_OPTIONS,
} from '../art/avatar'
import { ICONS } from '../art/icons'
import { backSprite, sitSprite } from '../art/poses'
import { BASE_PALETTE } from '../art/sprite'
import { createLocalChannel, type Peer, type RoomEvent } from './realtime'
import { anonName } from './storage'

function* allLooks(): Generator<AvatarLook> {
  for (const hair of HAIR_OPTIONS)
    for (const eyes of EYES_OPTIONS)
      for (const top of TOP_OPTIONS)
        for (const bottom of BOTTOM_OPTIONS)
          for (const hat of HAT_OPTIONS)
            yield { ...DEFAULT_LOOK, hair: hair.id, eyes: eyes.id, top: top.id, bottom: bottom.id, hat: hat.id }
}

describe('미니미 만들기', () => {
  it('어떻게 조합해도 20×28이고 팔레트에 있는 색만 쓴다', () => {
    let n = 0
    for (const look of allLooks()) {
      const s = buildAvatar(look)
      expect(s.rows, JSON.stringify(look)).toHaveLength(28)
      for (const row of s.rows) expect(row, JSON.stringify(look)).toHaveLength(20)
      for (const ch of new Set(s.rows.join('').replace(/\./g, ''))) {
        expect(s.palette[ch] ?? BASE_PALETTE[ch], `${JSON.stringify(look)} '${ch}'`).toBeTruthy()
      }
      n++
    }
    expect(n).toBe(HAIR_OPTIONS.length * EYES_OPTIONS.length * TOP_OPTIONS.length * BOTTOM_OPTIONS.length * HAT_OPTIONS.length)
  })

  it('어떻게 조합해도 앉으면 다리만 잘리고, 뒷모습엔 얼굴이 없다', () => {
    for (const look of allLooks()) {
      const s = buildAvatar(look)
      const sit = sitSprite(s)
      expect(sit.rows.length).toBeLessThan(28)
      expect(sit.rows.length).toBeGreaterThanOrEqual(23)
      expect(backSprite(s).rows.slice(7, 15).join('').slice(0)).not.toMatch(/[sbm]/)
    }
  })

  it('같은 모습은 같은 그림을 다시 쓴다 (자세 캐시가 맞게)', () => {
    expect(buildAvatar({ ...DEFAULT_LOOK })).toBe(buildAvatar({ ...DEFAULT_LOOK }))
  })

  it('색을 바꾸면 그림 모양은 그대로, 색만 바뀐다', () => {
    const a = buildAvatar(DEFAULT_LOOK)
    const b = buildAvatar({ ...DEFAULT_LOOK, topColor: '#59c26b', hairColor: '#e8553a' })
    expect(b.rows).toEqual(a.rows)
    expect(b.palette.t).toBe('#59c26b')
    expect(b.palette.h).toBe('#e8553a')
  })

  it('받은 모습에서 이상한 값은 기본값으로', () => {
    expect(normalizeLook(null)).toEqual(DEFAULT_LOOK)
    const bad = normalizeLook({ ...ANON_LOOK, hair: 'mohawk', topColor: 'red; background:url(x)' })
    expect(bad.hair).toBe(DEFAULT_LOOK.hair)
    expect(bad.topColor).toBe(DEFAULT_LOOK.topColor)
    expect(bad.eyes).toBe('shades')
    for (const p of PRESET_LOOKS) expect(normalizeLook(p.look)).toEqual(p.look)
    for (let i = 0; i < 30; i++) {
      const r = randomLook()
      expect(normalizeLook(r)).toEqual(r)
    }
  })

  it('익명 이름은 닉네임 길이(8자) 안이다', () => {
    for (let i = 0; i < 200; i++) expect([...anonName()].length).toBeLessThanOrEqual(8)
  })
})

describe('도트 아이콘', () => {
  it.each(Object.entries(ICONS))('%s: 9×9', (_id, s) => {
    expect(s.rows).toHaveLength(9)
    for (const row of s.rows) expect(row).toHaveLength(9)
    for (const ch of new Set(s.rows.join('').replace(/\./g, ''))) expect(s.palette[ch] ?? BASE_PALETTE[ch]).toBeTruthy()
  })
})

describe('로컬 실시간 (같은 브라우저 탭끼리)', () => {
  const peer = (cid: string, name: string): Peer => ({ cid, name, look: DEFAULT_LOOK, owner: false })
  const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))

  it.skipIf(typeof BroadcastChannel === 'undefined')('서로 보이고, 보낸 것을 받고, 나가면 사라진다', async () => {
    const a = createLocalChannel('room1', peer('a', '민수'))
    const b = createLocalChannel('room1', peer('b', '지윤'))
    let aPeers: Peer[] = []
    const got: RoomEvent[] = []
    a.onPeers((p) => (aPeers = p))
    a.onEvent((e) => got.push(e))
    b.onPeers(() => {})
    await tick()
    expect(aPeers.map((p) => p.cid).sort()).toEqual(['a', 'b'])

    b.send({ t: 'move', cid: 'b', from: { u: 0.5, v: 0.9 }, to: { u: 0.3, v: 0.3 } })
    await tick()
    expect(got).toEqual([{ t: 'move', cid: 'b', from: { u: 0.5, v: 0.9 }, to: { u: 0.3, v: 0.3 } }])

    b.leave()
    b.leave()
    await tick()
    expect(aPeers.map((p) => p.cid)).toEqual(['a'])
    a.leave()
  })
})
