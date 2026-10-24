import { useMemo } from 'react'
import { type Sprite, spriteHeight, spriteWidth, toRuns } from '../art/sprite'

/** 방 안에서 도트 한 칸의 크기 (viewBox 340 기준). 미니미는 방이 넓어 보이게 조금 작게 */
export const ROOM_PX = 2.1
export const CHARACTER_PX = 1.8

/** 스프라이트를 SVG rect로 그린다. (x, y)는 발 밑 가운데 */
export function PixelSprite({ sprite, x = 0, y = 0, px = ROOM_PX }: { sprite: Sprite; x?: number; y?: number; px?: number }) {
  const runs = useMemo(() => toRuns(sprite), [sprite])
  const left = x - (spriteWidth(sprite) * px) / 2
  const top = y - spriteHeight(sprite) * px
  return (
    <g transform={`translate(${left} ${top}) scale(${px})`}>
      {runs.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.color} />
      ))}
    </g>
  )
}

/** 버튼·목록에 쓰는 작은 미리보기 (HTML 안에 넣는 독립 SVG) */
export function SpriteIcon({ sprite, size = 40, className }: { sprite: Sprite; size?: number; className?: string }) {
  const w = spriteWidth(sprite)
  const h = spriteHeight(sprite)
  const side = Math.max(w, h)
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`${-(side - w) / 2} ${-(side - h)} ${side} ${side}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      <PixelSprite sprite={sprite} x={w / 2} y={h} px={1} />
    </svg>
  )
}
