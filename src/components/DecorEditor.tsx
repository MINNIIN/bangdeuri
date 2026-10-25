import { type PointerEvent, useId, useRef, useState } from 'react'
import {
  ART_COLS,
  ART_PX,
  ART_ROWS,
  type Decor,
  DRAW_COLORS,
  emptyArt,
  FLOOR_COLORS,
  paintLine,
  FLOOR_PATTERNS,
  MAX_STICKERS,
  stickerById,
  STICKERS,
  type StickerId,
  WALL_COLORS,
  WALL_H,
  WALL_PATTERNS,
  WALL_W,
  type WallDecor,
} from '../art/decor'
import type { Drop } from '../lib/types'
import { RoomScene } from './RoomScene'
import { FloorSurface, Sticker, WallSurface } from './Surfaces'

type Tab = 'wallpaper' | 'draw' | 'stickers' | 'floor'
type Cell = { col: number; row: number }
type WallTarget = 0 | 1

const TABS: { id: Tab; name: string }[] = [
  { id: 'wallpaper', name: '벽지' },
  { id: 'draw', name: '그림' },
  { id: 'stickers', name: '장식' },
  { id: 'floor', name: '바닥' },
]
const ERASER = '.'
const UNDO_LIMIT = 30

interface Props {
  initial: Decor
  character: string
  drops: Drop[]
  busy: boolean
  onSave: (decor: Decor) => void
  onCancel: () => void
}

