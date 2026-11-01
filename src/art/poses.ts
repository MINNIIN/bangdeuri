import type { CharacterId } from '../lib/types'
import type { Sprite } from './sprite'

/**
 * 미니미 자세. 그림을 새로 그리지 않고 원래 스프라이트를 잘라 쓰거나 색을 바꿔 만든다.
 * 미니미 스프라이트는 20×28: 0~7줄 머리, 8~13줄 얼굴, 14줄 턱, 15줄 머리 아래 외곽선, 그 아래 몸.
 */

const FACE_TOP = 7
const FACE_BOTTOM = 14
const HEAD_ROWS = 16

/** 뒷모습에서 얼굴을 덮는 머리색 */
const BACK_HAIR: Record<CharacterId, string> = { bob: 'h', cap: 'h', bear: 'r' }

// 스프라이트 객체마다 만든 자세를 기억한다 (옷을 갈아입으면 다른 객체라 따로 만든다)
const cache = new WeakMap<Sprite, Map<string, Sprite>>()
function memo(src: Sprite, key: string, make: () => Sprite) {
  let m = cache.get(src)
  if (!m) cache.set(src, (m = new Map()))
  let s = m.get(key)
  if (!s) m.set(key, (s = make()))
  return s
}

/** 뒷모습: 얼굴 부분을 머리색으로 덮는다 */
export function backSprite(id: CharacterId, sprite: Sprite): Sprite {
  return memo(sprite, `back:${id}`, () => {
    const hair = BACK_HAIR[id] ?? 'h'
    const rows = sprite.rows.map((row, y) => {
      if (y < FACE_TOP || y > FACE_BOTTOM) return row
      return [...row].map((ch, x) => (x >= 4 && x <= 15 && 'sbmwk'.includes(ch) ? hair : ch)).join('')
    })
    return { ...sprite, rows }
  })
}

/** 앉은 모습: 다리 줄(가운데 두 칸이 비어 있는 줄)을 아래에서부터 잘라낸다 */
export function sitSprite(sprite: Sprite): Sprite {
  return memo(sprite, 'sit', () => {
    const rows = [...sprite.rows]
    while (rows.length > HEAD_ROWS && rows[rows.length - 1][9] === '.' && rows[rows.length - 1][10] === '.') rows.pop()
    return { ...sprite, rows }
  })
}

/** 머리만 (이불·욕조 위로 얼굴만 내밀 때) */
export function headSprite(sprite: Sprite): Sprite {
  return memo(sprite, 'head', () => ({ ...sprite, rows: sprite.rows.slice(0, HEAD_ROWS) }))
}

/** 아래쪽 몇 줄만 잘라 쓴다 (이불·욕조 앞면을 미니미 위에 덮을 때) */
export function bottomRows(sprite: Sprite, from: number): Sprite {
  return memo(sprite, `bottom:${from}`, () => ({ ...sprite, rows: sprite.rows.slice(from) }))
}

/** 옷장에서 갈아입는 옷. 0번은 원래 옷 */
export const OUTFITS: Record<CharacterId, Record<string, string>[]> = {
  bob: [
    {},
    { p: '#8fe0b0', P: '#5cc28a', j: '#3a3f6b' },
    { p: '#ffd94a', P: '#e0a520', j: '#e8553a' },
    { p: '#4a4f8c', P: '#2f3566', j: '#ff8fb8', y: '#ff8fb8' },
  ],
  cap: [
    {},
    { g: '#ff8fb8', G: '#e66a98', c: '#ffd94a', C: '#e0a520', L: '#fff3b0' },
    { g: '#ffd94a', G: '#e0a520', n: '#4a3b33', c: '#e8553a', C: '#b83a26', L: '#ff9b85' },
    { g: '#9d8cff', G: '#7a68e0', n: '#2f3566', c: '#59c26b', C: '#3a9a4c', L: '#b4ff9a' },
  ],
  bear: [
    {},
    { r: '#f3e6d6', R: '#d9c7b0', t: '#ffffff', T: '#f3e6d6', e: '#ffb3c1' },
    { r: '#ff9cc0', R: '#e66a98', t: '#ffe3ef', T: '#ffc2da', e: '#fff3b0' },
    { r: '#8fb0ff', R: '#6a8cff', t: '#e6efff', T: '#c9d8ff', e: '#ffd94a' },
  ],
}

export function withOutfit(id: CharacterId, sprite: Sprite, outfit: number): Sprite {
  const list = OUTFITS[id] ?? [{}]
  const colors = list[outfit % list.length]
  if (!colors || !Object.keys(colors).length) return sprite
  return memo(sprite, `outfit:${outfit}`, () => ({ ...sprite, palette: { ...sprite.palette, ...colors } }))
}
