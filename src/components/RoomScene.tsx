import { type CSSProperties, type PointerEvent, type ReactNode, type Ref, useEffect, useId, useRef, useState } from 'react'
import { characterById } from '../art/characters'
import { itemById } from '../art/items'
import { spriteHeight } from '../art/sprite'
import { type ThemeDef, themeById } from '../art/themes'
import {
  CHARACTER_SPOT,
  clampFloor,
  clampTilt,
  project,
  rubberTilt,
  unproject,
  VIEW_H,
  VIEW_W,
  viewDepth,
} from '../lib/iso'
import type { Drop } from '../lib/types'
import { CHARACTER_PX, PixelSprite, ROOM_PX } from './PixelSprite'

// 벽과 바닥은 각자의 평면 좌표(160×115, 160×160)에 그리고, 회전 각도에 맞춘 행렬로 눕힌다
const WALL_W = 160
const WALL_H = 115
const FLOOR_SIDE = 160
const SLAB = 12
const INK = '#2b2233'

// 방의 네 벽 (바닥 좌표 시작 → 끝). 0°에서 0번이 왼쪽 벽, 1번이 오른쪽 벽. 앞으로 오는 벽은 숨긴다
type UV = { u: number; v: number }
const WALLS: { from: UV; to: UV; decor: 'left' | 'right' | null }[] = [
  { from: { u: 0, v: 1 }, to: { u: 0, v: 0 }, decor: 'left' },
  { from: { u: 0, v: 0 }, to: { u: 1, v: 0 }, decor: 'right' },
  { from: { u: 1, v: 0 }, to: { u: 1, v: 1 }, decor: null },
  { from: { u: 1, v: 1 }, to: { u: 0, v: 1 }, decor: null },
]

/** 드래그 1px당 회전 (라디안) */
const DRAG_TURN = 0.005
const TAP_SLOP = 6

export interface Ghost {
  item: string
  u: number
  v: number
}

interface Props {
  theme: string
  character: string
  drops: Drop[]
  ghost?: Ghost | null
  selectedId?: string | null
  freshId?: string | null
  /** 선택된 아이템 위에 띄울 말풍선 내용 */
  bubble?: ReactNode
  rotatable?: boolean
  onFloorTap?: (p: UV) => void
  onDropTap?: (drop: Drop) => void
  onBackgroundTap?: () => void
  svgRef?: Ref<SVGSVGElement>
  className?: string
}

const pts = (list: { x: number; y: number }[]) => list.map((p) => `${p.x},${p.y}`).join(' ')

