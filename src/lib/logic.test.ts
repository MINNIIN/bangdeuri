import { describe, expect, it } from 'vitest'
import { CHARACTERS } from '../art/characters'
import { ITEMS } from '../art/items'
import { BASE_PALETTE, type Sprite, toRuns } from '../art/sprite'
import { clampFloor, clampTilt, floorPoint, MAX_TILT, project, rubberTilt, toFloor, unproject, viewDepth } from './iso'
import { roomIdFrom, roomUrl } from './links'
import { createLocalBackend } from './localBackend'
import { clip, kstDate, MAX_DROPS, todayCount } from './rules'

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  }
}

const sprites: [string, Sprite][] = [
  ...CHARACTERS.map((c) => [`character:${c.id}`, c.sprite] as [string, Sprite]),
  ...ITEMS.map((i) => [`item:${i.id}`, i.sprite] as [string, Sprite]),
]

describe('스프라이트', () => {
  it.each(sprites)('%s: 모든 줄 길이가 같다', (_name, s) => {
    const widths = new Set(s.rows.map((r) => r.length))
    expect([...widths]).toHaveLength(1)
  })

  it.each(sprites)('%s: 팔레트에 없는 글자를 쓰지 않는다', (_name, s) => {
    const used = new Set(s.rows.join('').replace(/\./g, ''))
    for (const ch of used) expect(s.palette[ch] ?? BASE_PALETTE[ch], `'${ch}'`).toBeTruthy()
  })

  it('미니미는 20×28', () => {
    for (const c of CHARACTERS) {
      expect(c.sprite.rows).toHaveLength(28)
      expect(c.sprite.rows[0]).toHaveLength(20)
    }
  })

  it('아이템 id는 서버 규칙(소문자·숫자 24자 이하)을 지킨다', () => {
    for (const i of ITEMS) expect(i.id).toMatch(/^[a-z0-9_-]{1,24}$/)
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length)
  })

  it('가로로 이어진 같은 색은 rect 하나로 합친다', () => {
    const runs = toRuns({ palette: { a: '#f00' }, rows: ['aak.a'] })
    expect(runs).toEqual([
      { x: 0, y: 0, w: 2, color: '#f00' },
      { x: 2, y: 0, w: 1, color: BASE_PALETTE.k },
      { x: 4, y: 0, w: 1, color: '#f00' },
    ])
  })
})

describe('아이소메트릭 좌표', () => {
  it('바닥 좌표 → 화면 → 바닥 좌표가 원래대로 돌아온다', () => {
    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [0.3, 0.8],
      [0.5, 0.5],
    ]) {
      const p = floorPoint(u, v)
      const back = toFloor(p.x, p.y)
      expect(back.u).toBeCloseTo(u)
      expect(back.v).toBeCloseTo(v)
    }
  })

  it('바닥 꼭짓점', () => {
    expect(floorPoint(0, 0)).toEqual({ x: 170, y: 125 })
    expect(floorPoint(1, 1)).toEqual({ x: 170, y: 285 })
  })

  it('돌린 방에서도 화면 → 바닥 좌표가 원래대로 돌아온다', () => {
    for (const theta of [0, 0.4, Math.PI / 2, Math.PI, -2.1]) {
      const p = project({ u: 0.2, v: 0.7 }, theta)
      const back = unproject(p.x, p.y, theta)
      expect(back.u).toBeCloseTo(0.2)
      expect(back.v).toBeCloseTo(0.7)
    }
  })

  it('90° 돌리면 왼쪽 앞 모서리가 뒤 모서리 자리로 온다', () => {
    const p = project({ u: 0, v: 1 }, Math.PI / 2)
    expect(p.x).toBeCloseTo(170)
    expect(p.y).toBeCloseTo(125)
    expect(viewDepth({ u: 0, v: 1 }, Math.PI / 2)).toBeCloseTo(0)
  })

  it('회전은 ±30° 안에서만, 끌 때는 한도 밖으로 조금만 늘어난다', () => {
    expect(clampTilt(1)).toBeCloseTo(MAX_TILT)
    expect(clampTilt(-1)).toBeCloseTo(-MAX_TILT)
    expect(clampTilt(0.2)).toBeCloseTo(0.2)
    expect(rubberTilt(0.2)).toBeCloseTo(0.2)
    expect(rubberTilt(MAX_TILT + 0.5)).toBeCloseTo(MAX_TILT + 0.1)
  })

  it('한도 안에서는 처음의 두 벽만 뒤쪽에 있다', () => {
    for (const t of [-MAX_TILT, 0, MAX_TILT]) {
      expect(viewDepth({ u: 0, v: 0.5 }, t)).toBeLessThan(1)
      expect(viewDepth({ u: 0.5, v: 0 }, t)).toBeLessThan(1)
      expect(viewDepth({ u: 1, v: 0.5 }, t)).toBeGreaterThan(1)
      expect(viewDepth({ u: 0.5, v: 1 }, t)).toBeGreaterThan(1)
    }
  })

  it('바닥 밖은 안쪽으로 붙인다', () => {
    expect(clampFloor({ u: -1, v: 2 })).toEqual({ u: 0.04, v: 0.96 })
  })
})

