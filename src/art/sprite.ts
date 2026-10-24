/**
 * 도트 스프라이트: 한 글자 = 한 픽셀. '.'은 투명.
 * 모든 스프라이트가 공통으로 쓰는 색(k 외곽선, w 흰색)은 BASE에 있고, 나머지는 스프라이트마다 정한다.
 */
export interface Sprite {
  rows: string[]
  palette: Record<string, string>
}

export const BASE_PALETTE: Record<string, string> = {
  k: '#2b2233',
  w: '#ffffff',
}

export interface PixelRun {
  x: number
  y: number
  w: number
  color: string
}

export const spriteWidth = (s: Sprite) => s.rows[0]?.length ?? 0
export const spriteHeight = (s: Sprite) => s.rows.length

/** 같은 색이 가로로 이어지는 픽셀을 하나의 rect로 합친다 (SVG 노드 수를 줄이려고) */
export function toRuns(s: Sprite): PixelRun[] {
  const runs: PixelRun[] = []
  s.rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x]
      if (ch === '.') {
        x++
        continue
      }
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      const color = s.palette[ch] ?? BASE_PALETTE[ch]
      if (color) runs.push({ x, y, w: end - x, color })
      x = end
    }
  })
  return runs
}