export function RoomScene({
  theme: themeId,
  character,
  drops,
  ghost,
  selectedId,
  freshId,
  bubble,
  rotatable = false,
  onFloorTap,
  onDropTap,
  onBackgroundTap,
  svgRef,
  className,
}: Props) {
  const theme = themeById(themeId)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [theta, setTheta] = useState(0)
  const thetaRef = useRef(0)
  const press = useRef<{ x: number; y: number; theta: number; dragging: boolean } | null>(null)
  const raf = useRef(0)

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const setAngle = (t: number) => {
    thetaRef.current = t
    setTheta(t)
  }

  // 손을 떼면 한도 안으로 부드럽게 돌아온다
  const settle = (target: number) => {
    cancelAnimationFrame(raf.current)
    const from = thetaRef.current
    const start = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 260)
      const ease = 1 - (1 - k) ** 3
      setAngle(from + (target - from) * ease)
      if (k < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }

  const toView = (e: PointerEvent<SVGSVGElement>) => {
    const ctm = e.currentTarget.getScreenCTM()
    return ctm ? new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()) : null
  }

  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    cancelAnimationFrame(raf.current)
    press.current = { x: e.clientX, y: e.clientY, theta: thetaRef.current, dragging: false }
  }

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const p = press.current
    if (!p || !rotatable) return
    const dx = e.clientX - p.x
    if (!p.dragging && Math.abs(dx) > TAP_SLOP && Math.abs(dx) > Math.abs(e.clientY - p.y)) {
      p.dragging = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    // 오른쪽으로 끌면 방 앞쪽이 손가락을 따라 오른쪽으로 돈다
    if (p.dragging) setAngle(rubberTilt(p.theta - dx * DRAG_TURN))
  }

  const onUp = (e: PointerEvent<SVGSVGElement>) => {
    const p = press.current
    press.current = null
    if (!p) return
    if (p.dragging) {
      settle(clampTilt(thetaRef.current))
      return
    }
    // 드래그가 아니면 탭: 놓기 모드면 자리 정하기, 아니면 아이템/빈 곳 누르기
    if (onFloorTap) {
      const v = toView(e)
      if (v) onFloorTap(clampFloor(unproject(v.x, v.y, thetaRef.current)))
      return
    }
    const hit = (e.target as Element).closest('[data-drop]')
    const drop = hit && drops.find((d) => d.id === hit.getAttribute('data-drop'))
    if (drop) onDropTap?.(drop)
    else onBackgroundTap?.()
  }

  // ─── 방 뼈대 ───
  const floorO = project({ u: 0, v: 0 }, theta)
  const floorU = project({ u: 1, v: 0 }, theta)
  const floorV = project({ u: 0, v: 1 }, theta)
  const floorUV = project({ u: 1, v: 1 }, theta)
  const floorMatrix = `matrix(${(floorU.x - floorO.x) / FLOOR_SIDE} ${(floorU.y - floorO.y) / FLOOR_SIDE} ${(floorV.x - floorO.x) / FLOOR_SIDE} ${(floorV.y - floorO.y) / FLOOR_SIDE} ${floorO.x} ${floorO.y})`

  const edges = WALLS.map((w) => {
    const a = project(w.from, theta)
    const b = project(w.to, theta)
    const mid = { u: (w.from.u + w.to.u) / 2, v: (w.from.v + w.to.v) / 2 }
    // 오른쪽 위로 올라가는 면은 밝게, 내려가는 면은 어둡게
    const rising = (b.y - a.y) * (b.x - a.x) <= 0
    return { ...w, a, b, depth: viewDepth(mid, theta), rising }
  })
  const backWalls = edges.filter((e) => e.depth < 1 - 1e-6).sort((p, q) => p.depth - q.depth)
  const frontEdges = edges.filter((e) => e.depth >= 1 - 1e-6)

  // ─── 방 안의 것들 ───
  type Thing = { key: string; depth: number; node: ReactNode }
  const things: Thing[] = []
  let bubbleAt: { x: number; y: number } | null = null

  for (const d of drops) {
    const item = itemById(d.item)
    if (!item) continue
    const p = project(d, theta)
    const cls = ['drop', d.id === selectedId && 'is-selected', d.id === freshId && 'is-fresh'].filter(Boolean).join(' ')
    if (d.id === selectedId) bubbleAt = { x: p.x, y: p.y - spriteHeight(item.sprite) * ROOM_PX - 6 }
    things.push({
      key: d.id,
      depth: viewDepth(d, theta),
      node: (
        <g className={cls} data-drop={d.id}>
          <ellipse cx={p.x} cy={p.y} rx={11} ry={4} fill="rgba(30,20,40,0.16)" />
          <g className="drop-body">
            <PixelSprite sprite={item.sprite} x={p.x} y={p.y + 1} />
          </g>
        </g>
      ),
    })
  }

  const me = project(CHARACTER_SPOT, theta)
  things.push({
    key: 'me',
    depth: viewDepth(CHARACTER_SPOT, theta),
    node: (
      <g className="minime">
        <ellipse cx={me.x} cy={me.y} rx={12} ry={4} fill="rgba(30,20,40,0.18)" />
        <g className="minime-body">
          <PixelSprite sprite={characterById(character).sprite} x={me.x} y={me.y + 1} px={CHARACTER_PX} />
        </g>
      </g>
    ),
  })

  if (ghost) {
    const item = itemById(ghost.item)
    const p = project(ghost, theta)
    if (item) {
      things.push({
        key: 'ghost',
        depth: viewDepth(ghost, theta),
        node: (
          <g className="ghost">
            <ellipse cx={p.x} cy={p.y} rx={13} ry={5} fill="none" stroke="#ff7f2a" strokeWidth={1.5} strokeDasharray="3 2" />
            <PixelSprite sprite={item.sprite} x={p.x} y={p.y + 1} />
          </g>
        ),
      })
    }
  }

  things.sort((a, b) => a.depth - b.depth)

  const interactive = rotatable || onFloorTap || onDropTap || onBackgroundTap
  const bubbleStyle = bubbleAt && bubblePosition(bubbleAt)

  return (
    <div className={`room-stage ${className ?? ''}`}>
      <svg
        ref={svgRef}
        className="room"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        xmlns="http://www.w3.org/2000/svg"
        shapeRendering="crispEdges"
        onPointerDown={interactive ? onDown : undefined}
        onPointerMove={interactive ? onMove : undefined}
        onPointerUp={interactive ? onUp : undefined}
        onPointerCancel={() => (press.current = null)}
        style={{
          cursor: onFloorTap ? 'crosshair' : rotatable ? 'grab' : undefined,
          touchAction: rotatable || onFloorTap ? 'pan-y' : undefined,
        }}
        role="img"
        aria-label={`${theme.name} 미니룸`}
      >
        <defs>
          <WallPattern id={`${uid}-wall`} theme={theme} />
          <FloorPattern id={`${uid}-floor`} theme={theme} />
        </defs>

        {/* 바닥 두께 (앞쪽 모서리) */}
        {frontEdges.map((e, i) => (
          <polygon
            key={i}
            points={pts([e.a, e.b, { x: e.b.x, y: e.b.y + SLAB }, { x: e.a.x, y: e.a.y + SLAB }])}
            fill={e.rising ? theme.slab : theme.slabDark}
            stroke={INK}
            strokeWidth={1.5}
            strokeLinejoin="round"
            shapeRendering="geometricPrecision"
          />
        ))}

        {backWalls.map((w) => {
          const m = `matrix(${(w.b.x - w.a.x) / WALL_W} ${(w.b.y - w.a.y) / WALL_W} 0 1 ${w.a.x} ${w.a.y - WALL_H})`
          return (
            <g key={`${w.from.u}${w.from.v}${w.to.u}${w.to.v}`}>
              <g transform={m}>
                <rect width={WALL_W} height={WALL_H} fill={w.rising ? theme.wallL : theme.wallR} />
                <rect width={WALL_W} height={WALL_H} fill={`url(#${uid}-wall)`} />
                <g transform="translate(0 14)">
                  {w.decor === 'left' && <LeftDecor theme={theme} />}
                  {w.decor === 'right' && <RightDecor theme={theme} />}
                </g>
                <rect y={WALL_H - 8} width={WALL_W} height={8} fill="rgba(0,0,0,0.08)" />
              </g>
              <polygon
                points={pts([w.a, w.b, { x: w.b.x, y: w.b.y - WALL_H }, { x: w.a.x, y: w.a.y - WALL_H }])}
                fill="none"
                stroke={INK}
                strokeWidth={1.5}
                strokeLinejoin="round"
                shapeRendering="geometricPrecision"
              />
            </g>
          )
        })}

        <g transform={floorMatrix}>
          <rect width={FLOOR_SIDE} height={FLOOR_SIDE} fill={theme.floorA} />
          <rect width={FLOOR_SIDE} height={FLOOR_SIDE} fill={`url(#${uid}-floor)`} />
          {theme.floorPattern === 'rug' && <Rug theme={theme} />}
        </g>
        <polygon
          points={pts([floorO, floorU, floorUV, floorV])}
          fill="none"
          stroke={INK}
          strokeWidth={1.5}
          strokeLinejoin="round"
          shapeRendering="geometricPrecision"
        />

        {things.map((t) => (
          <g key={t.key}>{t.node}</g>
        ))}
      </svg>

      {bubble && bubbleStyle && (
        <div className="bubble" style={bubbleStyle} onPointerDown={(e) => e.stopPropagation()}>
          {bubble}
        </div>
      )}

    </div>
  )
}

