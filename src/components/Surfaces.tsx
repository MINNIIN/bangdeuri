import { useMemo } from 'react'
import {
  ART_PX,
  artRuns,
  FLOOR_SIDE,
  type FloorDecor,
  isDark,
  markColor,
  shade,
  type StickerId,
  WALL_H,
  WALL_W,
  type WallDecor,
} from '../art/decor'

const INK = '#2b2233'

/** 벽 한 면을 평면 좌표(160×115)로 그린다. 방에서는 아이소메트릭 행렬로 눕혀 쓰고, 편집기에서는 그대로 쓴다 */
export function WallSurface({ id, wall, dim = 0 }: { id: string; wall: WallDecor; dim?: number }) {
  const runs = useMemo(() => artRuns(wall.art), [wall.art])
  const base = dim ? shade(wall.color, -dim) : wall.color
  return (
    <g>
      <defs>
        <WallPattern id={id} pattern={wall.pattern} color={base} />
      </defs>
      <rect width={WALL_W} height={WALL_H} fill={base} />
      {wall.pattern !== 'plain' && <rect width={WALL_W} height={WALL_H} fill={`url(#${id})`} />}
      <g shapeRendering="crispEdges">
        {runs.map((r, i) => (
          <rect key={i} x={r.x * ART_PX} y={r.y * ART_PX} width={r.w * ART_PX} height={ART_PX} fill={r.color} />
        ))}
      </g>
      {wall.stickers.map((s, i) => (
        <g key={i} transform={`translate(${s.x} ${s.y})`}>
          <Sticker id={s.id} />
        </g>
      ))}
      <rect y={WALL_H - 8} width={WALL_W} height={8} fill="rgba(0,0,0,0.08)" />
    </g>
  )
}

export function FloorSurface({ id, floor }: { id: string; floor: FloorDecor }) {
  return (
    <g>
      <defs>
        <FloorPattern id={id} pattern={floor.pattern} color={floor.color} />
      </defs>
      <rect width={FLOOR_SIDE} height={FLOOR_SIDE} fill={floor.color} />
      {floor.pattern !== 'plain' && floor.pattern !== 'rug' && (
        <rect width={FLOOR_SIDE} height={FLOOR_SIDE} fill={`url(#${id})`} />
      )}
      {floor.pattern === 'rug' && <Rug color={floor.color} />}
    </g>
  )
}

/** 바닥 두께 색 (왼쪽 앞면, 오른쪽 앞면) */
export const slabColors = (floor: FloorDecor) => [shade(floor.color, -0.25), shade(floor.color, -0.4)] as const

function WallPattern({ id, pattern, color }: { id: string; pattern: WallDecor['pattern']; color: string }) {
  const c = markColor(color)
  switch (pattern) {
    case 'stripes':
      return (
        <pattern id={id} width={14} height={WALL_H} patternUnits="userSpaceOnUse">
          <rect width={5} height={WALL_H} fill={c} opacity={0.6} />
        </pattern>
      )
    case 'dots':
      return (
        <pattern id={id} width={14} height={14} patternUnits="userSpaceOnUse">
          <circle cx={4} cy={4} r={2} fill={c} />
          <circle cx={11} cy={11} r={2} fill={c} />
        </pattern>
      )
    case 'gingham':
      return (
        <pattern id={id} width={16} height={16} patternUnits="userSpaceOnUse">
          <rect width={8} height={16} fill={c} opacity={0.35} />
          <rect width={16} height={8} fill={c} opacity={0.35} />
        </pattern>
      )
    case 'stars': {
      // 어두운 벽의 별은 노랗게 빛나게
      const star = isDark(color) ? '#fff3b0' : c
      return (
        <pattern id={id} width={36} height={30} patternUnits="userSpaceOnUse">
          <rect x={6} y={6} width={1.5} height={1.5} fill={star} />
          <rect x={24} y={18} width={1} height={1} fill={star} opacity={0.7} />
          <path d="M18 3h1v2h2v1h-2v2h-1V6h-2V5h2z" fill={star} opacity={0.85} />
          <rect x={31} y={9} width={1} height={1} fill="#fff" opacity={0.6} />
        </pattern>
      )
    }
    case 'flowers':
      return (
        <pattern id={id} width={24} height={24} patternUnits="userSpaceOnUse">
          <path d="M6 4h2v2h2v2H8v2H6V8H4V6h2z" fill={c} />
          <rect x={6} y={6} width={2} height={2} fill="#ffd94a" />
          <path d="M18 15h2v2h2v2h-2v2h-2v-2h-2v-2h2z" fill={c} opacity={0.7} />
        </pattern>
      )
    case 'brick':
      return (
        <pattern id={id} width={24} height={14} patternUnits="userSpaceOnUse">
          <rect y={6} width={24} height={1} fill={c} />
          <rect y={13} width={24} height={1} fill={c} />
          <rect x={6} width={1} height={6} fill={c} />
          <rect x={18} y={7} width={1} height={6} fill={c} />
        </pattern>
      )
    case 'wood':
      return (
        <pattern id={id} width={20} height={WALL_H} patternUnits="userSpaceOnUse">
          <rect width={1.5} height={WALL_H} fill={c} />
          <rect x={9} y={20} width={1} height={10} fill={c} opacity={0.5} />
          <rect x={14} y={70} width={1} height={12} fill={c} opacity={0.5} />
        </pattern>
      )
    case 'hearts':
    default:
      return (
        <pattern id={id} width={24} height={22} patternUnits="userSpaceOnUse">
          <path d="M4 4h2v1h1V4h2v3H8v1H7v1H6V8H5V7H4z" fill={c} opacity={0.75} />
          <path d="M16 15h2v1h1v-1h2v3h-1v1h-1v1h-1v-1h-1v-1h-1z" fill={c} opacity={0.5} />
        </pattern>
      )
  }
}

