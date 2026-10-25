import type { ThemeId } from '../lib/types'

/**
 * 방 주인이 꾸미는 벽·바닥. 벽은 0번(왼쪽)·1번(오른쪽) 두 면만 꾸민다 (방은 ±30°만 돌아서 이 두 면만 보인다).
 * 벽 평면 좌표는 160×115, 바닥은 160×160.
 */
export const WALL_W = 160
export const WALL_H = 115
export const FLOOR_SIDE = 160

// ─── 벽지 · 바닥 무늬 ───

export const WALL_PATTERNS = [
  { id: 'plain', name: '민무늬' },
  { id: 'hearts', name: '하트' },
  { id: 'stripes', name: '줄무늬' },
  { id: 'dots', name: '땡땡이' },
  { id: 'gingham', name: '깅엄 체크' },
  { id: 'stars', name: '별' },
  { id: 'flowers', name: '꽃' },
  { id: 'brick', name: '벽돌' },
  { id: 'wood', name: '나무 판넬' },
] as const
export type WallPatternId = (typeof WALL_PATTERNS)[number]['id']

export const FLOOR_PATTERNS = [
  { id: 'plain', name: '민무늬' },
  { id: 'checker', name: '체크 타일' },
  { id: 'planks', name: '마루' },
  { id: 'tiles', name: '격자 타일' },
  { id: 'rug', name: '러그' },
  { id: 'dots', name: '카펫' },
] as const
export type FloorPatternId = (typeof FLOOR_PATTERNS)[number]['id']

export const WALL_COLORS = [
  '#ffd6e6', '#ffe0c2', '#fff3d6', '#f6eedd', '#d9f2e6', '#d6ecff',
  '#e6defa', '#ffffff', '#c9c9d6', '#3a4178', '#4a3b33', '#2f3b2f',
]

export const FLOOR_COLORS = [
  '#fff3f8', '#ffc2da', '#f5d39a', '#dcaa72', '#a87445', '#bfe6d0',
  '#cfe3ff', '#e8e8f0', '#ffffff', '#4a4f8c', '#5c4a42', '#3a3a4a',
]

// ─── 벽 장식 (스티커) ───

export const STICKERS = [
  { id: 'window', name: '창문', w: 66, h: 54 },
  { id: 'sunWindow', name: '햇살 창문', w: 66, h: 54 },
  { id: 'moonWindow', name: '달 창문', w: 52, h: 52 },
  { id: 'heartFrame', name: '하트 액자', w: 40, h: 34 },
  { id: 'calendar', name: '달력', w: 34, h: 47 },
  { id: 'lights', name: '전구줄', w: 130, h: 28 },
  { id: 'clock', name: '벽시계', w: 26, h: 26 },
  { id: 'shelf', name: '선반', w: 46, h: 24 },
  { id: 'poster', name: '별 포스터', w: 30, h: 40 },
  { id: 'mirror', name: '거울', w: 26, h: 44 },
] as const
export type StickerId = (typeof STICKERS)[number]['id']
export const stickerById = (id: string) => STICKERS.find((s) => s.id === id)
export const MAX_STICKERS = 5

// ─── 벽 그림 (도트) ───

/** 벽 그림은 4칸짜리 도트 40×28 격자. 글자 하나가 한 칸: '.' 빈칸, 'a'~'l' 색 */
export const ART_PX = 4
export const ART_COLS = WALL_W / ART_PX
export const ART_ROWS = 28
export const ART_LEN = ART_COLS * ART_ROWS
export const DRAW_COLORS: Record<string, string> = {
  a: '#2b2233',
  b: '#ffffff',
  c: '#e8384f',
  d: '#ff8a3d',
  e: '#ffd94a',
  f: '#59c26b',
  g: '#6fd6b8',
  h: '#4d7dff',
  i: '#9d8cff',
  j: '#ff8fb8',
  k: '#8a5a38',
  l: '#9a9ab4',
}
export const emptyArt = () => '.'.repeat(ART_LEN)

export function setArtCell(art: string, col: number, row: number, ch: string) {
  if (col < 0 || row < 0 || col >= ART_COLS || row >= ART_ROWS) return art
  const i = row * ART_COLS + col
  if (art[i] === ch) return art
  return art.slice(0, i) + ch + art.slice(i + 1)
}

/** 같은 색이 가로로 이어진 칸을 묶는다 (SVG rect 수 줄이기) */
export function artRuns(art: string) {
  const runs: { x: number; y: number; w: number; color: string }[] = []
  for (let row = 0; row < ART_ROWS; row++) {
    let col = 0
    while (col < ART_COLS) {
      const ch = art[row * ART_COLS + col]
      const color = DRAW_COLORS[ch]
      if (!color) {
        col++
        continue
      }
      let end = col + 1
      while (end < ART_COLS && art[row * ART_COLS + end] === ch) end++
      runs.push({ x: col, y: row, w: end - col, color })
      col = end
    }
  }
  return runs
}