describe('규칙', () => {
  it('한국 날짜는 UTC+9 기준', () => {
    expect(kstDate(new Date('2026-10-24T15:30:00Z'))).toBe('2026-10-25')
    expect(kstDate(new Date('2026-10-24T14:59:00Z'))).toBe('2026-10-24')
  })

  it('오늘 날짜가 아니면 Today는 0', () => {
    const room = { todayVisits: 5, todayDate: '2026-10-23' } as Parameters<typeof todayCount>[0]
    expect(todayCount(room, new Date('2026-10-24T03:00:00Z'))).toBe(0)
    expect(todayCount({ ...room, todayDate: '2026-10-24' }, new Date('2026-10-24T03:00:00Z'))).toBe(5)
  })

  it('글자 자르기는 이모지를 한 글자로 센다', () => {
    expect(clip('안녕🐻하세요', 3)).toBe('안녕🐻')
  })

  it('방 링크', () => {
    const url = roomUrl('https://x.app/?foo=1#a', 'ab12cd34')
    expect(url).toBe('https://x.app/?r=ab12cd34')
    expect(roomIdFrom(url)).toBe('ab12cd34')
    expect(roomIdFrom('https://x.app/?r=<script>')).toBeNull()
  })
})

describe('로컬 모드 저장소', () => {
  const newRoom = { name: '민수', character: 'bob', theme: 'pink', motto: '하이' } as const
  const drop = { item: 'ramen', u: 0.3, v: 0.4, nickname: '친구', message: '라면 그만' }

  it('방 만들기 → 아이템 놓기 → 방 주인만 삭제', async () => {
    const be = createLocalBackend(memoryStorage())
    const { id, secret } = await be.createRoom(newRoom)
    const room = await be.getRoom(id)
    expect(room?.name).toBe('민수')
    expect(room && 'secret' in room).toBe(false)

    const d = await be.addDrop(id, drop)
    expect(await be.listDrops(id)).toHaveLength(1)

    await expect(be.deleteDrop(id, 'wrong', d.id)).rejects.toThrow('forbidden')
    await be.deleteDrop(id, secret, d.id)
    expect(await be.listDrops(id)).toHaveLength(0)
  })

  it(`아이템은 방마다 ${MAX_DROPS}개까지`, async () => {
    const be = createLocalBackend(memoryStorage())
    const { id } = await be.createRoom(newRoom)
    for (let i = 0; i < MAX_DROPS; i++) await be.addDrop(id, drop)
    await expect(be.addDrop(id, drop)).rejects.toThrow('room_full')
  })

  it('방 삭제는 방 주인만, 지우면 아이템도 같이 사라진다', async () => {
    const be = createLocalBackend(memoryStorage())
    const { id, secret } = await be.createRoom(newRoom)
    const other = await be.createRoom({ ...newRoom, name: '다른방' })
    await be.addDrop(id, drop)
    await be.addDrop(other.id, drop)

    await expect(be.deleteRoom(id, 'wrong')).rejects.toThrow('forbidden')
    await be.deleteRoom(id, secret)
    expect(await be.getRoom(id)).toBeNull()
    expect(await be.listDrops(id)).toHaveLength(0)
    expect(await be.listDrops(other.id)).toHaveLength(1)
  })

  it('방문자 수', async () => {
    const be = createLocalBackend(memoryStorage())
    const { id } = await be.createRoom(newRoom)
    await be.visit(id)
    expect(await be.visit(id)).toEqual({ today: 2, total: 2 })
  })
})