/** 방 주인의 꾸미기 툴: 벽지·색, 벽에 도트 그림, 벽 장식 붙이기, 바닥 */
export function DecorEditor({ initial, character, drops, busy, onSave, onCancel }: Props) {
  const [decor, setDecor] = useState<Decor>(initial)
  const [tab, setTab] = useState<Tab>('wallpaper')
  const [target, setTarget] = useState<WallTarget>(0)
  const [bothWalls, setBothWalls] = useState(true)
  const [pen, setPen] = useState('a')
  const [brush, setBrush] = useState(1)
  const [selectedSticker, setSelectedSticker] = useState<number | null>(null)
  const undo = useRef<Decor[]>([])
  const [, force] = useState(0)

  const remember = () => {
    undo.current = [...undo.current.slice(-(UNDO_LIMIT - 1)), decor]
    force((n) => n + 1)
  }

  const undoLast = () => {
    const prev = undo.current.pop()
    if (prev) setDecor(prev)
    force((n) => n + 1)
  }

  const updateWalls = (fn: (w: WallDecor) => WallDecor, which: WallTarget[] = [target]) =>
    setDecor((d) => {
      const walls = [...d.walls] as Decor['walls']
      for (const i of which) walls[i] = fn(walls[i])
      return { ...d, walls }
    })

  const wallTargets: WallTarget[] = bothWalls ? [0, 1] : [target]
  const wall = decor.walls[target]

  return (
    <main className="screen decor-editor">
      <nav className="topbar">
        <button className="btn-ghost" onClick={onCancel} aria-label="꾸미기 그만두기">
          ✕
        </button>
        <span className="topbar-title">방 꾸미기</span>
        <button className="btn-ghost undo" onClick={undoLast} disabled={!undo.current.length} aria-label="되돌리기">
          ↶
        </button>
      </nav>

      <section className="window">
        <RoomScene decor={decor} character={character} drops={drops} rotatable className="decor-preview" />
      </section>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'is-on' : ''}`}
            onClick={() => {
              setTab(t.id)
              setSelectedSticker(null)
              // 그림·장식은 한 벽씩 작업한다
              if (t.id !== 'wallpaper') setBothWalls(false)
            }}
          >
            {t.name}
          </button>
        ))}
      </div>

      {tab !== 'floor' && (
        <div className="wall-pick">
          <Seg on={!bothWalls && target === 0} onClick={() => (setBothWalls(false), setTarget(0))}>
            왼쪽 벽
          </Seg>
          <Seg on={!bothWalls && target === 1} onClick={() => (setBothWalls(false), setTarget(1))}>
            오른쪽 벽
          </Seg>
          {tab === 'wallpaper' && (
            <Seg on={bothWalls} onClick={() => setBothWalls(true)}>
              양쪽 다
            </Seg>
          )}
        </div>
      )}

      {tab === 'wallpaper' && (
        <div className="panel">
          <p className="panel-label">무늬</p>
          <div className="swatches">
            {WALL_PATTERNS.map((p) => (
              <button
                key={p.id}
                className={`swatch-card ${wallTargets.every((i) => decor.walls[i].pattern === p.id) ? 'is-on' : ''}`}
                onClick={() => {
                  remember()
                  updateWalls((w) => ({ ...w, pattern: p.id }), wallTargets)
                }}
              >
                <MiniWall wall={{ ...decor.walls[wallTargets[0]], pattern: p.id, art: emptyArt(), stickers: [] }} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
          <p className="panel-label">색</p>
          <Colors
            colors={WALL_COLORS}
            value={wallTargets.every((i) => decor.walls[i].color === decor.walls[wallTargets[0]].color) ? decor.walls[wallTargets[0]].color : ''}
            onPick={(c) => {
              remember()
              updateWalls((w) => ({ ...w, color: c }), wallTargets)
            }}
          />
        </div>
      )}

      {tab === 'draw' && (
        <div className="panel">
          <PaintWall
            wall={wall}
            pen={pen}
            onStart={remember}
            onPaint={(from, to) =>
              updateWalls((w) => ({ ...w, art: paintLine(w.art, from.col, from.row, to.col, to.row, pen, brush) }))
            }
          />
          <div className="pens">
            {Object.entries(DRAW_COLORS).map(([ch, color]) => (
              <button
                key={ch}
                className={`pen ${pen === ch ? 'is-on' : ''}`}
                style={{ background: color }}
                onClick={() => setPen(ch)}
                aria-label={`색 ${color}`}
              />
            ))}
            <button className={`pen eraser ${pen === ERASER ? 'is-on' : ''}`} onClick={() => setPen(ERASER)} aria-label="지우개">
              <EraserIcon />
            </button>
          </div>
          <div className="wall-pick">
            <Seg on={brush === 1} onClick={() => setBrush(1)}>
              가늘게
            </Seg>
            <Seg on={brush === 2} onClick={() => setBrush(2)}>
              굵게
            </Seg>
          </div>
          <button
            className="link"
            onClick={() => {
              remember()
              updateWalls((w) => ({ ...w, art: emptyArt() }))
            }}
          >
            이 벽 그림 전부 지우기
          </button>
        </div>
      )}

      {tab === 'stickers' && (
        <div className="panel">
          <StickerWall
            wall={wall}
            selected={selectedSticker}
            onSelect={setSelectedSticker}
            onStart={remember}
            onMove={(index, x, y) =>
              updateWalls((w) => ({
                ...w,
                stickers: w.stickers.map((s, i) => (i === index ? { ...s, x, y } : s)),
              }))
            }
          />
          {selectedSticker !== null && wall.stickers[selectedSticker] ? (
            <div className="sticker-actions">
              <span>{stickerById(wall.stickers[selectedSticker].id)?.name} · 끌어서 옮기기</span>
              <button
                className="btn btn-small btn-danger"
                onClick={() => {
                  remember()
                  updateWalls((w) => ({ ...w, stickers: w.stickers.filter((_, i) => i !== selectedSticker) }))
                  setSelectedSticker(null)
                }}
              >
                떼기
              </button>
            </div>
          ) : (
            <p className="muted panel-tip">
              장식을 고르면 벽에 붙어요. 벽 위에서 끌어 옮기고, 누르면 뗄 수 있어요 (벽마다 {MAX_STICKERS}개)
            </p>
          )}
          <div className="swatches">
            {STICKERS.map((s) => (
              <button
                key={s.id}
                className="swatch-card"
                disabled={wall.stickers.length >= MAX_STICKERS}
                onClick={() => {
                  remember()
                  const placed = { id: s.id as StickerId, x: Math.round((WALL_W - s.w) / 2), y: Math.round((WALL_H - 8 - s.h) / 2) }
                  updateWalls((w) => ({ ...w, stickers: [...w.stickers, placed] }))
                  setSelectedSticker(wall.stickers.length)
                }}
              >
                <svg viewBox={`-2 -2 ${s.w + 4} ${s.h + 4}`} className="sticker-icon" aria-hidden>
                  <Sticker id={s.id} />
                </svg>
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'floor' && (
        <div className="panel">
          <p className="panel-label">무늬</p>
          <div className="swatches">
            {FLOOR_PATTERNS.map((p) => (
              <button
                key={p.id}
                className={`swatch-card ${decor.floor.pattern === p.id ? 'is-on' : ''}`}
                onClick={() => {
                  remember()
                  setDecor((d) => ({ ...d, floor: { ...d.floor, pattern: p.id } }))
                }}
              >
                <MiniFloor floor={{ ...decor.floor, pattern: p.id }} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
          <p className="panel-label">색</p>
          <Colors
            colors={FLOOR_COLORS}
            value={decor.floor.color}
            onPick={(c) => {
              remember()
              setDecor((d) => ({ ...d, floor: { ...d.floor, color: c } }))
            }}
          />
        </div>
      )}

      <div className="actions sticky row">
        <button className="btn" onClick={onCancel}>
          취소
        </button>
        <button className="btn btn-primary" onClick={() => onSave(decor)} disabled={busy}>
          {busy ? '저장하는 중…' : '저장하기'}
        </button>
      </div>
    </main>
  )
}

/** 지우개 아이콘 (비스듬히 놓인 분홍·흰 지우개) */
function EraserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <g transform="rotate(-40 12 12)">
        <rect x={3} y={8} width={18} height={9} rx={2} fill="#fff" stroke="#2b2233" strokeWidth={1.8} />
        <rect x={3} y={8} width={7} height={9} rx={2} fill="#ff8fb8" stroke="#2b2233" strokeWidth={1.8} />
      </g>
      <path d="M5 21h14" stroke="#2b2233" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  )
}

function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button className={`seg ${on ? 'is-on' : ''}`} onClick={onClick} aria-pressed={on}>
      {children}
    </button>
  )
}

function Colors({ colors, value, onPick }: { colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="colors">
      {colors.map((c) => (
        <button
          key={c}
          className={`color ${value === c ? 'is-on' : ''}`}
          style={{ background: c }}
          onClick={() => onPick(c)}
          aria-label={`색 ${c}`}
        />
      ))}
    </div>
  )
}

function MiniWall({ wall }: { wall: WallDecor }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return (
    <svg viewBox="0 0 40 28" className="mini" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <WallSurface id={id} wall={wall} />
    </svg>
  )
}

function MiniFloor({ floor }: { floor: Decor['floor'] }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return (
    <svg viewBox="0 0 56 40" className="mini" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <FloorSurface id={id} floor={floor} />
    </svg>
  )
}

/** 벽을 정면으로 펴서 도트 그림을 그린다. 누른 채로 끌면 이어서 칠해진다 */
function PaintWall({
  wall,
  pen,
  onStart,
  onPaint,
}: {
  wall: WallDecor
  pen: string
  onStart: () => void
  onPaint: (from: Cell, to: Cell) => void
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  // 직전에 칠한 칸. 다음 칸까지 선으로 이어 칠한다
  const last = useRef<Cell | null>(null)

  const cellAt = (e: PointerEvent<SVGSVGElement>): Cell | null => {
    const ctm = e.currentTarget.getScreenCTM()
    if (!ctm) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { col: Math.floor(p.x / ART_PX), row: Math.floor(p.y / ART_PX) }
  }

  const paintTo = (e: PointerEvent<SVGSVGElement>) => {
    const cell = cellAt(e)
    if (!cell) return
    onPaint(last.current ?? cell, cell)
    last.current = cell
  }

  return (
    <svg
      className={`flat-wall paint ${pen === ERASER ? 'is-erasing' : ''}`}
      viewBox={`0 0 ${WALL_W} ${WALL_H}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        onStart()
        last.current = null
        paintTo(e)
      }}
      onPointerMove={(e) => last.current && paintTo(e)}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}
      shapeRendering="crispEdges"
    >
      <WallSurface id={id} wall={wall} />
      <g className="grid" aria-hidden>
        {Array.from({ length: ART_COLS + 1 }, (_, i) => (
          <rect key={`c${i}`} x={i * ART_PX} width={0.15} height={ART_ROWS * ART_PX} />
        ))}
        {Array.from({ length: ART_ROWS + 1 }, (_, i) => (
          <rect key={`r${i}`} y={i * ART_PX} width={WALL_W} height={0.15} />
        ))}
      </g>
    </svg>
  )
}

