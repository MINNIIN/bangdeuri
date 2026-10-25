import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { characterById } from '../art/characters'
import { type Decor, FLOOR_SIDE, WALL_H, WALL_W } from '../art/decor'
import { itemById } from '../art/items'
import { spriteHeight } from '../art/sprite'
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
import { FloorSurface, slabColors, WallSurface } from './Surfaces'

const SLAB = 12
const INK = '#2b2233'

// 방의 네 벽 (바닥 좌표 시작 → 끝). 0번이 왼쪽 벽, 1번이 오른쪽 벽이고 이 둘만 꾸민다.
// 방은 ±30°만 돌아서 2·3번 벽은 늘 앞쪽이라 그리지 않는다
type UV = { u: number; v: number }
const WALLS: { from: UV; to: UV }[] = [
  { from: { u: 0, v: 1 }, to: { u: 0, v: 0 } },
  { from: { u: 0, v: 0 }, to: { u: 1, v: 0 } },
  { from: { u: 1, v: 0 }, to: { u: 1, v: 1 } },
  { from: { u: 1, v: 1 }, to: { u: 0, v: 1 } },
]

/** 드래그 1px당 회전 (라디안) */
const DRAG_TURN = 0.005
const TAP_SLOP = 6
/** 미니미 걷는 속도 (바닥 한 변 = 1, 초당) */
const WALK_SPEED = 0.45
const WALK_MIN = 0.08
const WALK_MAX = 0.92

export interface Ghost {
  item: string
  u: number
  v: number
}

interface Props {
  decor: Decor
  character: string
  drops: Drop[]
  ghost?: Ghost | null
  selectedId?: string | null
  freshId?: string | null
  /** 선택된 아이템 위에 띄울 말풍선 내용 */
  bubble?: ReactNode
  rotatable?: boolean
  /** 빈 바닥을 누르거나 우클릭하면 미니미가 걸어간다 */
  walkable?: boolean
  onFloorTap?: (p: UV) => void
  onDropTap?: (drop: Drop) => void
  onBackgroundTap?: () => void
  svgRef?: Ref<SVGSVGElement>
  className?: string
  label?: string
}

const pts = (list: { x: number; y: number }[]) => list.map((p) => `${p.x},${p.y}`).join(' ')
const onFloorArea = (p: UV) => p.u > -0.04 && p.u < 1.04 && p.v > -0.04 && p.v < 1.04
const clampWalk = (n: number) => Math.min(WALK_MAX, Math.max(WALK_MIN, n))

