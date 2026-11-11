import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react'
import { type AvatarLook, buildAvatar } from '../art/avatar'
import { type Decor, emptyArt, FLOOR_SIDE, type FloorDecor, shade, WALL_H, WALL_W, type WallDecor } from '../art/decor'
import { artById } from '../art/fixtures'
import { backSprite, bottomRows, headSprite, OUTFITS, sitSprite, withOutfit } from '../art/poses'
import { type Sprite, spriteHeight, spriteWidth } from '../art/sprite'
import { FIXTURES, findPath, nearestFree, PARTITIONS, ROOM_FLOORS, solidSegments, type UV, ZONES } from '../lib/home'
import { type Fx, type Interaction, interactionFor, pickLine, TV_CHANNELS } from '../lib/interactions'
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
import { toolFor } from '../lib/tools'
import { type PinchMode, pinchMode, ROTATE_GAIN, twist } from '../lib/gesture'
import type { SharedRoomState } from '../lib/realtime'
import type { Drop } from '../lib/types'
import { CHARACTER_PX, PixelSprite, ROOM_PX } from './PixelSprite'
import { Disco, Floaters, Glow, Night, TvScreen } from './RoomFx'
import { FloorSurface, slabColors, WallSurface } from './Surfaces'

const SLAB = 12
const INK = '#2b2233'
/** 칸막이벽 높이 (안이 들여다보이게 낮게) */
const PART_H = 30
const PIECE = 0.04
const SOLID = solidSegments(PARTITIONS)
/** 바닥 좌표 1 = 바닥 그림 320칸 (거실 0.5칸 = 꾸미기 바닥 160칸) */
const FLOOR_UNITS = FLOOR_SIDE * 2

type P = { x: number; y: number }

/** 드래그 1px당 회전 (라디안) */
const DRAG_TURN = 0.005
const TAP_SLOP = 6
/** 미니미 걷는 속도 (바닥 한 변 = 1, 초당) */
const WALK_SPEED = 0.42
/** 현관: 손님이 처음 서는 자리 */
export const ENTRANCE: UV = { u: 0.54, v: 0.9 }
/** 다른 사람 자리가 이만큼 어긋나 있으면 받은 자리로 옮겨 놓고 걷게 한다 */
const SNAP = 0.08

// ─── 카메라 ───
/** 'free': 끌어서 둘러보고 핀치로 확대, 'fit': 집 전체, 'living': 거실만 (예전 방 크기) */
export type CameraMode = 'free' | 'fit' | 'living'
const CAM_W = 340
const CAM_H = 360
const S_MIN = 0.5
const S_MAX = 1.9
const S_HOME = 0.95
type Cam = { x: number; y: number; s: number }
const LIVING_BOX = { x: 160, y: 10, w: 340, h: 300 }

/** 화면 세로/가로 비율이 바뀌어도 보이는 넓이는 같게 (세로로 긴 폰 전체 화면에서도 미니미 크기가 알맞게) */
const CAM_AREA = CAM_W * CAM_H
const BASE_ASPECT = CAM_H / CAM_W
/** 무대 모양: a = 세로/가로, k = 보이는 넓이 배수 (PC처럼 큰 화면은 더 멀리서 본다) */
type View = { a: number; k: number }
/** 이 정도 크기(폰 한 화면)까지는 기본 넓이, 더 크면 그만큼 더 넓게 */
const PHONE_PX = 390 * 760
/** 이보다 넓으면 PC 화면으로 보고 처음에 집 전체를 보여 준다 (index.css 820px과 같이) */
const WIDE_PX = 820
const camSize = (s: number, v: View) => {
  const w = Math.sqrt((CAM_AREA * v.k) / v.a) / s
  return { w, h: w * v.a }
}

function clampCam(c: Cam, aspect: View): Cam {
  const s = Math.min(S_MAX, Math.max(S_MIN, c.s))
  const { w, h } = camSize(s, aspect)
  const fit = (n: number, size: number, total: number) =>
    size >= total ? total / 2 : Math.min(total - size / 2 + 20, Math.max(size / 2 - 20, n))
  return { s, x: fit(c.x, w, VIEW_W), y: fit(c.y, h, VIEW_H) }
}

const camBox = (c: Cam, aspect: View) => {
  const { w, h } = camSize(c.s, aspect)
  return { x: c.x - w / 2, y: c.y - h / 2, w, h }
}

export interface Ghost {
  item: string
  u: number
  v: number
}

/** 방에 있는 미니미 한 명의 겉모습 */
export interface ActorInfo {
  look: AvatarLook
  name?: string
  /** 이름표 옆 표시 */
  badge?: 'owner' | 'me'
}

/** 바깥(방 화면)에서 미니미들을 시킬 때 */
export interface SceneControl {
  /** 내 미니미가 그 아이템을 쓰러 간다 */
  interactDrop: (id: string) => void
  /** 다른 사람 미니미를 들이거나 겉모습을 바꾼다 (처음이면 at 자리, 없으면 현관에 선다) */
  upsertActor: (id: string, info: ActorInfo, at?: UV) => void
  removeActor: (id: string) => void
  moveActor: (id: string, from: UV, to: UV) => void
  actActor: (id: string, key: string, from: UV) => void
  /** 머리 위 말풍선 ('me'는 내 미니미) */
  sayActor: (id: string, text: string) => void
  /** 혼자 알아서 돌아다니게 (방 주인이 없을 때 주인 미니미) */
  setIdle: (id: string, idle: boolean) => void
  /** 새로 들어온 사람에게 알려 줄 지금 내 상태와 방 상태 */
  snapshot: () => { at: UV; act: string | null; outfit: number; room: SharedRoomState }
  /** 받은 상태 그대로 그 자리에 둔다 (걸어가거나 효과를 다시 내지 않는다) */
  placeActor: (id: string, at: UV, act: string | null, outfit: number) => void
  applyRoom: (room: SharedRoomState) => void
}

interface Props {
  decor: Decor
  /** 내 미니미 (walkable이면 내가 움직인다) */
  look: AvatarLook
  name?: string
  badge?: ActorInfo['badge']
  /** 내 미니미가 처음 서는 자리 */
  spawn?: UV
  drops: Drop[]
  ghost?: Ghost | null
  selectedId?: string | null
  freshId?: string | null
  /** 선택된 아이템 위에 띄울 말풍선 내용 */
  bubble?: ReactNode
  /** 카메라가 고정일 때 좌우로 끌면 방이 돈다 */
  rotatable?: boolean
  /** 빈 바닥을 누르면 미니미가 걸어가고, 가구를 누르면 가서 쓴다 */
  walkable?: boolean
  camera?: CameraMode
  /** 부모 크기를 꽉 채운다 (방 화면 전체 화면). 화면 비율에 맞춰 카메라 상자도 바꾼다 */
  fill?: boolean
  /** 미니미 머리 위 이름표 */
  showTags?: boolean
  onFloorTap?: (p: UV) => void
  onDropTap?: (drop: Drop) => void
  onBackgroundTap?: () => void
  /** 내 미니미가 걷기 시작할 때 (실시간으로 다른 사람에게 보낸다) */
  onMeMove?: (from: UV, to: UV) => void
  /** 내 미니미가 가구·아이템을 쓰러 갈 때 */
  onMeAct?: (key: string, from: UV) => void
  /** 내 미니미가 가구·아이템에 도착해서 쓰기 시작할 때 (도구 창을 연다) */
  onMeArrive?: (key: string, item: string) => void
  svgRef?: Ref<SVGSVGElement>
  controlRef?: Ref<SceneControl>
  className?: string
  label?: string
}