function FloorPattern({ id, pattern, color }: { id: string; pattern: FloorDecor['pattern']; color: string }) {
  const b = isDark(color) ? shade(color, 0.12) : shade(color, -0.1)
  switch (pattern) {
    case 'planks':
      return (
        <pattern id={id} width={FLOOR_SIDE} height={14} patternUnits="userSpaceOnUse">
          <rect y={13} width={FLOOR_SIDE} height={1} fill={b} />
          <rect x={38} width={1} height={13} fill={b} />
          <rect x={102} width={1} height={13} fill={b} />
        </pattern>
      )
    case 'tiles':
      return (
        <pattern id={id} width={20} height={20} patternUnits="userSpaceOnUse">
          <rect width={20} height={1} fill={b} />
          <rect width={1} height={20} fill={b} />
        </pattern>
      )
    case 'dots':
      return (
        <pattern id={id} width={10} height={10} patternUnits="userSpaceOnUse">
          <rect x={2} y={2} width={1.5} height={1.5} fill={b} />
          <rect x={7} y={7} width={1.5} height={1.5} fill={b} />
        </pattern>
      )
    case 'checker':
    default:
      return (
        <pattern id={id} width={28} height={28} patternUnits="userSpaceOnUse">
          <rect width={14} height={14} fill={b} />
          <rect x={14} y={14} width={14} height={14} fill={b} />
        </pattern>
      )
  }
}

function Rug({ color }: { color: string }) {
  const rug = isDark(color) ? shade(color, 0.3) : shade(color, -0.15)
  return (
    <g>
      <rect x={30} y={30} width={100} height={100} rx={10} fill={rug} />
      <rect x={38} y={38} width={84} height={84} rx={6} fill="none" stroke="#fff3b0" strokeWidth={2} strokeDasharray="4 3" />
    </g>
  )
}