/** 말풍선은 방 밖으로 나가지 않게 가운데 쪽으로 당기고, 꼬리는 아이템을 가리키게 둔다 */
function bubblePosition(at: { x: number; y: number }): CSSProperties {
  const left = (at.x / VIEW_W) * 100
  const clamped = Math.min(76, Math.max(24, left))
  return {
    left: `${clamped}%`,
    top: `${(Math.max(at.y, 40) / VIEW_H) * 100}%`,
    ['--tail' as string]: `${left - clamped}cqw`,
  }
}

function WallPattern({ id, theme }: { id: string; theme: ThemeDef }) {
  const c = theme.wallMark
  if (theme.wallPattern === 'stripes') {
    return (
      <pattern id={id} width={14} height={WALL_H} patternUnits="userSpaceOnUse">
        <rect width={5} height={WALL_H} fill={c} opacity={0.6} />
      </pattern>
    )
  }
  if (theme.wallPattern === 'stars') {
    return (
      <pattern id={id} width={36} height={30} patternUnits="userSpaceOnUse">
        <rect x={6} y={6} width={1.5} height={1.5} fill={c} />
        <rect x={24} y={18} width={1} height={1} fill={c} opacity={0.7} />
        <path d="M18 3h1v2h2v1h-2v2h-1V6h-2V5h2z" fill={c} opacity={0.85} />
        <rect x={31} y={9} width={1} height={1} fill="#fff" opacity={0.6} />
      </pattern>
    )
  }
  // 하트
  return (
    <pattern id={id} width={24} height={22} patternUnits="userSpaceOnUse">
      <path d="M4 4h2v1h1V4h2v3H8v1H7v1H6V8H5V7H4z" fill={c} opacity={0.55} />
      <path d="M16 15h2v1h1v-1h2v3h-1v1h-1v1h-1v-1h-1v-1h-1z" fill={c} opacity={0.35} />
    </pattern>
  )
}

