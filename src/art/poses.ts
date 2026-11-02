import type { Sprite } from './sprite'

/**
 * 미니미 자세. 그림을 새로 그리지 않고 원래 스프라이트를 잘라 쓰거나 색을 바꿔 만든다.
 * 미니미 스프라이트는 20×28: 0~7줄 머리, 8~13줄 얼굴, 14줄 턱, 15줄 머리 아래 외곽선, 그 아래 몸.
 */

const FACE_TOP = 7
const FACE_BOTTOM = 14
const HEAD_ROWS = 16

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
export function backSprite(sprite: Sprite): Sprite {
  return memo(sprite, 'back', () => {
    const hair = sprite.back ?? 'h'
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

/** 옷장에서 갈아입는 옷 (윗옷 t·아랫옷 j 색만 바꾼다). 0번은 원래 옷 */
export const OUTFITS: Record<string, string>[] = [
  {},
  { t: '#8fe0b0', T: '#5cc28a', j: '#3a3f6b', J: '#2a2e52' },
  { t: '#ffd94a', T: '#e0a520', j: '#e8553a', J: '#b83a26' },
  { t: '#4a4f8c', T: '#2f3566', j: '#ff8fb8', J: '#e66a98' },
]

export function withOutfit(sprite: Sprite, outfit: number): Sprite {
  const colors = OUTFITS[outfit % OUTFITS.length]
  if (!colors || !Object.keys(colors).length) return sprite
  return memo(sprite, `outfit:${outfit}`, () => ({ ...sprite, palette: { ...sprite.palette, ...colors } }))
}