/** 벽 장식. 좌표는 각 장식의 왼쪽 위가 (0, 0) */
export function Sticker({ id }: { id: StickerId }) {
  switch (id) {
    case 'window':
    case 'sunWindow': {
      const sun = id === 'sunWindow'
      return (
        <g>
          <rect x={4} width={58} height={50} fill="#fff" stroke={INK} strokeWidth={1.5} />
          <rect x={8} y={4} width={50} height={42} fill={sun ? '#bfe6ff' : '#a9dcff'} />
          {sun ? (
            <circle cx={46} cy={16} r={7} fill="#ffd94a" />
          ) : (
            <>
              <path d="M14 18h4v-2h6v-2h6v2h2v2h4v2h2v4H14z" fill="#fff" />
              <path d="M42 34h2v-2h6v2h2v2h-10z" fill="#fff" />
            </>
          )}
          <rect x={32} y={4} width={2} height={42} fill="#fff" />
          <rect x={8} y={24} width={50} height={2} fill="#fff" />
          <rect y={50} width={66} height={4} fill={sun ? '#c9935b' : '#ff9cc0'} stroke={INK} strokeWidth={1} />
        </g>
      )
    }
    case 'moonWindow':
      return (
        <g>
          <circle cx={26} cy={26} r={26} fill="#151838" stroke={INK} strokeWidth={1.5} />
          <circle cx={26} cy={26} r={22} fill="#1f2a6b" />
          <circle cx={34} cy={18} r={9} fill="#fff3b0" />
          <circle cx={38} cy={15} r={8} fill="#1f2a6b" />
          <rect x={12} y={32} width={2} height={2} fill="#fff" />
          <rect x={20} y={14} width={1.5} height={1.5} fill="#fff" />
          <rect x={36} y={36} width={1.5} height={1.5} fill="#fff" />
        </g>
      )
    case 'heartFrame':
      return (
        <g>
          <rect width={40} height={34} fill="#fff" stroke={INK} strokeWidth={1.5} />
          <rect x={4} y={4} width={32} height={26} fill="#ffe3ef" />
          <path d="M13 11h4v2h2v-2h4v6h-2v2h-2v2h-2v-2h-2v-2h-2z" fill="#ff4f79" />
        </g>
      )
    case 'calendar':
      return (
        <g>
          <rect y={3} width={34} height={44} fill="#fff" stroke={INK} strokeWidth={1.5} />
          <rect x={4} y={7} width={26} height={8} fill="#ff7a6b" />
          {[0, 1, 2, 3].map((r) =>
            [0, 1, 2, 3, 4].map((c) => (
              <rect key={`${r}-${c}`} x={4 + c * 5.4} y={19 + r * 6.5} width={3.4} height={3.4} fill="#d9cbb0" />
            )),
          )}
          <rect x={16} width={2} height={5} fill={INK} />
        </g>
      )
    case 'lights':
      return (
        <g>
          <path d="M0 10 Q 34 32 64 14 Q 94 -2 128 18" fill="none" stroke="#1d2045" strokeWidth={1} />
          {[8, 24, 40, 56, 72, 88, 104, 120].map((x, i) => (
            <rect
              key={x}
              x={x - 2}
              y={i < 4 ? 14 + Math.sin(i) * 6 : 8 + Math.cos(i) * 6}
              width={4}
              height={5}
              fill={['#ffd94a', '#ff8fb8', '#8fe6ff', '#b4ff9a'][i % 4]}
            />
          ))}
        </g>
      )
    case 'clock':
      return (
        <g>
          <circle cx={13} cy={13} r={12} fill="#fff" stroke={INK} strokeWidth={1.5} />
          <circle cx={13} cy={13} r={9} fill="none" stroke="#ff8fb8" strokeWidth={1} />
          <rect x={12.3} y={6} width={1.4} height={7.5} fill={INK} />
          <rect x={12.3} y={12.3} width={6} height={1.4} fill={INK} />
        </g>
      )
    case 'shelf':
      return (
        <g>
          <rect x={4} y={6} width={8} height={10} fill="#e07a4f" stroke={INK} strokeWidth={1} />
          <path d="M5 6c0-4 3-6 3-6s3 2 3 6z" fill="#59c26b" stroke={INK} strokeWidth={1} />
          <rect x={18} y={2} width={5} height={14} fill="#ff7a6b" stroke={INK} strokeWidth={1} />
          <rect x={23} y={4} width={5} height={12} fill="#6bc5ff" stroke={INK} strokeWidth={1} />
          <rect x={28} y={1} width={5} height={15} fill="#ffd25e" stroke={INK} strokeWidth={1} />
          <rect x={36} y={9} width={6} height={7} fill="#fff" stroke={INK} strokeWidth={1} />
          <rect y={16} width={46} height={4} fill="#c9935b" stroke={INK} strokeWidth={1} />
          <rect x={6} y={20} width={2} height={4} fill={INK} />
          <rect x={38} y={20} width={2} height={4} fill={INK} />
        </g>
      )
    case 'poster':
      return (
        <g>
          <rect width={30} height={40} fill="#ffd94a" stroke={INK} strokeWidth={1.5} />
          <path d="M15 8l3 7h7l-5.5 4.5 2 7.5L15 22.5 8.5 27l2-7.5L5 15h7z" fill="#fff" stroke={INK} strokeWidth={1} />
          <rect x={6} y={32} width={18} height={2} fill={INK} opacity={0.6} />
        </g>
      )
    case 'mirror':
      return (
        <g>
          <ellipse cx={13} cy={22} rx={13} ry={22} fill="#e0b070" stroke={INK} strokeWidth={1.5} />
          <ellipse cx={13} cy={22} rx={9.5} ry={18} fill="#dff4ff" />
          <rect x={7} y={12} width={2} height={10} fill="#fff" transform="rotate(20 8 17)" />
        </g>
      )
  }
}