function FloorPattern({ id, theme }: { id: string; theme: ThemeDef }) {
  if (theme.floorPattern === 'planks') {
    return (
      <pattern id={id} width={FLOOR_SIDE} height={14} patternUnits="userSpaceOnUse">
        <rect y={13} width={FLOOR_SIDE} height={1} fill={theme.floorB} />
        <rect x={38} width={1} height={13} fill={theme.floorB} />
        <rect x={102} width={1} height={13} fill={theme.floorB} />
      </pattern>
    )
  }
  if (theme.floorPattern === 'rug') {
    return (
      <pattern id={id} width={10} height={10} patternUnits="userSpaceOnUse">
        <rect x={2} y={2} width={1} height={1} fill="#ffffff" opacity={0.12} />
      </pattern>
    )
  }
  return (
    <pattern id={id} width={28} height={28} patternUnits="userSpaceOnUse">
      <rect width={14} height={14} fill={theme.floorB} />
      <rect x={14} y={14} width={14} height={14} fill={theme.floorB} />
    </pattern>
  )
}

function Rug({ theme }: { theme: ThemeDef }) {
  return (
    <g>
      <rect x={30} y={30} width={100} height={100} rx={10} fill={theme.floorB} />
      <rect x={38} y={38} width={84} height={84} rx={6} fill="none" stroke="#fff3b0" strokeWidth={2} strokeDasharray="4 3" />
    </g>
  )
}

/** 왼쪽 벽 장식: 액자·포스터·전구줄 */
function LeftDecor({ theme }: { theme: ThemeDef }) {
  if (theme.id === 'studio') {
    return (
      <g>
        <rect x={34} y={26} width={34} height={44} fill="#fff" stroke="#2b2233" strokeWidth={1.5} />
        <rect x={38} y={30} width={26} height={8} fill="#ff7a6b" />
        {[0, 1, 2, 3].map((r) =>
          [0, 1, 2, 3, 4].map((c) => (
            <rect key={`${r}-${c}`} x={38 + c * 5.4} y={42 + r * 6.5} width={3.4} height={3.4} fill="#d9cbb0" />
          )),
        )}
        <rect x={50} y={23} width={2} height={5} fill="#2b2233" />
      </g>
    )
  }
  if (theme.id === 'night') {
    return (
      <g>
        <path d="M6 18 Q 40 40 70 22 Q 100 6 134 26" fill="none" stroke="#1d2045" strokeWidth={1} />
        {[14, 30, 46, 62, 78, 94, 110, 126].map((x, i) => (
          <rect
            key={x}
            x={x - 2}
            y={i < 4 ? 22 + Math.sin(i) * 6 : 16 + Math.cos(i) * 6}
            width={4}
            height={5}
            fill={['#ffd94a', '#ff8fb8', '#8fe6ff', '#b4ff9a'][i % 4]}
          />
        ))}
      </g>
    )
  }
  return (
    <g>
      <rect x={40} y={28} width={40} height={34} fill="#fff" stroke="#2b2233" strokeWidth={1.5} />
      <rect x={44} y={32} width={32} height={26} fill="#ffe3ef" />
      <path d="M53 39h4v2h2v-2h4v6h-2v2h-2v2h-2v-2h-2v-2h-2z" fill="#ff4f79" />
    </g>
  )
}

/** 오른쪽 벽 장식: 창문 */
function RightDecor({ theme }: { theme: ThemeDef }) {
  if (theme.id === 'night') {
    return (
      <g>
        <circle cx={78} cy={52} r={26} fill="#151838" stroke="#2b2233" strokeWidth={1.5} />
        <circle cx={78} cy={52} r={22} fill="#1f2a6b" />
        <circle cx={86} cy={44} r={9} fill="#fff3b0" />
        <circle cx={90} cy={41} r={8} fill="#1f2a6b" />
        <rect x={64} y={58} width={2} height={2} fill="#fff" />
        <rect x={72} y={40} width={1.5} height={1.5} fill="#fff" />
        <rect x={88} y={62} width={1.5} height={1.5} fill="#fff" />
      </g>
    )
  }
  const sky = theme.id === 'studio' ? '#bfe6ff' : '#a9dcff'
  return (
    <g>
      <rect x={46} y={24} width={58} height={50} fill="#fff" stroke="#2b2233" strokeWidth={1.5} />
      <rect x={50} y={28} width={50} height={42} fill={sky} />
      {theme.id === 'studio' ? (
        <circle cx={88} cy={40} r={7} fill="#ffd94a" />
      ) : (
        <>
          <path d="M56 42h4v-2h6v-2h6v2h2v2h4v2h2v4H56z" fill="#fff" />
          <path d="M84 58h2v-2h6v2h2v2h-10z" fill="#fff" />
        </>
      )}
      <rect x={74} y={28} width={2} height={42} fill="#fff" />
      <rect x={50} y={48} width={50} height={2} fill="#fff" />
      <rect x={42} y={74} width={66} height={4} fill={theme.id === 'studio' ? '#c9935b' : '#ff9cc0'} stroke="#2b2233" strokeWidth={1} />
    </g>
  )
}
