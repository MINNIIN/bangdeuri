import { describe, expect, it } from 'vitest'
import {
  ART_COLS,
  ART_LEN,
  artRuns,
  defaultDecor,
  emptyArt,
  MAX_STICKERS,
  normalizeDecor,
  paintCell,
  paintLine,
  setArtCell,
  shade,
  STICKERS,
  WALL_H,
  WALL_W,
} from '../art/decor'
import { ITEM_CATS, ITEMS } from '../art/items'
import { createLocalBackend } from './localBackend'

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

describe('꾸미기 데이터', () => {
  it('테마마다 기본 꾸미기가 있고 그대로 통과한다', () => {
    for (const theme of ['pink', 'studio', 'night']) {
      const d = defaultDecor(theme)
      expect(normalizeDecor(d, theme)).toEqual(d)
      expect(d.walls[0].art).toHaveLength(ART_LEN)
    }
  })

  it('비었거나 깨진 값은 테마 기본값으로', () => {
    expect(normalizeDecor(null, 'night')).toEqual(defaultDecor('night'))
    expect(normalizeDecor('haha', 'pink')).toEqual(defaultDecor('pink'))
  })

  it('이상한 색·무늬·그림은 버리고, 장식은 벽 안으로 넣고 개수를 자른다', () => {
    const base = defaultDecor('pink')
    const raw = {
      walls: [
        {
          color: 'red; background:url(x)',
          pattern: 'nope',
          art: '<script>',
          stickers: [
            { id: 'clock', x: 9999, y: -50 },
            { id: 'unknown', x: 0, y: 0 },
            ...Array.from({ length: 10 }, () => ({ id: 'poster', x: 10, y: 10 })),
          ],
        },
      ],
      floor: { color: '#ABCDEF', pattern: 'tiles' },
    }
    const d = normalizeDecor(raw, 'pink')
    expect(d.walls[0].color).toBe(base.walls[0].color)
    expect(d.walls[0].pattern).toBe(base.walls[0].pattern)
    expect(d.walls[0].art).toBe(emptyArt())
    expect(d.walls[0].stickers).toHaveLength(MAX_STICKERS)
    const clock = STICKERS.find((s) => s.id === 'clock')!
    expect(d.walls[0].stickers[0]).toEqual({ id: 'clock', x: WALL_W - clock.w, y: 0 })
    expect(d.walls[1]).toEqual(base.walls[1])
    expect(d.floor).toEqual({ color: '#ABCDEF', pattern: 'tiles' })
  })

  it('장식은 벽 밖으로 못 나간다', () => {
    for (const s of STICKERS) {
      expect(s.w).toBeLessThanOrEqual(WALL_W)
      expect(s.h).toBeLessThanOrEqual(WALL_H)
    }
  })

  it('벽 그림 칸 칠하기와 묶기', () => {
    let art = emptyArt()
    art = setArtCell(art, 0, 0, 'c')
    art = setArtCell(art, 1, 0, 'c')
    art = setArtCell(art, ART_COLS - 1, 1, 'a')
    expect(setArtCell(art, -1, 0, 'c')).toBe(art)
    expect(setArtCell(art, ART_COLS, 0, 'c')).toBe(art)
    expect(artRuns(art)).toEqual([
      { x: 0, y: 0, w: 2, color: '#e8384f' },
      { x: ART_COLS - 1, y: 1, w: 1, color: '#2b2233' },
    ])
    expect(setArtCell(art, 0, 0, '.')[0]).toBe('.')
  })

  it('빠르게 그은 대각선도 빈틈 없이 이어진다', () => {
    const art = paintLine(emptyArt(), 2, 3, 20, 12, 'c')
    const cells: [number, number][] = []
    for (let i = 0; i < ART_LEN; i++) if (art[i] === 'c') cells.push([i % ART_COLS, Math.floor(i / ART_COLS)])
    // 시작·끝 칸이 칠해지고, 가로로 한 칸도 건너뛰지 않는다
    expect(cells).toContainEqual([2, 3])
    expect(cells).toContainEqual([20, 12])
    for (let col = 2; col <= 20; col++) expect(cells.some(([c]) => c === col)).toBe(true)
    // 이웃한 칸끼리 대각선까지 포함해 붙어 있다
    const sorted = [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1])
    for (let i = 1; i < sorted.length; i++) {
      expect(Math.abs(sorted[i][0] - sorted[i - 1][0])).toBeLessThanOrEqual(1)
      expect(Math.abs(sorted[i][1] - sorted[i - 1][1])).toBeLessThanOrEqual(1)
    }
  })

  it('굵게는 2×2칸, 벽 밖은 무시', () => {
    const art = paintCell(emptyArt(), ART_COLS - 1, 0, 'a', 2)
    expect([...art].filter((c) => c === 'a')).toHaveLength(2)
  })

  it('색 밝기 조절', () => {
    expect(shade('#808080', 1)).toBe('#ffffff')
    expect(shade('#808080', -1)).toBe('#000000')
    expect(shade('#808080', 0)).toBe('#808080')
  })

  it('로컬 모드: 방 주인만 꾸밀 수 있고, 옛날 방도 기본 꾸미기로 열린다', async () => {
    const storage = memoryStorage()
    const be = createLocalBackend(storage)
    const { id, secret } = await be.createRoom({ name: '민수', character: 'bob', theme: 'studio', motto: '' })
    expect((await be.getRoom(id))?.decor).toEqual(defaultDecor('studio'))

    const next = defaultDecor('night')
    await expect(be.updateDecor(id, 'wrong', next)).rejects.toThrow('forbidden')
    await be.updateDecor(id, secret, next)
    expect((await be.getRoom(id))?.decor).toEqual(next)

    // 꾸미기 칸이 없던 시절에 저장된 방
    const db = JSON.parse(storage.getItem('bangdeuri:localdb')!)
    delete db.rooms[id].decor
    storage.setItem('bangdeuri:localdb', JSON.stringify(db))
    expect((await be.getRoom(id))?.decor).toEqual(defaultDecor('studio'))
  })
})

describe('아이템 카테고리', () => {
  it('모든 아이템이 카테고리를 가지고, 카테고리마다 3개 이상', () => {
    const ids = ITEM_CATS.map((c) => c.id) as string[]
    for (const it of ITEMS) expect(ids).toContain(it.cat)
    for (const c of ITEM_CATS) expect(ITEMS.filter((i) => i.cat === c.id).length).toBeGreaterThanOrEqual(3)
  })
})