/** 상호작용 대상: 집에 붙은 가구 또는 친구가 놓은 아이템 */
interface Target {
  key: string
  item: string
  u: number
  v: number
  scale?: number
}

const pxOf = (t: { scale?: number }) => ROOM_PX * (t.scale ?? 1)

interface Activity extends Target {
  inter: Interaction
  phase: 'going' | 'doing'
}

interface Walk {
  segs: { from: UV; to: UV; len: number; start: number }[]
  total: number
  start: number
  duration: number
  seg: number
  onArrive?: () => void
}

interface Actor {
  id: string
  info: ActorInfo
  pos: UV
  facing: 1 | -1
  heading: 'front' | 'back'
  walk: Walk | null
  act: Activity | null
  actTimer: number
  outfit: number
  say: { text: string; key: number } | null
  sayTimer: number
  idle: boolean
  idleTimer: number
}

const newActor = (id: string, info: ActorInfo, pos: UV): Actor => ({
  id,
  info,
  pos,
  facing: 1,
  heading: 'front',
  walk: null,
  act: null,
  actTimer: 0,
  outfit: 0,
  say: null,
  sayTimer: 0,
  idle: false,
  idleTimer: 0,
})

const pts = (list: P[]) => list.map((p) => `${p.x},${p.y}`).join(' ')
const onFloorArea = (p: UV) => p.u > -0.04 && p.u < 1.04 && p.v > -0.04 && p.v < 1.04
const dist = (a: UV, b: UV) => Math.hypot(a.u - b.u, a.v - b.v)

/** 머리 위에 띄우는 효과와 가구 위에 띄우는 효과 */
const ON_HEAD: Fx[] = ['zzz', 'hearts', 'notes', 'sweat', 'shock', 'type', 'sparkle']

/** 방 주인이 없을 때 주인 미니미가 혼자 하는 일 */
const IDLE_FIXTURES = ['fx-sofa', 'fx-tv', 'fx-bed', 'fx-beanbag', 'fx-chair', 'fx-fridge', 'fx-counter', 'fx-bathtub', 'fx-bookshelf']

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return
  if (typeof ref === 'function') ref(value)
  else (ref as { current: T | null }).current = value
}