// ─── 꾸미기 데이터 ───

export interface PlacedSticker {
  id: StickerId
  x: number
  y: number
}

export interface WallDecor {
  color: string
  pattern: WallPatternId
  art: string
  stickers: PlacedSticker[]
}

export interface FloorDecor {
  color: string
  pattern: FloorPatternId
}

export interface Decor {
  walls: [WallDecor, WallDecor]
  floor: FloorDecor
}

const wall = (color: string, pattern: WallPatternId, stickers: PlacedSticker[]): WallDecor => ({
  color,
  pattern,
  art: emptyArt(),
  stickers,
})

/** 방을 처음 만들 때 고른 테마의 기본 꾸미기 */
export function defaultDecor(theme: ThemeId | string): Decor {
  if (theme === 'studio') {
    return {
      walls: [
        wall('#f6eedd', 'stripes', [{ id: 'calendar', x: 40, y: 24 }]),
        wall('#f6eedd', 'stripes', [{ id: 'sunWindow', x: 44, y: 22 }]),
      ],
      floor: { color: '#dcaa72', pattern: 'planks' },
    }
  }
  if (theme === 'night') {
    return {
      walls: [
        wall('#3a4178', 'stars', [{ id: 'lights', x: 14, y: 12 }]),
        wall('#3a4178', 'stars', [{ id: 'moonWindow', x: 52, y: 24 }]),
      ],
      floor: { color: '#4a4f8c', pattern: 'rug' },
    }
  }
  return {
    walls: [
      wall('#ffd6e6', 'hearts', [{ id: 'heartFrame', x: 60, y: 30 }]),
      wall('#ffd6e6', 'hearts', [{ id: 'window', x: 44, y: 22 }]),
    ],
    floor: { color: '#fff3f8', pattern: 'checker' },
  }
}

const HEX = /^#[0-9a-f]{6}$/i
const ART_RE = new RegExp(`^[.a-l]{${ART_LEN}}$`)
const clampN = (n: unknown, min: number, max: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min

function normalizeWall(raw: unknown, fallback: WallDecor): WallDecor {
  if (!raw || typeof raw !== 'object') return fallback
  const r = raw as Partial<WallDecor>
  const stickers = Array.isArray(r.stickers)
    ? r.stickers
        .map((s) => {
          const def = s && stickerById(s.id)
          if (!def) return null
          return { id: def.id, x: clampN(s.x, 0, WALL_W - def.w), y: clampN(s.y, 0, WALL_H - def.h) }
        })
        .filter((s): s is PlacedSticker => s !== null)
        .slice(0, MAX_STICKERS)
    : fallback.stickers
  return {
    color: typeof r.color === 'string' && HEX.test(r.color) ? r.color : fallback.color,
    pattern: WALL_PATTERNS.some((p) => p.id === r.pattern) ? (r.pattern as WallPatternId) : fallback.pattern,
    art: typeof r.art === 'string' && ART_RE.test(r.art) ? r.art : fallback.art,
    stickers,
  }
}

/** 저장소에서 읽은 꾸미기 값을 믿지 않고 안전한 값으로 맞춘다. 없으면 테마 기본값 */
export function normalizeDecor(raw: unknown, theme: ThemeId | string): Decor {
  const base = defaultDecor(theme)
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<Decor>
  const walls = Array.isArray(r.walls) ? r.walls : []
  const f = (r.floor ?? {}) as Partial<FloorDecor>
  return {
    walls: [normalizeWall(walls[0], base.walls[0]), normalizeWall(walls[1], base.walls[1])],
    floor: {
      color: typeof f.color === 'string' && HEX.test(f.color) ? f.color : base.floor.color,
      pattern: FLOOR_PATTERNS.some((p) => p.id === f.pattern) ? (f.pattern as FloorPatternId) : base.floor.pattern,
    },
  }
}

// ─── 색 계산 ───

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** amt > 0 이면 흰색 쪽으로, < 0 이면 검정 쪽으로 섞는다 */
export function shade(hex: string, amt: number) {
  const target = amt > 0 ? 255 : 0
  const k = Math.abs(amt)
  return (
    '#' +
    rgb(hex)
      .map((c) => Math.round(c + (target - c) * k))
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  )
}

export function isDark(hex: string) {
  const [r, g, b] = rgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b < 110
}

/** 무늬 색: 밝은 바탕엔 살짝 진하게, 어두운 바탕엔 밝게 */
export const markColor = (hex: string) => (isDark(hex) ? shade(hex, 0.35) : shade(hex, -0.12))