export function RoomScene({
  decor,
  character,
  drops,
  ghost,
  selectedId,
  freshId,
  bubble,
  rotatable = false,
  walkable = false,
  onFloorTap,
  onDropTap,
  onBackgroundTap,
  svgRef,
  className,
  label = '미니룸',
}: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [theta, setTheta] = useState(0)
  const thetaRef = useRef(0)
  const press = useRef<{ x: number; y: number; theta: number; dragging: boolean } | null>(null)
  const raf = useRef(0)

  const [me, setMe] = useState<UV>(CHARACTER_SPOT)
  const meRef = useRef<UV>(CHARACTER_SPOT)
  const [facing, setFacing] = useState<1 | -1>(1)
  const [walking, setWalking] = useState(false)
  const walkRaf = useRef(0)
  // 이동하려고 누른 자리에 잠깐 뜨는 표시 (게임의 이동 클릭 효과처럼)
  const [marker, setMarker] = useState<(UV & { key: number }) | null>(null)
  const markerTimer = useRef(0)

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current)
      cancelAnimationFrame(walkRaf.current)
      window.clearTimeout(markerTimer.current)
    },
    [],
  )

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

  const walkTo = (target: UV) => {
    cancelAnimationFrame(walkRaf.current)
    const from = meRef.current
    const to = { u: clampWalk(target.u), v: clampWalk(target.v) }
    window.clearTimeout(markerTimer.current)
    setMarker({ ...to, key: performance.now() })
    markerTimer.current = window.setTimeout(() => setMarker(null), 650)
    const dist = Math.hypot(to.u - from.u, to.v - from.v)
    if (dist < 0.01) return
    const a = project(from, thetaRef.current)
    const b = project(to, thetaRef.current)
    if (Math.abs(b.x - a.x) > 1) setFacing(b.x < a.x ? -1 : 1)
    setWalking(true)
    const duration = (dist / WALK_SPEED) * 1000
    const start = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / duration)
      const p = { u: from.u + (to.u - from.u) * k, v: from.v + (to.v - from.v) * k }
      meRef.current = p
      setMe(p)
      if (k < 1) walkRaf.current = requestAnimationFrame(step)
      else setWalking(false)
    }
    walkRaf.current = requestAnimationFrame(step)
  }

  const toFloorPoint = (e: { clientX: number; clientY: number; currentTarget: SVGSVGElement }) => {
    const ctm = e.currentTarget.getScreenCTM()
    if (!ctm) return null
    const v = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return unproject(v.x, v.y, thetaRef.current)
  }

  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    // 우클릭은 아래 contextmenu에서 처리한다
    if (e.button === 2) return
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
    // 드래그가 아니면 탭: 놓기 모드면 자리 정하기, 아니면 아이템 → 말풍선, 빈 바닥 → 미니미 이동
    const point = toFloorPoint(e)
    if (onFloorTap) {
      if (point) onFloorTap(clampFloor(point))
      return
    }
    const hit = (e.target as Element).closest('[data-drop]')
    const drop = hit && drops.find((d) => d.id === hit.getAttribute('data-drop'))
    if (drop) {
      onDropTap?.(drop)
      return
    }
    onBackgroundTap?.()
    if (walkable && point && onFloorArea(point)) walkTo(point)
  }

  // PC: 우클릭으로도 미니미를 옮긴다
  const onContextMenu = (e: MouseEvent<SVGSVGElement>) => {
    if (!walkable || onFloorTap) return
    e.preventDefault()
    const point = toFloorPoint(e)
    if (point && onFloorArea(point)) walkTo(point)
  }

  // ─── 방 뼈대 ───
  const floorO = project({ u: 0, v: 0 }, theta)
  const floorU = project({ u: 1, v: 0 }, theta)
  const floorV = project({ u: 0, v: 1 }, theta)
  const floorUV = project({ u: 1, v: 1 }, theta)
  const floorMatrix = `matrix(${(floorU.x - floorO.x) / FLOOR_SIDE} ${(floorU.y - floorO.y) / FLOOR_SIDE} ${(floorV.x - floorO.x) / FLOOR_SIDE} ${(floorV.y - floorO.y) / FLOOR_SIDE} ${floorO.x} ${floorO.y})`
  const [slabLight, slabDark] = slabColors(decor.floor)

  const edges = WALLS.map((w, index) => {
    const a = project(w.from, theta)
    const b = project(w.to, theta)
    const mid = { u: (w.from.u + w.to.u) / 2, v: (w.from.v + w.to.v) / 2 }
    // 오른쪽 위로 올라가는 면은 밝게, 내려가는 면은 조금 어둡게
    const rising = (b.y - a.y) * (b.x - a.x) <= 0
    return { index, a, b, depth: viewDepth(mid, theta), rising }
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

  const mp = project(me, theta)
  things.push({
    key: 'me',
    depth: viewDepth(me, theta),
    node: (
      <g className={`minime ${walking ? 'is-walking' : ''}`}>
        <ellipse cx={mp.x} cy={mp.y} rx={12} ry={4} fill="rgba(30,20,40,0.18)" />
        <g className="minime-body">
          <g transform={facing === -1 ? `translate(${mp.x * 2} 0) scale(-1 1)` : undefined}>
            <PixelSprite sprite={characterById(character).sprite} x={mp.x} y={mp.y + 1} px={CHARACTER_PX} />
          </g>
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

  const interactive = rotatable || walkable || onFloorTap || onDropTap || onBackgroundTap
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
        onContextMenu={walkable ? onContextMenu : undefined}
        style={{
          cursor: onFloorTap ? 'crosshair' : rotatable ? 'grab' : undefined,
          touchAction: rotatable || onFloorTap ? 'pan-y' : undefined,
        }}
        role="img"
        aria-label={label}
      >
        {/* 바닥 두께 (앞쪽 모서리) */}
        {frontEdges.map((e) => (
          <polygon
            key={e.index}
            points={pts([e.a, e.b, { x: e.b.x, y: e.b.y + SLAB }, { x: e.a.x, y: e.a.y + SLAB }])}
            fill={e.rising ? slabLight : slabDark}
            stroke={INK}
            strokeWidth={1.5}
            strokeLinejoin="round"
            shapeRendering="geometricPrecision"
          />
        ))}

        {backWalls.map((w) => {
          const m = `matrix(${(w.b.x - w.a.x) / WALL_W} ${(w.b.y - w.a.y) / WALL_W} 0 1 ${w.a.x} ${w.a.y - WALL_H})`
          const wall = decor.walls[w.index] ?? decor.walls[0]
          return (
            <g key={w.index}>
              <g transform={m}>
                <WallSurface id={`${uid}-w${w.index}`} wall={wall} dim={w.rising ? 0 : 0.06} />
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
          <FloorSurface id={`${uid}-floor`} floor={decor.floor} />
        </g>
        <polygon
          points={pts([floorO, floorU, floorUV, floorV])}
          fill="none"
          stroke={INK}
          strokeWidth={1.5}
          strokeLinejoin="round"
          shapeRendering="geometricPrecision"
        />

        {marker && <WalkMarker key={marker.key} at={project(marker, theta)} />}

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

/** 바닥에 눕힌 링 두 개가 오므라들며 사라진다 */
function WalkMarker({ at }: { at: { x: number; y: number } }) {
  return (
    <g className="walk-marker" transform={`translate(${at.x} ${at.y})`} shapeRendering="geometricPrecision">
      <ellipse className="walk-ring" rx={12} ry={6} fill="none" stroke="#ff7f2a" strokeWidth={1.6} />
      <ellipse className="walk-ring late" rx={12} ry={6} fill="none" stroke="#fff3b0" strokeWidth={1.2} />
      <ellipse className="walk-dot" rx={2.4} ry={1.2} fill="#ff7f2a" />
    </g>
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