export function RoomScene({
  decor,
  look,
  name,
  badge,
  spawn = CHARACTER_SPOT,
  drops,
  ghost,
  selectedId,
  freshId,
  bubble,
  rotatable = false,
  walkable = false,
  camera = 'fit',
  fill = false,
  showTags = false,
  onFloorTap,
  onDropTap,
  onBackgroundTap,
  onMeMove,
  onMeAct,
  onMeArrive,
  svgRef,
  controlRef,
  className,
  label = '미니룸',
}: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const free = camera === 'free'
  const svgEl = useRef<SVGSVGElement | null>(null)
  const [, bump] = useReducer((n: number) => n + 1, 0)

  const thetaRef = useRef(0)
  const raf = useRef(0)

  /** 무대 세로/가로 비율 (fill이면 화면 크기를 재서 바꾼다) */
  const aspect = useRef<View>({ a: BASE_ASPECT, k: 1 })
  const fitCam = (c: Cam) => clampCam(c, aspect.current)
  // 처음 화면: 거실 가운데. 걸어 다닐 수 있으면 내 미니미가 서 있는 쪽으로 반쯤 당긴다 (현관으로 들어온 손님도 보이게)
  const camRef = useRef<Cam>(null as unknown as Cam)
  if (!camRef.current) {
    const at = project(spawn, 0)
    const home = { x: 330, y: 205 }
    const c = walkable ? { x: (home.x + at.x) / 2, y: (home.y + at.y - 24) / 2 } : home
    camRef.current = clampCam({ ...c, s: S_HOME }, aspect.current)
  }
  const stageEl = useRef<HTMLDivElement>(null)
  const fitted = useRef(false)
  /** 무대 크기 (px). 꽉 채우기 화면에서 방 그림을 통째로 옮길 때 쓴다 */
  const stageSize = useRef({ w: 0, h: 0 })
  /** 지금 보고 있는 카메라 상자 (화면 좌표 → 방 좌표 바꿀 때) */
  const vbRef = useRef({ x: 0, y: 0, w: VIEW_W, h: VIEW_H })

  // 꽉 채우기: 무대 크기가 바뀌면(회전·주소창·키보드) 카메라 상자 비율을 맞춘다
  useLayoutEffect(() => {
    const el = stageEl.current
    if (!fill || !free || !el) return
    const measure = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width < 10 || height < 10) return
      stageSize.current = { w: width, h: height }
      const next = { a: height / width, k: Math.max(1, Math.sqrt((width * height) / PHONE_PX)) }
      if (Math.abs(next.a - aspect.current.a) < 0.002 && Math.abs(next.k - aspect.current.k) < 0.01) return
      aspect.current = next
      if (!fitted.current && width >= WIDE_PX) {
        // PC처럼 넓은 화면은 처음에 집 전체가 다 보이게
        const base = camSize(1, next)
        const sFit = Math.min(base.w / (VIEW_W + 40), base.h / (VIEW_H + 60))
        camRef.current = clampCam({ x: VIEW_W / 2, y: VIEW_H / 2, s: Math.max(S_MIN, sFit) }, next)
      } else {
        camRef.current = clampCam(camRef.current, next)
      }
      fitted.current = true
      bump()
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fill, free])

  /** right: PC 우클릭 (끌면 회전, 짧게 누르면 미니미 이동) */
  type Press = { x: number; y: number; theta: number; cam: Cam; dragging: boolean; right: boolean }
  const press = useRef<Press | null>(null)
  const pointers = useRef(new Map<number, P>())
  /** 두 손가락: 벌리면 확대, 비틀면 회전. 먼저 뚜렷하게 한 쪽으로 잠근다 (mode) */
  const pinch = useRef<{ d: number; angle: number; theta: number; cam: Cam; world: P; mode: PinchMode; zoomD: number; turnFrom: number } | null>(null)

  const actors = useRef<Map<string, Actor> | null>(null)
  if (!actors.current) actors.current = new Map([['me', newActor('me', { look, name, badge }, spawn)]])
  const all = actors.current
  const me = all.get('me')!
  me.info = { look, name, badge }

  const loopRaf = useRef(0)
  const camAnim = useRef<{ from: Cam; to: Cam; start: number; ms: number } | null>(null)
  const markerTimer = useRef(0)
  const marker = useRef<(UV & { key: number }) | null>(null)

  const lights = useRef(new Set<string>())
  const bursts = useRef<{ key: number; fx: Fx; at: UV; item: string }[]>([])
  const channel = useRef(0)
  const switching = useRef(false)
  const switchTimer = useRef(0)

  const dropsRef = useRef(drops)
  dropsRef.current = drops
  const cb = useRef({ onMeMove, onMeAct, onMeArrive })
  cb.current = { onMeMove, onMeAct, onMeArrive }

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current)
      cancelAnimationFrame(loopRaf.current)
      camAnim.current = null
      window.clearTimeout(markerTimer.current)
      window.clearTimeout(switchTimer.current)
      for (const a of all.values()) {
        window.clearTimeout(a.actTimer)
        window.clearTimeout(a.sayTimer)
        window.clearTimeout(a.idleTimer)
      }
    },
    [all],
  )

  // ─── 카메라 ───
  const setCam = (c: Cam) => {
    camRef.current = fitCam(c)
    bump()
  }

  /** 카메라를 부드럽게 옮긴다. 걷기와 같은 프레임 루프에서 같이 움직여서 한 프레임에 한 번만 다시 그린다 */
  const animateCam = (target: Cam, ms = 420) => {
    camAnim.current = { from: camRef.current, to: fitCam(target), start: performance.now(), ms }
    startLoop()
  }

  const stepCam = (now: number) => {
    const c = camAnim.current
    if (!c) return false
    const k = Math.min(1, (now - c.start) / c.ms)
    const e = 1 - (1 - k) ** 3
    camRef.current = fitCam({
      x: c.from.x + (c.to.x - c.from.x) * e,
      y: c.from.y + (c.to.y - c.from.y) * e,
      s: c.from.s + (c.to.s - c.from.s) * e,
    })
    if (k >= 1) camAnim.current = null
    return k < 1
  }

  /** 내 미니미가 갈 곳이 화면 가장자리면 그쪽으로 카메라를 옮긴다 */
  const follow = (p: UV) => {
    if (!free) return
    const at = project(p, thetaRef.current)
    const box = camBox(camRef.current, aspect.current)
    const inset = 0.22
    const inside =
      at.x > box.x + box.w * inset &&
      at.x < box.x + box.w * (1 - inset) &&
      at.y > box.y + box.h * inset &&
      at.y < box.y + box.h * (1 - inset)
    if (!inside) animateCam({ ...camRef.current, x: at.x, y: at.y - 24 }, 600)
  }

  const zoomAround = (factor: number, world?: P) => {
    const c = camRef.current
    const s = Math.min(S_MAX, Math.max(S_MIN, c.s * factor))
    if (!world) return animateCam({ ...c, s }, 220)
    // 손가락(커서) 아래 지점이 그대로 있게
    const k = c.s / s
    setCam({ s, x: world.x + (c.x - world.x) * k, y: world.y + (c.y - world.y) * k })
  }

  // 휠 확대 (passive가 아니어야 페이지가 같이 스크롤되지 않는다)
  useEffect(() => {
    const el = stageEl.current
    if (!el || !free) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      camAnim.current = null
      zoomAround(Math.exp(-e.deltaY * 0.0015), toWorld(e.clientX, e.clientY))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [free])

  // ─── 회전 ───
  const setAngle = (t: number) => {
    thetaRef.current = t
    bump()
  }

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

  // ─── 말·효과 ───
  const speak = (a: Actor, text: string, ms = 2600) => {
    window.clearTimeout(a.sayTimer)
    a.say = { text, key: performance.now() + Math.random() }
    a.sayTimer = window.setTimeout(() => {
      a.say = null
      bump()
    }, ms)
    bump()
  }

  const burst = (fx: Fx, t: Target) => {
    const key = performance.now() + Math.random()
    bursts.current = [...bursts.current, { key, fx, at: { u: t.u, v: t.v }, item: t.item }]
    window.setTimeout(() => {
      bursts.current = bursts.current.filter((x) => x.key !== key)
      bump()
    }, 1800)
  }

  /** 하던 걸 그만둔다 (일어날 때 한마디·효과) */
  const endAct = (a: Actor) => {
    window.clearTimeout(a.actTimer)
    const cur = a.act
    if (cur?.phase === 'doing' && cur.inter.leave) {
      burst(cur.inter.leave.fx, cur)
      speak(a, cur.inter.leave.line)
    }
    a.act = null
  }

  // ─── 걷기 (모든 미니미를 한 루프로 움직인다) ───
  const startLoop = () => {
    if (!loopRaf.current) loopRaf.current = requestAnimationFrame(loop)
  }

  const loop = (now: number) => {
    loopRaf.current = 0
    const camMoving = stepCam(now)
    for (const a of all.values()) advance(a, now)
    bump()
    if (camMoving || [...all.values()].some((a) => a.walk)) startLoop()
  }

  /** 걷는 미니미를 지금 시각 자리로 옮긴다 (화면이 안 그려지는 동안에도 시간 기준으로 맞춘다) */
  const advance = (a: Actor, now: number) => {
    const w = a.walk
    if (!w) return
    const k = Math.min(1, (now - w.start) / w.duration)
    const d = k * w.total
    let i = w.segs.length - 1
    while (i > 0 && w.segs[i].start > d) i--
    const s = w.segs[i]
    if (i !== w.seg) {
      w.seg = i
      const pa = project(s.from, thetaRef.current)
      const pb = project(s.to, thetaRef.current)
      if (Math.abs(pb.x - pa.x) > 1) a.facing = pb.x < pa.x ? -1 : 1
      a.heading = pb.y < pa.y - 1 ? 'back' : 'front'
    }
    const t = Math.min(1, (d - s.start) / s.len)
    a.pos = { u: s.from.u + (s.to.u - s.from.u) * t, v: s.from.v + (s.to.v - s.from.v) * t }
    if (k >= 1) {
      a.walk = null
      a.heading = 'front'
      w.onArrive?.()
    }
  }

  const walkAlong = (a: Actor, points: UV[], onArrive?: () => void) => {
    const segs: Walk['segs'] = []
    let from = a.pos
    let total = 0
    for (const p of points) {
      const len = dist(p, from)
      if (len < 1e-4) continue
      segs.push({ from, to: p, len, start: total })
      total += len
      from = p
    }
    if (total < 0.004) {
      a.walk = null
      onArrive?.()
      bump()
      return
    }
    a.walk = { segs, total, start: performance.now(), duration: (total / WALK_SPEED) * 1000, seg: -1, onArrive }
    startLoop()
  }

  const go = (a: Actor, dest: UV, onArrive?: () => void) => {
    advance(a, performance.now())
    const to = nearestFree(dest)
    const path = findPath(a.pos, to)
    if (a.id === 'me') follow(to)
    walkAlong(a, path.length ? path : [to], onArrive)
    return to
  }

  /** 내 미니미를 그 자리로 (누른 자리 표시, 다른 사람에게 알림) */
  const meWalk = (p: UV) => {
    advance(me, performance.now())
    endAct(me)
    const from = me.pos
    const to = go(me, p)
    window.clearTimeout(markerTimer.current)
    marker.current = { ...to, key: performance.now() }
    markerTimer.current = window.setTimeout(() => {
      marker.current = null
      bump()
    }, 650)
    cb.current.onMeMove?.(from, to)
  }

  // ─── 가구 쓰기 ───
  const standSpot = (t: Target, inter: Interaction): UV => {
    // 올라앉는 가구는 바로 앞, 등지고 쓰는 건 정면, 나머지는 옆에 서서 (아이템이 가려지지 않게)
    const off =
      inter.spot ??
      (inter.pose === 'sit' || inter.pose === 'lie' || inter.pose === 'bath'
        ? { du: 0.045, dv: 0.045 }
        : inter.pose === 'back' || inter.pose === 'watch'
          ? { du: 0.05, dv: 0.05 }
          : { du: 0.065, dv: -0.015 })
    return nearestFree({ u: t.u + off.du, v: t.v + off.dv })
  }

  const flickChannel = (n: number) => {
    channel.current = n
    switching.current = true
    window.clearTimeout(switchTimer.current)
    switchTimer.current = window.setTimeout(() => {
      switching.current = false
      bump()
    }, 380)
  }

  /** 내가 움직이는 미니미 (나, 혼자 돌아다니는 주인 미니미) */
  const isLocal = (a: Actor) => a.id === 'me' || a.idle

  const arrive = (a: Actor, t: Target, inter: Interaction) => {
    a.act = { ...t, inter, phase: 'doing' }
    if (a.id === 'me') cb.current.onMeArrive?.(t.key, t.item)
    const ip = project(t, thetaRef.current)
    const mp = project(a.pos, thetaRef.current)
    if (Math.abs(ip.x - mp.x) > 2) a.facing = ip.x < mp.x ? -1 : 1
    if (inter.light) {
      const on = !lights.current.has(t.key)
      if (on) lights.current.add(t.key)
      else lights.current.delete(t.key)
      speak(a, on ? pickLine(inter) : '딸깍, 불 끄기')
    } else if (t.item === 'tv') {
      const ch = channel.current
      flickChannel(ch)
      speak(a, `CH${ch + 1} ${TV_CHANNELS[ch]} · ${pickLine(inter)}`)
    } else {
      speak(a, pickLine(inter))
    }
    if (inter.outfit) a.outfit = (a.outfit + 1) % OUTFITS.length
    if (inter.ms) {
      window.clearTimeout(a.actTimer)
      a.actTimer = window.setTimeout(() => {
        a.act = null
        // 기겁하고 반대쪽으로 도망 (다른 사람 미니미는 그 사람이 보내 주는 대로)
        if (inter.flee && isLocal(a)) {
          const du = a.pos.u - t.u
          const dv = a.pos.v - t.v
          const len = Math.hypot(du, dv) || 1
          const dest = { u: a.pos.u + (du / len) * 0.22, v: a.pos.v + (dv / len) * 0.22 }
          if (a.id === 'me') meWalk(dest)
          else go(a, dest)
        }
        bump()
      }, inter.ms)
    }
    bump()
  }

  const startAct = (a: Actor, t: Target) => {
    const inter = interactionFor(t.item)
    if (!inter) return false
    const cur = a.act
    // 쓰고 있는 걸 한 번 더 누르면: TV는 채널 돌리기, 나머지는 한마디 더
    if (cur && cur.key === t.key) {
      if (cur.phase !== 'doing') return true
      // 쓰고 있는 가구를 또 누르면 도구 창을 다시 연다
      if (a.id === 'me') cb.current.onMeArrive?.(t.key, t.item)
      if (t.item === 'tv') {
        const next = (channel.current + 1) % TV_CHANNELS.length
        flickChannel(next)
        speak(a, `CH${next + 1} ${TV_CHANNELS[next]}`)
        return true
      }
      if (inter.light || inter.outfit) {
        arrive(a, t, inter)
        return true
      }
      speak(a, pickLine(inter))
      return true
    }
    endAct(a)
    a.act = { ...t, inter, phase: 'going' }
    go(a, standSpot(t, inter), () => {
      if (a.act?.key === t.key) arrive(a, t, inter)
    })
    bump()
    return true
  }

  const targetOf = (key: string): Target | null => {
    const f = FIXTURES.find((x) => x.id === key)
    if (f) return { key: f.id, item: f.item, u: f.u, v: f.v, scale: f.scale }
    const d = dropsRef.current.find((x) => x.id === key)
    return d ? { key: d.id, item: d.item, u: d.u, v: d.v } : null
  }

  const meAct = (t: Target) => {
    advance(me, performance.now())
    const from = me.pos
    if (startAct(me, t)) cb.current.onMeAct?.(t.key, from)
  }

  // ─── 혼자 돌아다니기 ───
  const idleStep = (a: Actor) => {
    window.clearTimeout(a.idleTimer)
    if (!a.idle || !all.has(a.id)) return
    a.idleTimer = window.setTimeout(
      () => {
        if (!a.idle) return
        if (!a.walk && a.act?.phase !== 'going') {
          if (Math.random() < 0.35) {
            endAct(a)
            const z = ZONES[Math.floor(Math.random() * ZONES.length)]
            go(a, { u: z.spot.u + (Math.random() - 0.5) * 0.1, v: z.spot.v + (Math.random() - 0.5) * 0.1 })
          } else {
            const key = IDLE_FIXTURES[Math.floor(Math.random() * IDLE_FIXTURES.length)]
            const t = targetOf(key)
            if (t && a.act?.key !== key) startAct(a, t)
          }
        }
        idleStep(a)
      },
      a.act ? 7000 + Math.random() * 7000 : 1500 + Math.random() * 2500,
    )
  }

  useImperativeHandle(controlRef, () => ({
    interactDrop: (id) => {
      const t = targetOf(id)
      if (t) meAct(t)
    },
    upsertActor: (id, info, at) => {
      const a = all.get(id)
      if (a) a.info = info
      else all.set(id, newActor(id, info, nearestFree(at ?? ENTRANCE)))
      bump()
    },
    removeActor: (id) => {
      const a = all.get(id)
      if (!a || id === 'me') return
      window.clearTimeout(a.actTimer)
      window.clearTimeout(a.sayTimer)
      window.clearTimeout(a.idleTimer)
      all.delete(id)
      bump()
    },
    moveActor: (id, from, to) => {
      const a = all.get(id)
      if (!a || id === 'me') return
      if (dist(a.pos, from) > SNAP) a.pos = from
      endAct(a)
      go(a, to)
    },
    actActor: (id, key, from) => {
      const a = all.get(id)
      const t = targetOf(key)
      if (!a || !t || id === 'me') return
      if (dist(a.pos, from) > SNAP) a.pos = from
      startAct(a, t)
    },
    sayActor: (id, text) => {
      const a = all.get(id)
      if (a) speak(a, text, Math.min(6000, 2600 + text.length * 80))
    },
    setIdle: (id, idle) => {
      const a = all.get(id)
      if (!a || a.idle === idle) return
      a.idle = idle
      if (idle) idleStep(a)
      else window.clearTimeout(a.idleTimer)
    },
    snapshot: () => ({
      // 걷는 중이면 가는 곳을 알려 준다 (지금 자리는 다른 사람 화면에서 이미 지나간 곳일 수 있다)
      at: me.walk ? me.walk.segs[me.walk.segs.length - 1].to : me.pos,
      act: me.act?.phase === 'doing' ? me.act.key : null,
      outfit: me.outfit,
      room: { lights: [...lights.current], tv: { 'fx-tv': channel.current } },
    }),
    placeActor: (id, at, act, outfit) => {
      const a = all.get(id)
      if (!a || id === 'me') return
      window.clearTimeout(a.actTimer)
      a.walk = null
      a.pos = nearestFree(at)
      a.outfit = outfit
      const t = act ? targetOf(act) : null
      const inter = t && interactionFor(t.item)
      // 잠깐 하는 일(ms)은 이미 끝났을 수 있어서 계속하는 일만 이어 둔다
      a.act = t && inter && !inter.ms ? { ...t, inter, phase: 'doing' } : null
      bump()
    },
    applyRoom: (room) => {
      lights.current = new Set(room.lights.filter((k) => targetOf(k)))
      channel.current = Math.max(0, Math.min(TV_CHANNELS.length - 1, (room.tv?.['fx-tv'] ?? 0) | 0))
      bump()
    },
  }))

  // ─── 포인터 ───
  /** 무대 상자 = 지금 카메라 상자. 화면 좌표를 방 그림 좌표로 바꾼다 */
  const stageRect = () => stageEl.current!.getBoundingClientRect()
  const toWorld = (x: number, y: number): P => {
    const r = stageRect()
    const v = vbRef.current
    return { x: v.x + ((x - r.left) / r.width) * v.w, y: v.y + ((y - r.top) / r.height) * v.h }
  }
  const toFloorPoint = (e: { clientX: number; clientY: number }) => {
    const v = toWorld(e.clientX, e.clientY)
    return unproject(v.x, v.y, thetaRef.current)
  }

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const right = e.button === 2
    if (right && !free && !walkable) return
    cancelAnimationFrame(raf.current)
    if (right) {
      press.current = { x: e.clientX, y: e.clientY, theta: thetaRef.current, cam: camRef.current, dragging: false, right }
      return
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (free && pointers.current.size === 2) {
      camAnim.current = null
      const [a, b] = [...pointers.current.values()]
      e.currentTarget.setPointerCapture(e.pointerId)
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      pinch.current = {
        d,
        angle,
        theta: thetaRef.current,
        cam: camRef.current,
        world: toWorld((a.x + b.x) / 2, (a.y + b.y) / 2),
        mode: 'wait',
        zoomD: d,
        turnFrom: 0,
      }
      if (press.current) press.current.dragging = true
      return
    }
    press.current = { x: e.clientX, y: e.clientY, theta: thetaRef.current, cam: camRef.current, dragging: false, right }
  }

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pz = pinch.current
    if (pz && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const turn = twist(pz.angle, Math.atan2(b.y - a.y, b.x - a.x))
      const next = pinchMode(pz.mode, d / pz.d, turn)
      if (next !== pz.mode) {
        // 잠기는 순간부터 재서 확대·회전이 툭 튀지 않게
        if (next === 'zoom') pz.zoomD = d
        if (next === 'rotate' || next === 'both') pz.turnFrom = turn
        pz.mode = next
      }
      const zooming = pz.mode === 'zoom' || pz.mode === 'both'
      const s = zooming ? Math.min(S_MAX, Math.max(S_MIN, pz.cam.s * (d / pz.zoomD))) : camRef.current.s
      // 두 손가락 가운데 아래의 지점이 손가락을 따라온다
      const rect = stageRect()
      const fx = ((a.x + b.x) / 2 - rect.left) / rect.width
      const fy = ((a.y + b.y) / 2 - rect.top) / rect.height
      const { w, h } = camSize(s, aspect.current)
      camRef.current = fitCam({ s, x: pz.world.x - fx * w + w / 2, y: pz.world.y - fy * h + h / 2 })
      // 손가락을 시계 방향으로 비틀면 방도 시계 방향으로 돈다
      if (pz.mode === 'rotate' || pz.mode === 'both') setAngle(rubberTilt(pz.theta + (turn - pz.turnFrom) * ROTATE_GAIN))
      else bump()
      return
    }
    const p = press.current
    if (!p) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    if (p.right) {
      // 우클릭 드래그: 좌우로 끌면 방이 돈다
      if (!p.dragging) {
        if (Math.abs(dx) <= TAP_SLOP) return
        p.dragging = true
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      setAngle(rubberTilt(p.theta - dx * DRAG_TURN))
      return
    }
    if (!p.dragging) {
      const far = free ? Math.hypot(dx, dy) > TAP_SLOP : rotatable && Math.abs(dx) > TAP_SLOP && Math.abs(dx) > Math.abs(dy)
      if (!far) return
      p.dragging = true
      camAnim.current = null
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (free) {
      const rect = stageRect()
      const k = camSize(p.cam.s, aspect.current).w / rect.width
      setCam({ ...p.cam, x: p.cam.x - dx * k, y: p.cam.y - dy * k })
    } else if (rotatable) {
      // 오른쪽으로 끌면 방 앞쪽이 손가락을 따라 오른쪽으로 돈다
      setAngle(rubberTilt(p.theta - dx * DRAG_TURN))
    }
  }

  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pinch.current) {
      if (pointers.current.size < 2) {
        pinch.current = null
        settle(clampTilt(thetaRef.current))
      }
      press.current = null
      return
    }
    const p = press.current
    press.current = null
    if (!p) return
    if (p.dragging) {
      if (!free || p.right) settle(clampTilt(thetaRef.current))
      return
    }
    // PC 우클릭을 짧게 누르면 그 자리로 걸어간다
    if (p.right) {
      const point = toFloorPoint(e)
      if (walkable && !onFloorTap && point && onFloorArea(point)) meWalk(point)
      return
    }
    // 탭: 놓기 모드면 자리 정하기, 가구 → 가서 쓰기, 아이템 → 말풍선, 빈 바닥 → 걸어가기
    const point = toFloorPoint(e)
    if (onFloorTap) {
      if (point) onFloorTap(clampFloor(point))
      return
    }
    const target = e.target as Element
    const fixHit = target.closest('[data-fixture]')
    const fixture = fixHit && FIXTURES.find((f) => f.id === fixHit.getAttribute('data-fixture'))
    if (fixture && walkable) {
      onBackgroundTap?.()
      meAct({ key: fixture.id, item: fixture.item, u: fixture.u, v: fixture.v, scale: fixture.scale })
      return
    }
    const hit = target.closest('[data-drop]')
    const drop = hit && drops.find((d) => d.id === hit.getAttribute('data-drop'))
    if (drop) {
      if (onDropTap) onDropTap(drop)
      else if (walkable) meAct({ key: drop.id, item: drop.item, u: drop.u, v: drop.v })
      return
    }
    onBackgroundTap?.()
    if (walkable && point && onFloorArea(point)) meWalk(point)
  }

  const onCancel = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pinch.current) settle(clampTilt(thetaRef.current))
    pinch.current = null
    press.current = null
  }

  // 우클릭은 위 포인터 처리에서 쓰므로 브라우저 메뉴는 띄우지 않는다
  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => e.preventDefault()

  // ─── 집 뼈대 ───
  const theta = thetaRef.current
  const cam = camRef.current
  // 바닥 두께·벽·바닥은 방 각도와 꾸미기가 바뀔 때만 다시 그린다 (미니미가 걸을 때마다 그리면 휴대폰에서 버벅인다)
  const backdrop = useMemo(() => drawBackdrop(decor, theta, uid), [decor, theta, uid])

  // ─── 집 안의 것들 (깊이 순서로 그린다) ───
  const things: Thing[] = []
  let bubbleAt: P | null = null
  const actorList = [...all.values()]
  const doings = actorList.flatMap((a) => (a.act?.phase === 'doing' ? [{ a, act: a.act }] : []))
  const doingOn = (key: string) => doings.find((d) => d.act.key === key)?.act

  // 칸막이벽 조각도 각도·벽 색이 바뀔 때만 새로 만든다
  const wallColor = decor.walls[0].color
  const partitions = useMemo(() => drawPartitions(theta, wallColor), [theta, wallColor])
  things.push(...partitions)

  const motionOf = (key: string) => doingOn(key)?.inter.motion
  const tvOn = (key: string) => doingOn(key) !== undefined

  for (const f of FIXTURES) {
    const art = artById(f.item)
    if (!art) continue
    const p = project(f, theta)
    const motion = motionOf(f.id)
    things.push({
      key: f.id,
      depth: viewDepth(f, theta),
      node: (
        <g className={`fixture ${walkable ? 'is-usable' : ''}`} data-fixture={f.id}>
          <ellipse cx={p.x} cy={p.y} rx={spriteWidth(art.sprite) * 0.85 * (f.scale ?? 1)} ry={4} fill="rgba(30,20,40,0.14)" />
          <g className={`drop-body ${motion ? `is-${motion}` : ''}`}>
            <PixelSprite sprite={art.sprite} x={p.x} y={p.y + 1} px={pxOf(f)} />
          </g>
          {walkable && toolFor(f.item) && <ToolMark x={p.x} y={p.y - spriteHeight(art.sprite) * pxOf(f) - 4} />}
          {f.item === 'tv' && tvOn(f.id) && (
            <TvOverlay at={p} sprite={art.sprite} px={pxOf(f)} channel={channel.current} switching={switching.current} />
          )}
        </g>
      ),
    })
  }

  for (const d of drops) {
    const art = artById(d.item)
    if (!art) continue
    const p = project(d, theta)
    const motion = motionOf(d.id)
    const cls = ['drop', d.id === selectedId && 'is-selected', d.id === freshId && 'is-fresh'].filter(Boolean).join(' ')
    if (d.id === selectedId) bubbleAt = { x: p.x, y: p.y - spriteHeight(art.sprite) * ROOM_PX - 6 }
    things.push({
      key: d.id,
      depth: viewDepth(d, theta),
      node: (
        <g className={cls} data-drop={d.id}>
          <ellipse cx={p.x} cy={p.y} rx={11} ry={4} fill="rgba(30,20,40,0.16)" />
          <g className={`drop-body ${motion ? `is-${motion}` : ''}`}>
            <PixelSprite sprite={art.sprite} x={p.x} y={p.y + 1} />
          </g>
          {d.item === 'tv' && tvOn(d.id) && (
            <TvOverlay at={p} sprite={art.sprite} px={ROOM_PX} channel={channel.current} switching={switching.current} />
          )}
        </g>
      ),
    })
  }

  // ─── 미니미들 ───
  const heads = new Map<string, P>()
  for (const a of actorList) {
    const doing = a.act?.phase === 'doing' ? a.act : null
    const base = withOutfit(buildAvatar(a.info.look), a.outfit)
    const mp = project(a.pos, theta)
    const pose = doing?.inter.pose
    const target = doing ? project(doing, theta) : null
    const targetArt = doing ? artById(doing.item)?.sprite : undefined
    const flip = (x: number, node: ReactNode) =>
      a.facing === -1 ? <g transform={`translate(${x * 2} 0) scale(-1 1)`}>{node}</g> : node
    let sprite: Sprite = base
    let at: P = { x: mp.x, y: mp.y + 1 }
    let depth = viewDepth(a.pos, theta)
    let cover: ReactNode = null
    let shadow = true
    let cls = ''

    if (doing && target && targetArt && (pose === 'sit' || pose === 'lie' || pose === 'bath')) {
      const seat = doing.inter.seat ?? 4
      const px = pxOf(doing)
      at = { x: target.x, y: target.y + 1 - seat * px }
      depth = viewDepth(doing, theta) + 0.002
      shadow = false
      sprite = pose === 'sit' ? sitSprite(base) : headSprite(base)
      if (doing.inter.cover !== undefined) {
        cover = <PixelSprite sprite={bottomRows(targetArt, doing.inter.cover)} x={target.x} y={target.y + 1} px={px} />
      }
    } else if (doing && pose === 'watch') sprite = sitSprite(backSprite(base))
    else if (doing && pose === 'floor') sprite = sitSprite(base)
    else if (doing && pose === 'back') sprite = backSprite(base)
    else if (doing && pose === 'dance') cls = 'is-dancing'
    else if (a.walk && a.heading === 'back') sprite = backSprite(base)

    if (doing?.inter.flee) cls = 'is-jumping'
    heads.set(a.id, { x: at.x, y: at.y - spriteHeight(sprite) * CHARACTER_PX })
    things.push({
      key: `actor-${a.id}`,
      depth,
      node: (
        <g className={`minime ${a.walk ? 'is-walking' : ''} ${cls}`} data-actor={a.id}>
          {shadow && <ellipse cx={mp.x} cy={mp.y} rx={12} ry={4} fill="rgba(30,20,40,0.18)" />}
          <g className="minime-body">{flip(at.x, <PixelSprite sprite={sprite} x={at.x} y={at.y} px={CHARACTER_PX} />)}</g>
          {cover}
        </g>
      ),
    })
  }

  if (ghost) {
    const art = artById(ghost.item)
    const p = project(ghost, theta)
    if (art) {
      things.push({
        key: 'ghost',
        depth: viewDepth(ghost, theta),
        node: (
          <g className="ghost">
            <ellipse cx={p.x} cy={p.y} rx={13} ry={5} fill="none" stroke="#ff7f2a" strokeWidth={1.5} strokeDasharray="3 2" />
            <PixelSprite sprite={art.sprite} x={p.x} y={p.y + 1} />
          </g>
        ),
      })
    }
  }

  things.sort((a, b) => a.depth - b.depth)

  // ─── 효과 ───
  const topOf = (t: { u: number; v: number; item: string; scale?: number }) => {
    const p = project(t, theta)
    const art = artById(t.item)
    const h = (art ? spriteHeight(art.sprite) : 10) * pxOf(t)
    return { x: p.x, y: p.y - h }
  }
  const overlays: ReactNode[] = []
  const under: ReactNode[] = []
  const floaters: ReactNode[] = []
  const shown = new Set<string>()
  for (const { a, act } of doings) {
    const top = topOf(act)
    const head = heads.get(a.id)!
    for (const fx of act.inter.fx) {
      // 방 전체 효과(밤·디스코·TV 불빛)는 여러 명이 해도 하나만
      const once = `${fx}:${fx === 'night' || fx === 'disco' ? '' : act.key}`
      if ((fx === 'night' || fx === 'disco' || fx === 'tv') && shown.has(once)) continue
      shown.add(once)
      const k = `${a.id}-${fx}`
      if (fx === 'night') overlays.push(<Night key="night" />)
      else if (fx === 'disco') overlays.push(<Disco key="disco" at={top} />)
      else if (fx === 'tv') {
        const p = project(act, theta)
        under.push(<Glow key={`tvglow-${act.key}`} at={{ x: p.x, y: p.y + 22 }} r={58} color="#9fdcff" className="fx-flicker" />)
      } else if (fx === 'fridge') floaters.push(<Glow key={k} at={{ x: top.x, y: top.y + 18 }} r={34} color="#e6f7ff" />)
      else if (fx === 'screen') floaters.push(<Glow key={k} at={{ x: top.x, y: top.y + 6 }} r={22} color="#bfe6ff" className="fx-flicker" />)
      else if (fx === 'wind') floaters.push(<Floaters key={k} fx={fx} at={{ x: top.x + 10, y: top.y + 8 }} />)
      else floaters.push(<Floaters key={k} fx={fx} at={ON_HEAD.includes(fx) ? { x: head.x, y: head.y - 4 } : { x: top.x, y: top.y - 2 }} />)
    }
  }
  const meHead = heads.get('me')!
  for (const b of bursts.current)
    floaters.push(<Floaters key={b.key} fx={b.fx} at={b.fx === 'sparkle' ? { x: meHead.x, y: meHead.y - 4 } : topOf({ ...b.at, item: b.item })} />)
  // 켜 둔 스탠드는 불을 꺼도(잘 때도) 빛난다
  for (const key of lights.current) {
    const t = FIXTURES.find((f) => f.id === key) ?? drops.find((d) => d.id === key)
    if (!t) continue
    const top = topOf(t)
    floaters.unshift(<Glow key={`light-${key}`} at={{ x: top.x, y: top.y + 10 }} r={70} color="#ffe9a0" />)
  }

  // ─── 카메라 상자 ───
  const vb = free ? camBox(cam, aspect.current) : camera === 'living' ? LIVING_BOX : { x: 0, y: 0, w: VIEW_W, h: VIEW_H }
  const pct = (p: P) => ({ left: ((p.x - vb.x) / vb.w) * 100, top: ((p.y - vb.y) / vb.h) * 100 })

  const interactive = free || rotatable || walkable || onFloorTap || onDropTap || onBackgroundTap
  const bubbleStyle = bubbleAt && bubblePosition(pct(bubbleAt))
  const tags = showTags || actorList.length > 1

  vbRef.current = vb
  // 꽉 채우기 화면: 방 그림은 집 전체 크기로 한 번만 그려 두고, 카메라가 움직이면 그림을 통째로 옮긴다(transform).
  // viewBox를 바꾸면 브라우저가 매 프레임 그림 전체를 다시 칠해서 휴대폰에서 버벅인다. 옮기기만 하면 GPU가 처리한다
  const moving = fill && free && stageSize.current.w > 0
  let layerStyle: CSSProperties | undefined
  if (moving) {
    const ppu = stageSize.current.w / vb.w
    const dpr = window.devicePixelRatio || 1
    const snap = (n: number) => Math.round(n * dpr) / dpr
    layerStyle = {
      width: VIEW_W * ppu,
      height: VIEW_H * ppu,
      transform: `translate3d(${snap(-vb.x * ppu)}px, ${snap(-vb.y * ppu)}px, 0)`,
    }
  }
  const viewBox = moving ? `0 0 ${VIEW_W} ${VIEW_H}` : `${vb.x} ${vb.y} ${vb.w} ${vb.h}`

  return (
    <div
      ref={stageEl}
      className={`room-stage ${free ? 'is-free' : ''} ${fill ? 'is-fill' : ''} ${moving ? 'is-moving' : ''} ${className ?? ''}`}
      onPointerDown={interactive ? onDown : undefined}
      onPointerMove={interactive ? onMove : undefined}
      onPointerUp={interactive ? onUp : undefined}
      onPointerCancel={onCancel}
      onContextMenu={free || walkable ? onContextMenu : undefined}
      style={{
        cursor: onFloorTap ? 'crosshair' : free || rotatable ? 'grab' : undefined,
        touchAction: free ? 'none' : rotatable || onFloorTap ? 'pan-y' : undefined,
      }}
    >
      {/* 벽·바닥은 따로 아래 층에 그린다. 미니미가 걸을 때 위층만 다시 칠해서 휴대폰에서도 부드럽게 */}
      <svg
        className="room room-backdrop"
        viewBox={viewBox}
        style={layerStyle}
        xmlns="http://www.w3.org/2000/svg"
        shapeRendering="crispEdges"
        aria-hidden
      >
        {backdrop}
      </svg>
      <svg
        ref={(el) => {
          svgEl.current = el
          setRef(svgRef, el)
        }}
        className="room room-front"
        viewBox={viewBox}
        xmlns="http://www.w3.org/2000/svg"
        shapeRendering="crispEdges"
        style={layerStyle}
        role="img"
        aria-label={label}
      >
        {marker.current && <WalkMarker key={marker.current.key} at={project(marker.current, theta)} />}
        <g pointerEvents="none">{under}</g>

        {things.map((t) => (
          <g key={t.key}>{t.node}</g>
        ))}

        {overlays}
        <g pointerEvents="none">{floaters}</g>
      </svg>

      {tags &&
        actorList.map((a) => {
          const head = heads.get(a.id)
          if (!head || !a.info.name) return null
          const at = pct({ x: head.x, y: head.y - 3 })
          if (at.left < -5 || at.left > 105 || at.top < -5 || at.top > 105) return null
          return (
            <div
              key={`tag-${a.id}`}
              className={`tag ${a.info.badge ? `is-${a.info.badge}` : ''}`}
              style={{ left: `${at.left}%`, top: `${at.top}%` }}
            >
              {a.info.badge === 'owner' && <b className="tag-badge">주인</b>}
              {a.info.name}
            </div>
          )
        })}

      {actorList.map((a) => {
        const head = heads.get(a.id)
        if (!a.say || !head) return null
        return (
          <div key={a.say.key} className="say" style={bubblePosition(pct({ x: head.x, y: head.y - (tags && a.info.name ? 14 : 2) }))}>
            {a.say.text}
          </div>
        )
      })}

      {bubble && bubbleStyle && (
        <div className="bubble" style={bubbleStyle} onPointerDown={(e) => e.stopPropagation()}>
          {bubble}
        </div>
      )}
    </div>
  )
}