/** 벽을 정면으로 펴서 장식을 끌어 옮긴다 */
function StickerWall({
  wall,
  selected,
  onSelect,
  onStart,
  onMove,
}: {
  wall: WallDecor
  selected: number | null
  onSelect: (i: number | null) => void
  onStart: () => void
  onMove: (index: number, x: number, y: number) => void
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const drag = useRef<{ index: number; dx: number; dy: number; moved: boolean } | null>(null)

  const toWall = (e: PointerEvent<SVGElement>) => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGSVGElement)
    const ctm = svg.getScreenCTM()
    return ctm ? new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()) : null
  }

  return (
    <svg
      className="flat-wall"
      viewBox={`0 0 ${WALL_W} ${WALL_H}`}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const p = toWall(e)
        const s = wall.stickers[d.index]
        const def = s && stickerById(s.id)
        if (!p || !def) return
        if (!d.moved) {
          d.moved = true
          onStart()
        }
        const x = Math.round(Math.min(WALL_W - def.w, Math.max(0, p.x - d.dx)))
        const y = Math.round(Math.min(WALL_H - def.h, Math.max(0, p.y - d.dy)))
        onMove(d.index, x, y)
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onPointerDown={() => onSelect(null)}
      style={{ touchAction: 'none' }}
    >
      <WallSurface id={id} wall={{ ...wall, stickers: [] }} />
      {wall.stickers.map((s, i) => {
        const def = stickerById(s.id)
        if (!def) return null
        return (
          <g
            key={i}
            transform={`translate(${s.x} ${s.y})`}
            className="placed-sticker"
            onPointerDown={(e) => {
              e.stopPropagation()
              const p = toWall(e)
              if (!p) return
              ;(e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId)
              drag.current = { index: i, dx: p.x - s.x, dy: p.y - s.y, moved: false }
              onSelect(i)
            }}
          >
            <Sticker id={s.id} />
            {selected === i && (
              <rect
                x={-2}
                y={-2}
                width={def.w + 4}
                height={def.h + 4}
                fill="none"
                stroke="#ff7f2a"
                strokeWidth={1.2}
                strokeDasharray="3 2"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