type Thing = { key: string; depth: number; node: ReactNode }

const BEDROOM_FLOOR: FloorDecor = { color: '#d9a46c', pattern: 'planks' }
const KITCHEN_FLOOR: FloorDecor = { color: '#f4efe6', pattern: 'checker' }
const BATH_FLOOR: FloorDecor = { color: '#e2f1fa', pattern: 'tiles' }

/** 바닥 두께 · 뒤 벽 네 면 · 바닥(방마다 다른 바닥) */
function drawBackdrop(decor: Decor, theta: number, uid: string): ReactNode {
  const P0 = project({ u: 0, v: 0 }, theta)
  const PU = project({ u: 1, v: 0 }, theta)
  const PV = project({ u: 0, v: 1 }, theta)
  const PUV = project({ u: 1, v: 1 }, theta)
  const floorMatrix = `matrix(${(PU.x - P0.x) / FLOOR_UNITS} ${(PU.y - P0.y) / FLOOR_UNITS} ${(PV.x - P0.x) / FLOOR_UNITS} ${(PV.y - P0.y) / FLOOR_UNITS} ${P0.x} ${P0.y})`
  const [slabLight, slabDark] = slabColors(decor.floor)
  const frontEdges = [
    { a: PU, b: PUV },
    { a: PUV, b: PV },
  ].map((e) => ({ ...e, rising: (e.b.y - e.a.y) * (e.b.x - e.a.x) <= 0 }))

  // 뒤 벽 두 면을 반씩 나눠 거실 쪽은 방 주인이 꾸민 벽, 나머지는 각 방 벽
  const [wallL, wallR] = decor.walls
  const studyWall = roomWall(wallL, [
    { id: 'poster', x: 48, y: 26 },
    { id: 'clock', x: 112, y: 20 },
  ])
  const bedroomWall = roomWall(wallR, [{ id: 'window', x: 62, y: 20 }])
  const backSegs: { key: string; from: UV; to: UV; wall: WallDecor }[] = [
    { key: 'study', from: { u: 0, v: 1 }, to: { u: 0, v: 0.5 }, wall: studyWall },
    { key: 'livingL', from: { u: 0, v: 0.5 }, to: { u: 0, v: 0 }, wall: wallL },
    { key: 'livingR', from: { u: 0, v: 0 }, to: { u: 0.5, v: 0 }, wall: wallR },
    { key: 'bedroom', from: { u: 0.5, v: 0 }, to: { u: 1, v: 0 }, wall: bedroomWall },
  ]
  const studyFloor: FloorDecor = { color: shade(wallL.color, -0.1), pattern: 'dots' }
  const floorRect = (r: { u0: number; v0: number; u1: number; v1: number }, floor: FloorDecor, key: string) => (
    <g key={key} transform={`translate(${r.u0 * FLOOR_UNITS} ${r.v0 * FLOOR_UNITS})`}>
      <FloorSurface id={`${uid}-f-${key}`} floor={floor} w={(r.u1 - r.u0) * FLOOR_UNITS} h={(r.v1 - r.v0) * FLOOR_UNITS} />
    </g>
  )

  return (
    <>
      {/* 바닥 두께 (앞쪽 모서리) */}
      {frontEdges.map((e, i) => (
        <polygon
          key={i}
          points={pts([e.a, e.b, { x: e.b.x, y: e.b.y + SLAB }, { x: e.a.x, y: e.a.y + SLAB }])}
          fill={e.rising ? slabLight : slabDark}
          stroke={INK}
          strokeWidth={1.5}
          strokeLinejoin="round"
          shapeRendering="geometricPrecision"
        />
      ))}

      {backSegs.map((w) => {
        const a = project(w.from, theta)
        const b = project(w.to, theta)
        const rising = (b.y - a.y) * (b.x - a.x) <= 0
        const m = `matrix(${(b.x - a.x) / WALL_W} ${(b.y - a.y) / WALL_W} 0 1 ${a.x} ${a.y - WALL_H})`
        return (
          <g key={w.key}>
            <g transform={m}>
              <WallSurface id={`${uid}-${w.key}`} wall={w.wall} dim={rising ? 0 : 0.06} />
            </g>
            <polygon
              points={pts([a, b, { x: b.x, y: b.y - WALL_H }, { x: a.x, y: a.y - WALL_H }])}
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
        <FloorSurface id={`${uid}-floor`} floor={decor.floor} w={FLOOR_UNITS} h={FLOOR_UNITS} />
        {floorRect(ROOM_FLOORS.bedroom, BEDROOM_FLOOR, 'bedroom')}
        {floorRect(ROOM_FLOORS.study, studyFloor, 'study')}
        {floorRect(ROOM_FLOORS.kitchen, KITCHEN_FLOOR, 'kitchen')}
        {floorRect(ROOM_FLOORS.bath, BATH_FLOOR, 'bath')}
        {/* 현관 매트 */}
        <rect x={0.46 * FLOOR_UNITS} y={0.9 * FLOOR_UNITS} width={0.16 * FLOOR_UNITS} height={0.07 * FLOOR_UNITS} rx={3} fill="#c9935b" stroke={INK} strokeWidth={1} />
      </g>
      <polygon
        points={pts([P0, PU, PUV, PV])}
        fill="none"
        stroke={INK}
        strokeWidth={1.5}
        strokeLinejoin="round"
        shapeRendering="geometricPrecision"
      />
    </>
  )
}

/** 칸막이벽: 잘게 잘라 조각마다 깊이를 매긴다 (가구·미니미와 섞어서 깊이 순서로 그린다) */
function drawPartitions(theta: number, wallColor: string): Thing[] {
  const out: Thing[] = []
  const partColor = (tone: 'wall' | 'tile', rising: boolean) =>
    tone === 'tile' ? (rising ? '#f4f9fc' : '#dfeaf2') : rising ? shade(wallColor, -0.04) : shade(wallColor, -0.14)
  for (const [si, seg] of SOLID.entries()) {
    const part = PARTITIONS.find((w) => onSegment(seg.from, w) && onSegment(seg.to, w))
    const tone = part?.tone ?? 'wall'
    const len = Math.hypot(seg.to.u - seg.from.u, seg.to.v - seg.from.v)
    const n = Math.max(1, Math.ceil(len / PIECE))
    for (let k = 0; k < n; k++) {
      const a = lerpUV(seg.from, seg.to, k / n)
      const b = lerpUV(seg.from, seg.to, (k + 1) / n)
      const pa = project(a, theta)
      const pb = project(b, theta)
      const rising = (pb.y - pa.y) * (pb.x - pa.x) <= 0
      const ta = { x: pa.x, y: pa.y - PART_H }
      const tb = { x: pb.x, y: pb.y - PART_H }
      out.push({
        key: `w${si}-${k}`,
        depth: viewDepth(lerpUV(a, b, 0.5), theta),
        node: (
          <g shapeRendering="geometricPrecision">
            <polygon points={pts([pa, pb, tb, ta])} fill={partColor(tone, rising)} stroke={partColor(tone, rising)} strokeWidth={0.6} />
            <line x1={ta.x} y1={ta.y} x2={tb.x} y2={tb.y} stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
            <line x1={ta.x} y1={ta.y - 0.4} x2={tb.x} y2={tb.y - 0.4} stroke="#fff" strokeWidth={0.8} opacity={0.7} />
            {k === 0 && <line x1={pa.x} y1={pa.y} x2={ta.x} y2={ta.y} stroke={INK} strokeWidth={1.4} />}
            {k === n - 1 && <line x1={pb.x} y1={pb.y} x2={tb.x} y2={tb.y} stroke={INK} strokeWidth={1.4} />}
          </g>
        ),
      })
    }
  }
  return out
}

/** TV 화면 칸 (스프라이트의 3~16열, 3~8줄)에 채널을 겹친다 */
function TvOverlay({ at, sprite, px, channel, switching }: { at: P; sprite: Sprite; px: number; channel: number; switching: boolean }) {
  const left = at.x - (spriteWidth(sprite) * px) / 2
  const top = at.y + 1 - spriteHeight(sprite) * px
  return <TvScreen x={left + 3 * px} y={top + 3 * px} w={14 * px} h={6 * px} channel={channel} switching={switching} />
}

const EMPTY_ART = emptyArt()
/** 안방·작은방 벽: 거실 벽지 색·무늬를 이어 쓰고 장식은 고정 */
function roomWall(base: WallDecor, stickers: WallDecor['stickers']): WallDecor {
  return { color: base.color, pattern: base.pattern, art: EMPTY_ART, stickers }
}

const lerpUV = (a: UV, b: UV, t: number) => ({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t })
function onSegment(p: UV, w: { from: UV; to: UV }) {
  const cross = (w.to.u - w.from.u) * (p.v - w.from.v) - (w.to.v - w.from.v) * (p.u - w.from.u)
  return Math.abs(cross) < 1e-6
}

/** 바닥에 눕힌 링 두 개가 오므라들며 사라진다 */
function WalkMarker({ at }: { at: P }) {
  return (
    <g className="walk-marker" transform={`translate(${at.x} ${at.y})`} shapeRendering="geometricPrecision">
      <ellipse className="walk-ring" rx={12} ry={6} fill="none" stroke="#ff7f2a" strokeWidth={1.6} />
      <ellipse className="walk-ring late" rx={12} ry={6} fill="none" stroke="#fff3b0" strokeWidth={1.2} />
      <ellipse className="walk-dot" rx={2.4} ry={1.2} fill="#ff7f2a" />
    </g>
  )
}

/** 말풍선은 방 밖으로 나가지 않게 가운데 쪽으로 당기고, 꼬리는 가리키는 곳을 향하게 둔다 */
function bubblePosition(at: { left: number; top: number }): CSSProperties {
  const clamped = Math.min(76, Math.max(24, at.left))
  return {
    left: `${clamped}%`,
    top: `${Math.min(100, Math.max(at.top, 14))}%`,
    ['--tail' as string]: `${at.left - clamped}cqw`,
  }
}

/** 진짜로 쓸 수 있는 가구 위에 반짝이는 작은 별 */
function ToolMark({ x, y }: { x: number; y: number }) {
  const k = 1.5
  return (
    <g className="tool-mark" pointerEvents="none">
      <rect x={x - k / 2} y={y - k * 2.5} width={k} height={k * 5} fill="#fff6a8" stroke="#2b2233" strokeWidth={0.4} />
      <rect x={x - k * 2.5} y={y - k / 2} width={k * 5} height={k} fill="#fff6a8" stroke="#2b2233" strokeWidth={0.4} />
      <rect x={x - k / 2} y={y - k / 2} width={k} height={k} fill="#ffd94a" />
    </g>
  )
}
