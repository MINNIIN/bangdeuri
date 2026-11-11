/**
 * 3D 동네 화면. 골목과 친구들 집 안을 같이 돌아다닌다.
 *
 * - 한 번에 한 곳(area)만 그린다: 골목(town) 또는 어느 집 안(house:방번호). 문을 지나면 바뀐다.
 * - 다른 사람 미니미는 나와 같은 곳에 있을 때만 보인다 (어디 있는지는 이름표 목록으로 안다).
 * - 바닥을 누르면 걸어가고, 가구를 누르면 가서 쓰고, 집 문을 누르면 들어가고, 현관 매트를 누르면 나간다.
 * - 끌면 둘러보기, 두 손가락 벌리기·휠은 확대, 두 손가락 비틀기·PC 우클릭 끌기는 회전.
 */
import { type CSSProperties, type ReactNode, type Ref, useEffect, useReducer, useRef } from 'react'
import * as THREE from 'three'
import type { AvatarLook } from '../art/avatar'
import { OUTFITS } from '../art/poses'
import { FIXTURES, ZONES } from '../lib/home'
import { ROTATE_GAIN, twist } from '../lib/gesture'
import { clampTilt, rubberTilt } from '../lib/iso'
import { type Fx, type Interaction, interactionFor, pickLine, TV_CHANNELS } from '../lib/interactions'
import { type Blocker, hitsWall } from '../lib/home'
import { makeSpot, type Spot } from '../lib/layout'
import type { SharedRoomState } from '../lib/realtime'
import { toolFor } from '../lib/tools'
import {
  type AreaId,
  doorStep,
  findHouseWorldPath,
  findTownPath,
  houseArea,
  HOUSE_ENTRANCE,
  HOUSE_EXIT,
  HOUSE_SIZE,
  lotAtYard,
  mailboxSpot,
  houseToUv,
  insideObstacle,
  nearestHouseOpen,
  nearestOpen,
  type Obstacle,
  obstacleBlocker,
  townToYard,
  roomOfArea,
  TOWN,
  type TownMap,
  uvToHouse,
  type Vec2,
  yardToTown,
} from '../lib/town'
import type { Drop, Room } from '../lib/types'
import { type Avatar3D, buildAvatar3D } from './avatar3d'
import { buildItem3D, BULB, COVER, itemDepth, LIE_FORWARD, SCREEN, SEAT, SEAT_FORWARD, SEAT_KNEE } from './furniture3d'
import { FxLayer, glowTexture, ON_HEAD } from './fx3d'
import { buildHouse3D, fixtureFacing, fixtureWorld, type House3D } from './house3d'
import { disposeTree, mat, part, torus } from './kit'
import { buildTown3D, type Town3D } from './town3d'

const TAP_SLOP = 7
const WALK_TOWN = 2.6
const WALK_HOUSE = 2.0
const SNAP = 0.9
const IDLE_FIXTURES = ['fx-sofa', 'fx-tv', 'fx-bed', 'fx-beanbag', 'fx-chair', 'fx-fridge', 'fx-counter', 'fx-bathtub', 'fx-bookshelf']
const TV_COLORS = ['#7fd0ff', '#ffd27a', '#9dffb0', '#ff9fd0', '#c7a8ff']

export interface ActorInfo {
  look: AvatarLook
  name?: string
  badge?: 'owner' | 'me'
}

/** 놓을 자리를 고를 때 미리 보이는 아이템 */
export interface Ghost {
  item: string
  area: AreaId
  x: number
  z: number
}

/** 놓기 모드에서 누른 곳 */
export type PlaceTap =
  | { place: 'in'; roomId: string; u: number; v: number; area: AreaId; x: number; z: number }
  | { place: 'yard'; roomId: string; u: number; v: number; area: AreaId; x: number; z: number }
  | { place: 'mail'; roomId: string }

/** 배치 바꾸기에서 고른 물건 */
export interface ArrangeSel {
  /** 저장 열쇠 (가구 id 또는 아이템 id) */
  key: string
  item: string
  /** 친구가 놓은 아이템인지 (아니면 처음부터 있던 가구) */
  drop: boolean
}

export interface WorldControl {
  interactDrop: (id: string) => void
  upsertActor: (id: string, info: ActorInfo, area?: AreaId, at?: Vec2) => void
  removeActor: (id: string) => void
  moveActor: (id: string, area: AreaId, from: Vec2, to: Vec2) => void
  actActor: (id: string, area: AreaId, key: string, from: Vec2) => void
  areaActor: (id: string, area: AreaId, at: Vec2) => void
  sayActor: (id: string, text: string) => void
  /** 주인 없는 집의 주인 미니미 (혼자 논다) */
  setNpc: (roomId: string, info: ActorInfo | null) => void
  snapshot: () => { area: AreaId; at: Vec2; act: string | null; outfit: number; room: SharedRoomState }
  placeActor: (id: string, area: AreaId, at: Vec2, act: string | null, outfit: number) => void
  applyRoom: (room: SharedRoomState) => void
  /** 그 아이템이 있는 곳이 지금 내가 있는 곳이면 카메라를 옮긴다 */
  focusDrop: (id: string) => boolean
  /** 집 밖으로 / 그 집 안으로 (걸어가서 문을 지난다) */
  goOut: () => void
  goHouse: (roomId: string) => void
  /** 지금 화면을 이미지로 (스토리 공유) */
  capture: () => HTMLCanvasElement | null
  /** 배치 바꾸기: 고른 물건을 45°씩 돌린다 (벽·가구에 걸리면 false) */
  arrangeRotate: (dir: 1 | -1) => boolean
  /** 배치 바꾸기: 고른 물건을 처음 자리로 */
  arrangeReset: () => void
  /** 배치 바꾸기: 지금까지 바꾼 자리들 (null = 처음 자리로) */
  arrangeChanges: () => [string, Spot | null][]
}

interface Props {
  map: TownMap
  rooms: Map<string, Room>
  look: AvatarLook
  name?: string
  badge?: ActorInfo['badge']
  /** 처음 서는 곳 */
  spawn: { area: AreaId; at: Vec2 }
  drops: Drop[]
  ghost?: Ghost | null
  selectedId?: string | null
  freshId?: string | null
  bubble?: ReactNode
  walkable?: boolean
  /** 배치 바꾸기 중인 내 방 (그 방 집 안 가구·아이템, 골목에서는 그 집 마당 아이템을 끌어 옮긴다) */
  arrange?: { roomId: string } | null
  onArrangeSelect?: (sel: ArrangeSel | null) => void
  /** 벽·다른 가구에 걸리는 곳에 놓으려 해서 되돌렸다 */
  onArrangeBlocked?: () => void
  /** 놓기 모드: 누른 곳을 알려 준다 (null = 놓을 수 없는 곳) */
  onPlaceTap?: (t: PlaceTap | null) => void
  onDropTap?: (drop: Drop) => void
  onMailTap?: (roomId: string) => void
  onBackgroundTap?: () => void
  onMeMove?: (area: AreaId, from: Vec2, to: Vec2) => void
  onMeAct?: (area: AreaId, key: string, from: Vec2) => void
  onMeArrive?: (key: string, item: string) => void
  /** 내가 문을 지나 다른 곳으로 갔다 */
  onMeArea?: (area: AreaId, at: Vec2) => void
  controlRef?: Ref<WorldControl>
}

interface Target {
  key: string
  item: string
  area: AreaId
  pos: Vec2
  yaw: number
}

interface Activity extends Target {
  inter: Interaction
  phase: 'going' | 'doing'
  fxAt: number
}

interface Walk {
  pts: Vec2[]
  seg: number
  from: Vec2
  speed: number
  onArrive?: () => void
}

interface Actor {
  id: string
  info: ActorInfo
  area: AreaId
  pos: Vec2
  yaw: number
  walk: Walk | null
  act: Activity | null
  actTimer: number
  outfit: number
  say: { text: string; key: number; until: number } | null
  idle: string | null
  idleTimer: number
  avatar: Avatar3D
  builtFor: string
}

const KEY_SEP = '/'
const fixtureKey = (roomId: string, fx: string) => `${roomId}${KEY_SEP}${fx}`
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z)

/** 한국 시각으로 밤인지 (저녁 7시 ~ 아침 6시) */
function isNightKst(now = new Date()) {
  const h = (now.getUTCHours() + 9) % 24
  return h >= 19 || h < 6
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return
  if (typeof ref === 'function') ref(value)
  else (ref as { current: T | null }).current = value
}

/** 카메라: 바라보는 곳(target) 둘레를 도는 궤도 */
interface Cam {
  target: THREE.Vector3
  yaw: number
  pitch: number
  dist: number
}

/** k: 세로로 긴 화면은 더 멀리서 (휴대폰에서도 동네·집 전체 느낌이 나게) */
const camDefault = (area: AreaId, at: Vec2, k = 1): Cam =>
  area === TOWN
    ? { target: new THREE.Vector3(at.x, 0.6, at.z + 1), yaw: 0.22, pitch: 0.86, dist: 20 * k }
    : { target: new THREE.Vector3(0.3, 0.4, 0.6), yaw: Math.PI / 4, pitch: 0.9, dist: 19 * k }

/** 돌릴 수 있는 범위: 2D 때와 같이 기본 각도에서 좌우 30° (넘기면 고무줄처럼 버티다 놓으면 돌아온다) */
const YAW_CENTER = { town: 0.22, house: Math.PI / 4 } as const
/** 2D 때 좌우로 끌 때 돌던 빠르기 (px당 라디안) */
const DRAG_TURN = 0.005
/** 위아래로 기울일 수 있는 범위 (내려다보는 각, 라디안): 옆에서 비스듬히 ~ 거의 위에서 */
const PITCH_LIMIT = [0.55, 1.25] as const
/** 범위를 넘기면 고무줄처럼 조금만 더 간다 */
const rubberPitch = (p: number, rubber: boolean) => {
  const [lo, hi] = PITCH_LIMIT
  if (p < lo) return rubber ? lo - (lo - p) * 0.2 : lo
  if (p > hi) return rubber ? hi + (p - hi) * 0.2 : hi
  return p
}
const DIST_LIMIT = { town: [7, 40], house: [7, 34] } as const

export function World({
  map,
  rooms,
  look,
  name,
  badge,
  spawn,
  drops,
  ghost,
  selectedId,
  freshId,
  bubble,
  walkable = false,
  arrange = null,
  onArrangeSelect,
  onArrangeBlocked,
  onPlaceTap,
  onDropTap,
  onMailTap,
  onBackgroundTap,
  onMeMove,
  onMeAct,
  onMeArrive,
  onMeArea,
  controlRef,
}: Props) {
  const hostEl = useRef<HTMLDivElement>(null)
  const overlayEl = useRef<HTMLDivElement>(null)
  const bubbleEl = useRef<HTMLDivElement>(null)
  const [, bump] = useReducer((n: number) => n + 1, 0)

  // ─── 바뀌는 값은 ref로 들고, 그리기 루프가 읽는다 ───
  const props = useRef({ drops, ghost, selectedId, freshId, walkable, arrange, onArrangeSelect, onArrangeBlocked, onPlaceTap, onDropTap, onMailTap, onBackgroundTap })
  props.current = { drops, ghost, selectedId, freshId, walkable, arrange, onArrangeSelect, onArrangeBlocked, onPlaceTap, onDropTap, onMailTap, onBackgroundTap }
  const cb = useRef({ onMeMove, onMeAct, onMeArrive, onMeArea })
  cb.current = { onMeMove, onMeAct, onMeArrive, onMeArea }

  /** three.js 쪽 상태 (React가 다시 그려도 그대로) */
  const w = useRef<ReturnType<typeof createWorld> | null>(null)

  useEffect(() => {
    const host = hostEl.current!
    const world = createWorld(host, map, rooms, spawn, { look, name, badge }, props, cb, bump, overlayEl, bubbleEl)
    w.current = world
    setRef(controlRef, world.control)
    bump()
    return () => {
      setRef(controlRef, null)
      world.destroy()
      w.current = null
    }
    // 동네가 바뀌면(이웃이 늘면) 새로 짓는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  // 내 겉모습·이름
  useEffect(() => {
    w.current?.setMe({ look, name, badge })
  }, [look, name, badge])

  // 아이템 목록·고스트가 바뀌면 다시 놓는다
  useEffect(() => {
    w.current?.syncDrops()
  }, [drops, ghost, selectedId, freshId])

  useEffect(() => {
    w.current?.syncRooms(rooms)
  }, [rooms])

  // 배치 바꾸기를 끝내면(저장했든 아니든) 임시 자리를 버린다 — 저장했다면 위에서 받은 방 꾸미기에 이미 들어 있다
  const arrangeRoom = arrange?.roomId ?? null
  useEffect(() => {
    w.current?.setArrange(arrangeRoom)
  }, [arrangeRoom])


  const actors = w.current?.overlayList() ?? []

  return (
    <div ref={hostEl} className="world-stage" onContextMenu={(e) => e.preventDefault()}>
      <div ref={overlayEl} className="world-overlay">
        {actors.map((a) => (
          <div key={`tag-${a.id}`} data-tag={a.id} className={`tag ${a.badge ? `is-${a.badge}` : ''}`} style={{ display: 'none' }}>
            {a.badge === 'owner' && <b className="tag-badge">주인</b>}
            {a.name}
          </div>
        ))}
        {actors.map((a) =>
          a.say ? (
            <div key={a.say.key} data-say={a.id} className="say" style={{ display: 'none' }}>
              {a.say.text}
            </div>
          ) : null,
        )}
      </div>
      {bubble && (
        <div ref={bubbleEl} className="bubble" style={{ display: 'none' } as CSSProperties} onPointerDown={(e) => e.stopPropagation()}>
          {bubble}
        </div>
      )}
      <div className="world-fade" />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// three.js 세계 (React 바깥에서 돈다)
// ──────────────────────────────────────────────────────────────

type PropsRef = {
  current: {
    drops: Drop[]
    ghost?: Ghost | null
    selectedId?: string | null
    freshId?: string | null
    walkable: boolean
    arrange?: { roomId: string } | null
    onArrangeSelect?: (sel: ArrangeSel | null) => void
    onArrangeBlocked?: () => void
    onPlaceTap?: (t: PlaceTap | null) => void
    onDropTap?: (drop: Drop) => void
    onMailTap?: (roomId: string) => void
    onBackgroundTap?: () => void
  }
}
type CbRef = {
  current: {
    onMeMove?: Props['onMeMove']
    onMeAct?: Props['onMeAct']
    onMeArrive?: Props['onMeArrive']
    onMeArea?: Props['onMeArea']
  }
}

function createWorld(
  host: HTMLDivElement,
  map: TownMap,
  roomsInit: Map<string, Room>,
  spawn: { area: AreaId; at: Vec2 },
  meInfo: ActorInfo,
  props: PropsRef,
  cb: CbRef,
  rerender: () => void,
  overlayEl: { current: HTMLDivElement | null },
  bubbleEl: { current: HTMLDivElement | null },
) {
  let rooms = roomsInit
  const lotOf = (roomId: string) => map.lots.find((l) => l.roomId === roomId)

  // ─── 렌더러 ───
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.className = 'world-canvas'
  host.prepend(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 400)

  // 빛: 하늘빛 + 해(그림자) + 은은한 채움
  const hemi = new THREE.HemisphereLight('#e6f4ff', '#d8c3a5', 1.5)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight('#fff0d8', 2.6)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.03
  sun.shadow.radius = 4
  const sc = sun.shadow.camera
  sc.left = -18
  sc.right = 18
  sc.top = 18
  sc.bottom = -18
  sc.near = 1
  sc.far = 80
  scene.add(sun, sun.target)
  const fill = new THREE.DirectionalLight('#ffd9f0', 0.45)
  fill.position.set(-10, 8, 12)
  scene.add(fill)

  const fx = new FxLayer()
  scene.add(fx.group)

  // ─── 골목 / 집 안 ───
  let town: Town3D | null = buildTown3D(map, rooms)
  scene.add(town.group)
  let house: { roomId: string; h: House3D } | null = null
  const dropGroup = new THREE.Group()
  scene.add(dropGroup)
  const dropMeshes = new Map<string, THREE.Group>()
  /** 집 안 길찾기가 피해 갈 물건 (집이 바뀌거나 아이템이 바뀌면 다시 잰다) */
  let blocker: { roomId: string; fn: Blocker } | null = null
  let ghostMesh: THREE.Group | null = null
  let ghostKey = ''
  const lightObjs = new Map<string, THREE.PointLight>()
  const glowSprites = new Map<string, THREE.Sprite>()
  const streetLights: THREE.PointLight[] = []

  // 구름 (낮) · 별 (밤)
  const clouds = new THREE.Group()
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Group()
    for (let k = 0; k < 4; k++)
      c.add(part(new THREE.SphereGeometry(1.2 + (k % 2) * 0.5, 14, 10), mat('#ffffff', { rough: 1 }), [k * 1.3 - 2, (k % 2) * 0.5, (k % 3) * 0.4], { shadow: false }))
    c.position.set(map.bounds.minX + i * 14 - 10, 15 + (i % 3) * 2, -28 - (i % 2) * 8)
    clouds.add(c)
  }
  scene.add(clouds)
  const starGeo = new THREE.BufferGeometry()
  const starPos = new Float32Array(300 * 3)
  for (let i = 0; i < 300; i++) starPos.set([(Math.random() - 0.5) * 200, 20 + Math.random() * 40, -40 - Math.random() * 60], i * 3)
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#fff6d0', size: 0.35, sizeAttenuation: true }))
  scene.add(stars)

  let night = isNightKst()
  const applySky = (area: AreaId, dim: boolean) => {
    const dark = night || dim
    const inside = area !== TOWN
    scene.background = new THREE.Color(dark ? (inside ? '#262a4a' : '#1d2147') : inside ? '#f6e7d7' : '#bfe4ff')
    scene.fog = inside ? null : new THREE.Fog(dark ? '#1d2147' : '#cfeaff', 45, 110)
    hemi.intensity = dark ? 0.55 : 1.5
    hemi.color.set(dark ? '#8f9cff' : '#e6f4ff')
    sun.intensity = dark ? 0.55 : 2.6
    sun.color.set(dark ? '#a9b6ff' : '#fff0d8')
    fill.intensity = dark ? 0.15 : 0.45
    clouds.visible = !dark && !inside
    stars.visible = dark && !inside
    town?.setNight(dark)
    for (const l of streetLights) l.visible = dark && !inside
  }

  // ─── 미니미들 ───
  const actors = new Map<string, Actor>()
  const actorGroup = new THREE.Group()
  scene.add(actorGroup)

  const lookKey = (info: ActorInfo, outfit: number) => `${JSON.stringify(info.look)}|${outfit}`
  const newActor = (id: string, info: ActorInfo, area: AreaId, pos: Vec2): Actor => {
    const avatar = buildAvatar3D(info.look, 0)
    actorGroup.add(avatar.root)
    avatar.root.traverse((n) => (n.userData.actor = id))
    return {
      id,
      info,
      area,
      pos,
      yaw: 0,
      walk: null,
      act: null,
      actTimer: 0,
      outfit: 0,
      say: null,
      idle: null,
      idleTimer: 0,
      avatar,
      builtFor: lookKey(info, 0),
    }
  }
  const rebuildAvatar = (a: Actor) => {
    const k = lookKey(a.info, a.outfit)
    if (k === a.builtFor) return
    actorGroup.remove(a.avatar.root)
    a.avatar.dispose()
    a.avatar = buildAvatar3D(a.info.look, a.outfit)
    a.avatar.root.traverse((n) => (n.userData.actor = a.id))
    actorGroup.add(a.avatar.root)
    a.builtFor = k
  }
  const removeActorObj = (a: Actor) => {
    window.clearTimeout(a.actTimer)
    window.clearTimeout(a.idleTimer)
    actorGroup.remove(a.avatar.root)
    a.avatar.dispose()
  }

  const me = newActor('me', meInfo, spawn.area, spawn.at)
  // 처음엔 카메라 쪽을 본다
  me.yaw = spawn.area === TOWN ? 0 : Math.PI / 4
  actors.set('me', me)

  // ─── 카메라 ───
  const portraitK = () => {
    const r = host.getBoundingClientRect()
    const a = r.width / Math.max(1, r.height)
    return a < 0.8 ? 1.45 : 1.35
  }
  let cam: Cam = camDefault(spawn.area, spawn.at, portraitK())
  if (spawn.area === TOWN) cam.target.set(spawn.at.x, 0.6, spawn.at.z - 2.5)
  let follow = true
  let camAnim: { from: Cam; to: Cam; start: number; ms: number } | null = null

  const limits = () => (me.area === TOWN ? 'town' : 'house') as 'town' | 'house'
  const clampCam = (c: Cam, rubber = false) => {
    const l = limits()
    const off = c.yaw - YAW_CENTER[l]
    c.yaw = YAW_CENTER[l] + (rubber ? rubberTilt(off) : clampTilt(off))
    c.pitch = rubberPitch(c.pitch, rubber)
    c.dist = Math.min(DIST_LIMIT[l][1], Math.max(DIST_LIMIT[l][0], c.dist))
    if (l === 'town') {
      c.target.x = Math.min(map.bounds.maxX - 4, Math.max(map.bounds.minX + 4, c.target.x))
      c.target.z = Math.min(map.bounds.maxZ - 3, Math.max(map.bounds.minZ + 2, c.target.z))
    } else {
      const h = HOUSE_SIZE / 2
      c.target.x = Math.min(h, Math.max(-h, c.target.x))
      c.target.z = Math.min(h, Math.max(-h, c.target.z))
    }
    return c
  }
  const placeCamera = () => {
    const c = cam
    const off = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)).multiplyScalar(c.dist)
    camera.position.copy(c.target).add(off)
    camera.lookAt(c.target)
    // 해 그림자는 보는 곳을 따라간다
    sun.position.set(c.target.x + 9, 22, c.target.z + 12)
    sun.target.position.copy(c.target)
  }
  const animateCam = (to: Cam, ms = 500) => {
    camAnim = { from: { ...cam, target: cam.target.clone() }, to: clampCam(to), start: performance.now(), ms }
  }

  // ─── 크기 ───
  let width = 1
  let height = 1
  const resize = () => {
    const r = host.getBoundingClientRect()
    width = Math.max(1, r.width)
    height = Math.max(1, r.height)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    // 세로로 긴 휴대폰 화면은 조금 더 멀리서
    camera.fov = width / height < 0.8 ? 40 : 32
    camera.updateProjectionMatrix()
  }
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(host)

  // ─── 지금 있는 곳 그리기 ───
  const showArea = (area: AreaId) => {
    const rid = roomOfArea(area)
    if (town) town.group.visible = area === TOWN
    if (house && house.roomId !== rid) {
      scene.remove(house.h.group)
      disposeTree(house.h.group)
      house.h.dispose()
      house = null
    }
    if (rid && !house) {
      const room = rooms.get(rid)
      if (room) {
        const h = buildHouse3D(room.decor)
        // 누를 수 있게 가구마다 key를 그 집 기준으로
        for (const [id, g] of h.fixtures) g.traverse((n) => (n.userData.key = fixtureKey(rid, id)))
        h.group.traverse((n) => {
          if (n.name === COVER) n.visible = false
        })
        scene.add(h.group)
        house = { roomId: rid, h }
      }
    }
    for (const [k, l] of lightObjs) l.visible = keyArea(k) === area
    applySky(area, false)
    syncDrops()
  }

  const keyArea = (key: string): AreaId | null => {
    if (key.includes(KEY_SEP)) return houseArea(key.split(KEY_SEP)[0])
    const d = props.current.drops.find((x) => x.id === key)
    if (!d) return null
    return d.place === 'in' ? houseArea(d.roomId) : d.place === 'yard' ? TOWN : null
  }

  // ─── 배치: 방 주인이 옮긴 자리 (배치 바꾸는 중이면 임시 자리 먼저) ───
  const draft = new Map<string, Spot | null>()
  let draftRoom: string | null = null
  const spotFor = (rid: string, lkey: string): Spot | undefined => {
    if (draftRoom === rid && draft.has(lkey)) return draft.get(lkey) ?? undefined
    return rooms.get(rid)?.decor.layout?.[lkey]
  }
  const fixturePose = (rid: string, f: { id: string; u: number; v: number }) => {
    const s = spotFor(rid, f.id)
    return s ? { pos: uvToHouse({ u: s[0], v: s[1] }), yaw: s[2] } : { pos: fixtureWorld(f), yaw: fixtureFacing(f.id) }
  }

  const dropPos = (d: Drop): { area: AreaId; pos: Vec2 } | null => {
    if (d.place === 'mail') return null
    const s = spotFor(d.roomId, d.id)
    const uv = s ? { u: s[0], v: s[1] } : d
    if (d.place === 'yard') {
      const lot = lotOf(d.roomId)
      return lot ? { area: TOWN, pos: yardToTown(lot, uv) } : null
    }
    return { area: houseArea(d.roomId), pos: uvToHouse(uv) }
  }
  const dropYawOf = (d: Drop) => spotFor(d.roomId, d.id)?.[2] ?? dropYaw(d.id)

  const targetOf = (key: string): Target | null => {
    if (key.includes(KEY_SEP)) {
      const [rid, fid] = key.split(KEY_SEP)
      const f = FIXTURES.find((x) => x.id === fid)
      if (!f || !rooms.has(rid)) return null
      const p = fixturePose(rid, f)
      return { key, item: f.item, area: houseArea(rid), pos: p.pos, yaw: p.yaw }
    }
    const d = props.current.drops.find((x) => x.id === key)
    if (!d) return null
    const at = dropPos(d)
    if (!at) return null
    return { key, item: d.item, area: at.area, pos: at.pos, yaw: dropYawOf(d) }
  }

  /** 옮긴 자리를 지금 그려진 가구·아이템에 입힌다 */
  const applyLayout = () => {
    if (house)
      for (const [id, g] of house.h.fixtures) {
        const f = FIXTURES.find((x) => x.id === id)
        if (!f) continue
        const p = fixturePose(house.roomId, f)
        g.position.x = p.pos.x
        g.position.z = p.pos.z
        g.rotation.y = p.yaw
      }
    for (const [id, m] of dropMeshes) {
      const d = props.current.drops.find((x) => x.id === id)
      const at = d && dropPos(d)
      if (!d || !at) continue
      m.position.x = at.pos.x
      m.position.z = at.pos.z
      m.rotation.y = dropYawOf(d)
    }
    blocker = null
  }
  const dropYaw = (id: string) => {
    let h = 0
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0
    return Math.PI / 4 + ((h % 7) - 3) * 0.12
  }

  function syncDrops() {
    const list = props.current.drops
    const want = new Set<string>()
    for (const d of list) {
      const at = dropPos(d)
      if (!at || at.area !== me.area) continue
      want.add(d.id)
      if (!dropMeshes.has(d.id)) {
        const m = buildItem3D(d.item)
        if (!m) continue
        m.position.set(at.pos.x, 0, at.pos.z)
        m.rotation.y = dropYawOf(d)
        // 골목은 넓어서 마당 아이템은 조금 크게 (멀리서도 보이게)
        m.userData.size = at.area === TOWN ? 1.6 : 1
        m.scale.setScalar(m.userData.size)
        m.traverse((n) => {
          n.userData.drop = d.id
          n.userData.key = d.id
          if (n.name === COVER) n.visible = false
        })
        m.userData.spawn = d.id === props.current.freshId ? performance.now() : 0
        dropGroup.add(m)
        dropMeshes.set(d.id, m)
      }
    }
    for (const [id, m] of dropMeshes)
      if (!want.has(id)) {
        dropGroup.remove(m)
        disposeTree(m)
        dropMeshes.delete(id)
      }
    applyLayout()
    // 고스트
    const g = props.current.ghost
    const gk = g ? `${g.item}` : ''
    if (ghostMesh && (!g || gk !== ghostKey)) {
      scene.remove(ghostMesh)
      disposeTree(ghostMesh)
      ghostMesh = null
    }
    if (g && !ghostMesh) {
      const m = buildItem3D(g.item)
      if (m) {
        m.traverse((n) => {
          const mesh = n as THREE.Mesh
          if (!mesh.isMesh) return
          const src = mesh.material as THREE.MeshStandardMaterial
          const c = src.clone()
          c.transparent = true
          c.opacity = 0.6
          mesh.material = c
          mesh.castShadow = false
        })
        const ring = part(torus(0.5, 0.03), mat('#ff7f2a', { emissive: '#ff7f2a', glow: 0.8 }), [0, 0.03, 0], { rot: [Math.PI / 2, 0, 0], shadow: false })
        m.add(ring)
        ghostMesh = m
        ghostKey = gk
        scene.add(m)
      }
    }
    if (ghostMesh && g) {
      ghostMesh.visible = g.area === me.area
      ghostMesh.scale.setScalar(g.area === TOWN ? 1.6 : 1)
      ghostMesh.position.set(g.x, 0, g.z)
      ghostMesh.rotation.y = Math.PI / 4
    }
    // 우편함 깃발
    if (town) {
      const counts = new Map<string, number>()
      for (const d of list) if (d.place === 'mail') counts.set(d.roomId, (counts.get(d.roomId) ?? 0) + 1)
      for (const lot of map.lots) town.setMail(lot.roomId, counts.get(lot.roomId) ?? 0)
    }
  }

  // ─── 말·효과 ───
  const speak = (a: Actor, text: string, ms = 2600) => {
    a.say = { text, key: performance.now() + Math.random(), until: performance.now() + ms }
    rerender()
  }
  const headPos = (a: Actor) => {
    const o = a.avatar.root
    const v = new THREE.Vector3(0, a.avatar.height, 0)
    if (a.act?.phase === 'doing' && a.act.inter.pose === 'lie') v.set(0, 0.85, -0.95)
    return o.localToWorld(v)
  }
  const itemTop = (t: Target) => {
    const m = t.key.includes(KEY_SEP) ? house?.h.fixtures.get(t.key.split(KEY_SEP)[1]) : dropMeshes.get(t.key)
    if (m) {
      const box = new THREE.Box3().setFromObject(m)
      return new THREE.Vector3(t.pos.x, box.max.y + 0.1, t.pos.z)
    }
    return new THREE.Vector3(t.pos.x, 1, t.pos.z)
  }
  const burstFx = (f: Fx, a: Actor, t: Target) => {
    if (a.area !== me.area) return
    fx.burst(f, ON_HEAD.includes(f) ? headPos(a).add(new THREE.Vector3(0, 0.15, 0)) : itemTop(t), clock)
  }

  // ─── 걷기 ───
  const walkSpeed = (a: Actor) => (a.area === TOWN ? WALK_TOWN : WALK_HOUSE)
  // 집 안 가구·놓인 아이템은 뚫고 지나가지 않게 돌아간다 (지금 그려진 집만 안다)
  const blockerFor = (area: AreaId): Blocker | undefined => {
    const rid = roomOfArea(area)
    if (!rid || !house || house.roomId !== rid) return undefined
    if (blocker?.roomId !== rid) blocker = { roomId: rid, fn: obstacleBlocker(collectObstacles()) }
    return blocker.fn
  }
  const collectObstacles = (skip?: THREE.Object3D) => {
    const list: Obstacle[] = []
    const add = (o: THREE.Object3D) => {
      if (o === skip) return
      const f = footOf(o)
      // 러그·매트처럼 납작한 건 밟고 지나간다
      if (f && !f.flat) list.push(footAt(f, o.position.x, o.position.z, o.rotation.y))
    }
    if (house) for (const g of house.h.fixtures.values()) add(g)
    for (const m of dropMeshes.values()) if (me.area !== TOWN) add(m)
    return list
  }
  /** 물건 바닥 자리: 돌리기 전 기준 가운데 어긋남·반너비·반깊이 (한 번 재서 기억) */
  type Foot = { cx: number; cz: number; hw: number; hd: number; flat: boolean }
  const footBox = new THREE.Box3()
  const footOf = (o: THREE.Object3D): Foot | null => {
    const hit = o.userData.foot as Foot | null | undefined
    if (hit !== undefined) return hit
    const pos = o.position.clone()
    const yaw = o.rotation.y
    const scale = o.scale.x
    o.position.set(0, 0, 0)
    o.rotation.y = 0
    o.scale.setScalar((o.userData.size as number | undefined) ?? 1)
    o.updateMatrixWorld(true)
    footBox.setFromObject(o)
    o.position.copy(pos)
    o.rotation.y = yaw
    o.scale.setScalar(scale)
    o.updateMatrixWorld(true)
    const f = footBox.isEmpty()
      ? null
      : {
          cx: (footBox.min.x + footBox.max.x) / 2,
          cz: (footBox.min.z + footBox.max.z) / 2,
          hw: (footBox.max.x - footBox.min.x) / 2,
          hd: (footBox.max.z - footBox.min.z) / 2,
          flat: footBox.max.y < 0.12,
        }
    o.userData.foot = f
    return f
  }
  /** 그 자리·각도에 놓였을 때의 사각형 */
  const footAt = (f: Foot, x: number, z: number, yaw: number): Obstacle => ({
    x: x + f.cx * Math.cos(yaw) + f.cz * Math.sin(yaw),
    z: z - f.cx * Math.sin(yaw) + f.cz * Math.cos(yaw),
    hw: f.hw,
    hd: f.hd,
    yaw,
  })
  /** 사각형 위에 고르게 찍은 점들 (벽·다른 가구에 걸리는지 볼 때) */
  const footPoints = (o: Obstacle) => {
    const pts: Vec2[] = []
    const c = Math.cos(o.yaw)
    const s = Math.sin(o.yaw)
    const n = 5
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const a = (i / (n - 1) - 0.5) * 2 * Math.max(0, o.hw - 0.03)
        const b = (j / (n - 1) - 0.5) * 2 * Math.max(0, o.hd - 0.03)
        pts.push({ x: o.x + a * c + b * s, z: o.z - a * s + b * c })
      }
    return pts
  }

  const open = (area: AreaId, p: Vec2) => (area === TOWN ? nearestOpen(map, p) : nearestHouseOpen(p, blockerFor(area)))
  const pathIn = (area: AreaId, from: Vec2, to: Vec2) =>
    area === TOWN ? findTownPath(map, from, to) : findHouseWorldPath(from, to, blockerFor(area))

  const go = (a: Actor, dest: Vec2, onArrive?: () => void) => {
    const to = open(a.area, dest)
    const path = pathIn(a.area, a.pos, to)
    const pts = path.length ? path : [to]
    if (dist(a.pos, to) < 0.05) {
      a.walk = null
      onArrive?.()
      return to
    }
    a.walk = { pts, seg: 0, from: { ...a.pos }, speed: walkSpeed(a), onArrive }
    if (a.id === 'me') follow = true
    return to
  }

  const endAct = (a: Actor) => {
    window.clearTimeout(a.actTimer)
    const cur = a.act
    if (cur?.phase === 'doing' && cur.inter.leave) {
      burstFx(cur.inter.leave.fx, a, cur)
      speak(a, cur.inter.leave.line)
    }
    a.act = null
  }

  let marker: { mesh: THREE.Mesh; born: number } | null = null
  const showMarker = (p: Vec2) => {
    if (marker) scene.remove(marker.mesh)
    const m = part(torus(0.35, 0.04), mat('#ffffff', { emissive: '#ffffff', glow: 0.5, opacity: 0.9 }), [p.x, 0.08, p.z], { rot: [Math.PI / 2, 0, 0], shadow: false })
    scene.add(m)
    marker = { mesh: m, born: clock }
  }

  const meWalk = (p: Vec2) => {
    endAct(me)
    const from = { ...me.pos }
    const to = go(me, p)
    showMarker(to)
    cb.current.onMeMove?.(me.area, from, to)
  }

  // ─── 문 지나기 ───
  const fadeEl = () => host.querySelector<HTMLDivElement>('.world-fade')
  const changeArea = (a: Actor, area: AreaId, at: Vec2) => {
    a.walk = null
    endAct(a)
    a.area = area
    a.pos = { ...at }
    if (a.id === 'me') {
      a.yaw = area === TOWN ? 0 : Math.PI / 4
      const f = fadeEl()
      if (f) {
        f.classList.remove('is-on')
        void f.offsetWidth
        f.classList.add('is-on')
      }
      showArea(area)
      cam = camDefault(area, at, portraitK())
      camAnim = null
      follow = area === TOWN
      cb.current.onMeArea?.(area, at)
      rerender()
    }
  }

  const enterHouse = (a: Actor, roomId: string) => {
    const lot = lotOf(roomId)
    if (!lot || !rooms.has(roomId)) return
    const step = doorStep(lot)
    const inside = uvToHouse(HOUSE_ENTRANCE)
    const go_ = () => changeArea(a, houseArea(roomId), inside)
    if (a.area !== TOWN) return
    endAct(a)
    if (a.id === 'me') {
      const from = { ...a.pos }
      const to = go(a, step, go_)
      showMarker(to)
      cb.current.onMeMove?.(a.area, from, to)
    } else go(a, step, go_)
  }

  const leaveHouse = (a: Actor) => {
    const rid = roomOfArea(a.area)
    const lot = rid ? lotOf(rid) : undefined
    if (!lot) return
    const exitIn = uvToHouse({ u: HOUSE_EXIT.u, v: 0.95 })
    const out = doorStep(lot)
    endAct(a)
    const go_ = () => changeArea(a, TOWN, { x: out.x, z: out.z + 0.4 })
    if (a.id === 'me') {
      const from = { ...a.pos }
      const to = go(a, exitIn, go_)
      showMarker(to)
      cb.current.onMeMove?.(a.area, from, to)
    } else go(a, exitIn, go_)
  }

  // ─── 가구 쓰기 ───
  const lights = new Set<string>()
  const tvChannel = new Map<string, number>()
  const isLocal = (a: Actor) => a.id === 'me' || a.idle !== null

  const standSpot = (t: Target, inter: Interaction): Vec2 => {
    const fwd = { x: Math.sin(t.yaw), z: Math.cos(t.yaw) }
    const seated = inter.pose === 'sit' || inter.pose === 'lie' || inter.pose === 'bath'
    const d = seated ? itemDepth(t.item) * 0.7 + 0.35 : itemDepth(t.item) + (inter.pose === 'watch' ? 1.2 : 0.35)
    return open(t.area, { x: t.pos.x + fwd.x * d, z: t.pos.z + fwd.z * d })
  }

  const arrive = (a: Actor, t: Target, inter: Interaction) => {
    a.act = { ...t, inter, phase: 'doing', fxAt: 0 }
    if (a.id === 'me') cb.current.onMeArrive?.(t.key, t.item)
    // 그쪽을 본다
    if (inter.pose === 'sit' || inter.pose === 'lie' || inter.pose === 'bath') a.yaw = t.yaw
    else a.yaw = Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z)
    if (inter.pose === 'floor') a.yaw = Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z)
    if (inter.light) {
      const on = !lights.has(t.key)
      if (on) lights.add(t.key)
      else lights.delete(t.key)
      speak(a, on ? pickLine(inter) : '딸깍, 불 끄기')
    } else if (t.item === 'tv') {
      const ch = tvChannel.get(t.key) ?? 0
      speak(a, `CH${ch + 1} ${TV_CHANNELS[ch]} · ${pickLine(inter)}`)
    } else speak(a, pickLine(inter))
    if (inter.outfit) {
      a.outfit = (a.outfit + 1) % OUTFITS.length
      rebuildAvatar(a)
      burstFx('sparkle', a, t)
    }
    if (inter.ms) {
      window.clearTimeout(a.actTimer)
      a.actTimer = window.setTimeout(() => {
        a.act = null
        if (inter.flee && isLocal(a)) {
          const dx = a.pos.x - t.pos.x
          const dz = a.pos.z - t.pos.z
          const len = Math.hypot(dx, dz) || 1
          const dest = { x: a.pos.x + (dx / len) * 2.4, z: a.pos.z + (dz / len) * 2.4 }
          if (a.id === 'me') meWalk(dest)
          else go(a, dest)
        }
      }, inter.ms)
    }
  }

  const startAct = (a: Actor, t: Target) => {
    const inter = interactionFor(t.item)
    if (!inter || t.area !== a.area) return false
    const cur = a.act
    if (cur && cur.key === t.key) {
      if (cur.phase !== 'doing') return true
      if (a.id === 'me') cb.current.onMeArrive?.(t.key, t.item)
      if (t.item === 'tv') {
        const next = ((tvChannel.get(t.key) ?? 0) + 1) % TV_CHANNELS.length
        tvChannel.set(t.key, next)
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
    a.act = { ...t, inter, phase: 'going', fxAt: 0 }
    go(a, standSpot(t, inter), () => {
      if (a.act?.key === t.key) arrive(a, t, inter)
    })
    return true
  }

  const meAct = (t: Target) => {
    const from = { ...me.pos }
    if (startAct(me, t)) cb.current.onMeAct?.(me.area, t.key, from)
  }

  // ─── 혼자 노는 주인 미니미 ───
  const idleStep = (a: Actor) => {
    window.clearTimeout(a.idleTimer)
    if (!a.idle || !actors.has(a.id)) return
    const rid = a.idle
    a.idleTimer = window.setTimeout(
      () => {
        if (!a.idle) return
        if (!a.walk && a.act?.phase !== 'going') {
          if (Math.random() < 0.35) {
            endAct(a)
            const z = ZONES[Math.floor(Math.random() * ZONES.length)]
            go(a, uvToHouse({ u: z.spot.u + (Math.random() - 0.5) * 0.1, v: z.spot.v + (Math.random() - 0.5) * 0.1 }))
          } else {
            const key = fixtureKey(rid, IDLE_FIXTURES[Math.floor(Math.random() * IDLE_FIXTURES.length)])
            const t = targetOf(key)
            if (t && a.act?.key !== key) startAct(a, t)
          }
        }
        idleStep(a)
      },
      a.act ? 7000 + Math.random() * 7000 : 1500 + Math.random() * 2500,
    )
  }

  // ─── 누르기 ───
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  type Hit = { data: Record<string, unknown>; point: THREE.Vector3 | null; ground: Vec2 | null }
  const pick = (cx: number, cy: number): Hit => {
    const r = renderer.domElement.getBoundingClientRect()
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const roots: THREE.Object3D[] = [dropGroup, actorGroup]
    if (me.area === TOWN && town) roots.push(town.group)
    if (me.area !== TOWN && house) roots.push(house.h.group)
    const hits = raycaster.intersectObjects(roots, true)
    const gp = new THREE.Vector3()
    const g = raycaster.ray.intersectPlane(groundPlane, gp) ? { x: gp.x, z: gp.z } : null
    for (const h of hits) {
      if (!h.object.visible) continue
      const d = h.object.userData
      if (d.actor && d.actor !== 'me') continue
      if (d.actor === 'me') continue
      if (d.ground) return { data: {}, point: h.point, ground: { x: h.point.x, z: h.point.z } }
      if (d.drop || d.key || d.door || d.mail || d.exit || d.house) return { data: d, point: h.point, ground: g }
      // 벽·바닥 등: 바닥 판 위의 점
      return { data: {}, point: h.point, ground: g }
    }
    return { data: {}, point: null, ground: g }
  }

  const tap = (cx: number, cy: number, right = false) => {
    const p = props.current
    // 배치 바꾸는 중: 빈 곳을 누르면 고른 걸 놓아 준다 (걷지 않는다)
    if (draftRoom) {
      if (!right) setSel(null)
      return
    }
    const hit = pick(cx, cy)
    // 놓기 모드
    if (p.onPlaceTap) {
      if (hit.data.mail && typeof hit.data.mail === 'string') return p.onPlaceTap({ place: 'mail', roomId: hit.data.mail })
      const g = hit.ground
      if (!g) return p.onPlaceTap(null)
      if (me.area === TOWN) {
        const y = lotAtYard(map.lots, g)
        if (!y) return p.onPlaceTap(null)
        const at = yardToTown(y.lot, y.uv)
        return p.onPlaceTap({ place: 'yard', roomId: y.lot.roomId, u: y.uv.u, v: y.uv.v, area: TOWN, x: at.x, z: at.z })
      }
      const rid = roomOfArea(me.area)!
      const f = nearestHouseOpen(g)
      const uv = { u: f.x / HOUSE_SIZE + 0.5, v: f.z / HOUSE_SIZE + 0.5 }
      return p.onPlaceTap({ place: 'in', roomId: rid, u: uv.u, v: uv.v, area: me.area, x: f.x, z: f.z })
    }
    const d = hit.data
    if (!right) {
      if (typeof d.mail === 'string') {
        p.onBackgroundTap?.()
        if (p.walkable) go(me, { x: mailboxSpot(lotOf(d.mail)!).x - 0.2, z: mailboxSpot(lotOf(d.mail)!).z + 0.9 })
        p.onMailTap?.(d.mail)
        return
      }
      if (typeof d.drop === 'string') {
        const drop = p.drops.find((x) => x.id === d.drop)
        if (drop) {
          if (p.onDropTap) p.onDropTap(drop)
          else if (p.walkable) {
            const t = targetOf(drop.id)
            if (t) meAct(t)
          }
          return
        }
      }
      if (p.walkable && typeof d.key === 'string' && d.key.includes(KEY_SEP)) {
        p.onBackgroundTap?.()
        const t = targetOf(d.key)
        if (t) meAct(t)
        return
      }
      if (p.walkable && d.exit) {
        p.onBackgroundTap?.()
        leaveHouse(me)
        return
      }
      if (p.walkable && (typeof d.door === 'string' || typeof d.house === 'string')) {
        p.onBackgroundTap?.()
        const rid = (d.door ?? d.house) as string
        enterHouse(me, rid)
        return
      }
    }
    p.onBackgroundTap?.()
    if (p.walkable && hit.ground) meWalk(hit.ground)
  }

  // ─── 배치 바꾸기: 내 물건을 끌어 옮기고 돌린다 ───
  type Sel = {
    lkey: string
    obj: THREE.Object3D
    item: string
    drop: Drop | null
    /** 다른 물건 자리 (고른 동안엔 안 움직이니 한 번만 잰다) */
    others: Obstacle[]
    /** 마지막으로 놓을 수 있던 자리 (못 놓는 곳에서 손을 떼면 여기로 돌아간다) */
    last: { x: number; z: number; yaw: number }
  }
  let sel: Sel | null = null
  let grab: { id: number; dx: number; dz: number; ok: boolean } | null = null
  const ringMat = new THREE.MeshBasicMaterial({ color: '#35c46f', transparent: true, opacity: 0.9, depthWrite: false })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 56), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.renderOrder = 3
  ring.visible = false
  scene.add(ring)
  const showRing = (ok = true) => {
    if (!sel) {
      ring.visible = false
      return
    }
    const f = footOf(sel.obj)
    const o = f ? footAt(f, sel.obj.position.x, sel.obj.position.z, sel.obj.rotation.y) : { x: sel.obj.position.x, z: sel.obj.position.z, hw: 0.3, hd: 0.3 }
    ring.position.set(o.x, 0.03, o.z)
    ring.scale.setScalar(Math.hypot(o.hw, o.hd) + 0.12)
    ringMat.color.set(ok ? '#35c46f' : '#ff5a5a')
    ring.visible = true
  }
  const setSel = (next: Sel | null) => {
    sel = next
    props.current.onArrangeSelect?.(next ? { key: next.lkey, item: next.item, drop: !!next.drop } : null)
    showRing()
  }
  const newSel = (lkey: string, obj: THREE.Object3D, item: string, drop: Drop | null): Sel => {
    let others: Obstacle[]
    if (me.area === TOWN) {
      // 마당에서는 같은 집 마당의 다른 아이템만
      others = []
      for (const [id, m] of dropMeshes) {
        const dd = props.current.drops.find((x) => x.id === id)
        if (m === obj || !dd || dd.roomId !== drop?.roomId) continue
        const f = footOf(m)
        if (f && !f.flat) others.push(footAt(f, m.position.x, m.position.z, m.rotation.y))
      }
    } else others = collectObstacles(obj)
    return { lkey, obj, item, drop, others, last: { x: obj.position.x, z: obj.position.z, yaw: obj.rotation.y } }
  }
  /** 배치 바꾸는 중에 누른 게 옮길 수 있는 내 물건인지 (집 안 가구·아이템, 골목에선 내 마당 아이템) */
  const editableOf = (d: Record<string, unknown>): Sel | null => {
    const rid = draftRoom
    if (!rid) return null
    if (typeof d.drop === 'string') {
      const drop = props.current.drops.find((x) => x.id === d.drop)
      const obj = dropMeshes.get(d.drop)
      if (!drop || !obj || drop.roomId !== rid) return null
      if (!((drop.place === 'in' && me.area === houseArea(rid)) || (drop.place === 'yard' && me.area === TOWN))) return null
      return newSel(drop.id, obj, drop.item, drop)
    }
    if (typeof d.key === 'string' && d.key.includes(KEY_SEP) && house && me.area === houseArea(rid)) {
      const [r, fid] = d.key.split(KEY_SEP)
      const obj = house.h.fixtures.get(fid)
      const f = FIXTURES.find((x) => x.id === fid)
      if (r !== rid || !obj || !f) return null
      return newSel(fid, obj, f.item, null)
    }
    return null
  }
  /** 물건을 정확히 못 눌러도 그 물건 바닥 자리 근처를 누르면 잡힌다 (작은 아이템·풍선처럼 위에 떠 있는 것) */
  const editableNear = (g: THREE.Vector3 | null): Sel | null => {
    if (!g || !draftRoom) return null
    let best: { d: number; data: Record<string, unknown> } | null = null
    const consider = (o: THREE.Object3D, data: Record<string, unknown>) => {
      const f = footOf(o)
      if (!f) return
      const box = footAt(f, o.position.x, o.position.z, o.rotation.y)
      if (!insideObstacle([box], { x: g.x, z: g.z }, 0.25)) return
      const d = Math.hypot(box.x - g.x, box.z - g.z)
      if (!best || d < best.d) best = { d, data }
    }
    if (house && me.area === houseArea(draftRoom)) for (const [id, o] of house.h.fixtures) consider(o, { key: fixtureKey(draftRoom, id) })
    for (const [id, o] of dropMeshes) consider(o, { drop: id })
    return best ? editableOf((best as { data: Record<string, unknown> }).data) : null
  }
  /** 그 자리·각도에 놓을 수 있나: 집 밖·칸막이벽·현관 앞·다른 물건과 겹치면 안 된다 (마당은 그 집 마당 안) */
  const canPlace = (sl: Sel, x: number, z: number, yaw: number) => {
    const f = footOf(sl.obj)
    if (!f) return true
    const o = footAt(f, x, z, yaw)
    const pts = footPoints(o)
    if (sl.drop?.place === 'yard') {
      const lot = lotOf(sl.drop.roomId)
      if (!lot || pts.some((p) => !townToYard(lot, p))) return false
    } else {
      const door = uvToHouse(HOUSE_ENTRANCE)
      if (pts.some((p) => hitsWall(houseToUv(p)) || Math.hypot(p.x - door.x, p.z - door.z) < 0.6)) return false
    }
    if (f.flat) return true
    if (pts.some((p) => insideObstacle(sl.others, p))) return false
    // 작은 물건이 큰 물건 아래로 쏙 들어가는 것도 막는다
    for (const other of sl.others) if (footPoints(other).some((p) => insideObstacle([o], p))) return false
    return true
  }
  /** 지금 자리를 임시 배치에 적는다 */
  const pinSel = (sl: Sel) => {
    const { x, z } = sl.obj.position
    const yaw = sl.obj.rotation.y
    let uv: { u: number; v: number } | null
    if (sl.drop?.place === 'yard') {
      const lot = lotOf(sl.drop.roomId)
      uv = lot ? townToYard(lot, { x, z }) : null
    } else uv = houseToUv({ x, z })
    if (!uv) return
    draft.set(sl.lkey, makeSpot(uv.u, uv.v, yaw))
    sl.last = { x, z, yaw }
    blocker = null
  }
  const ground0 = (cx: number, cy: number) => {
    const r = el.getBoundingClientRect()
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const v = new THREE.Vector3()
    return raycaster.ray.intersectPlane(groundPlane, v)
  }
  /** 끌던 물건을 마지막으로 놓을 수 있던 자리로 */
  const dropGrab = (revert: boolean) => {
    if (!grab || !sel) return (grab = null)
    sel.obj.position.y = 0
    if (revert || !grab.ok) {
      sel.obj.position.x = sel.last.x
      sel.obj.position.z = sel.last.z
      if (!grab.ok && !revert) props.current.onArrangeBlocked?.()
    }
    grab = null
    showRing()
  }

  // ─── 포인터 ───
  type Press = { x: number; y: number; cam: Cam; dragging: boolean; right: boolean }
  let press: Press | null = null
  const pointers = new Map<number, { x: number; y: number }>()
  let pinch: { d: number; angle: number; cam: Cam } | null = null
  const el = renderer.domElement
  el.style.touchAction = 'none'

  const groundAt = (cx: number, cy: number) => {
    const r = el.getBoundingClientRect()
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const v = new THREE.Vector3()
    return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -cam.target.y), v) ? v : null
  }

  const onDown = (e: PointerEvent) => {
    const right = e.button === 2
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    el.setPointerCapture(e.pointerId)
    camAnim = null
    if (grab && pointers.size >= 2) dropGrab(true)
    // 배치 바꾸기: 내 물건을 잡으면 끌어 옮긴다 (빈 곳을 끌면 평소처럼 둘러보기)
    if (draftRoom && !right && pointers.size === 1) {
      const s = editableOf(pick(e.clientX, e.clientY).data) ?? editableNear(ground0(e.clientX, e.clientY))
      const g = s && ground0(e.clientX, e.clientY)
      if (s && g) {
        setSel(s)
        grab = { id: e.pointerId, dx: s.obj.position.x - g.x, dz: s.obj.position.z - g.z, ok: true }
        s.obj.position.y = 0.06
        press = null
        return
      }
    }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, angle: Math.atan2(b.y - a.y, b.x - a.x), cam: { ...cam, target: cam.target.clone() } }
      if (press) press.dragging = true
      return
    }
    press = { x: e.clientX, y: e.clientY, cam: { ...cam, target: cam.target.clone() }, dragging: false, right }
  }
  const onMove = (e: PointerEvent) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (grab && sel && e.pointerId === grab.id) {
      const g = ground0(e.clientX, e.clientY)
      if (!g) return
      const x = g.x + grab.dx
      const z = g.z + grab.dz
      sel.obj.position.x = x
      sel.obj.position.z = z
      grab.ok = canPlace(sel, x, z, sel.obj.rotation.y)
      if (grab.ok) pinSel(sel)
      showRing(grab.ok)
      return
    }
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      cam.dist = pinch.cam.dist * (pinch.d / Math.max(10, d))
      cam.yaw = pinch.cam.yaw - twist(pinch.angle, ang) * ROTATE_GAIN
      clampCam(cam, true)
      follow = false
      return
    }
    const p = press
    if (!p) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    if (!p.dragging) {
      if (Math.hypot(dx, dy) <= TAP_SLOP) return
      p.dragging = true
    }
    follow = false
    if (p.right) {
      // 우클릭 드래그: 좌우로 끌면 2D 때처럼 일정 범위 안에서 돌고, 위아래로 끌면 기울어진다
      // 위아래로 끌면 내려다보는 각도가 바뀐다 (아래로 끌면 더 위에서 내려다본다 — 보통 3D 뷰어와 같은 방향)
      cam.yaw = p.cam.yaw - dx * DRAG_TURN
      cam.pitch = p.cam.pitch + dy * DRAG_TURN
      clampCam(cam, true)
      return
    }
    // 바닥을 잡고 끄는 느낌: 처음 잡은 바닥 점이 손가락을 따라온다
    const k = (cam.dist * Math.tan((camera.fov * Math.PI) / 360) * 2) / height
    const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw))
    const fwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw))
    cam.target.copy(p.cam.target).addScaledVector(right, -dx * k).addScaledVector(fwd, (dy * k) / Math.sin(cam.pitch))
    clampCam(cam)
  }
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId)
    if (grab && e.pointerId === grab.id) {
      dropGrab(false)
      return
    }
    if (pinch) {
      if (pointers.size < 2) {
        pinch = null
        settleYaw()
      }
      press = null
      return
    }
    const p = press
    press = null
    if (!p) return
    if (p.dragging) {
      if (p.right) settleYaw()
      return
    }
    tap(e.clientX, e.clientY, p.right)
  }
  const onCancel = (e: PointerEvent) => {
    pointers.delete(e.pointerId)
    dropGrab(true)
    pinch = null
    press = null
    settleYaw()
  }
  /** 범위를 넘겨 돌린 채 놓으면 끝 각도로 부드럽게 돌아온다 */
  const settleYaw = () => {
    const to = clampCam({ ...cam, target: cam.target.clone() })
    if (Math.abs(to.yaw - cam.yaw) > 1e-4 || Math.abs(to.pitch - cam.pitch) > 1e-4) animateCam(to, 260)
  }
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const before = groundAt(e.clientX, e.clientY)
    cam.dist *= Math.exp(e.deltaY * 0.0012)
    clampCam(cam)
    placeCamera()
    const after = groundAt(e.clientX, e.clientY)
    if (before && after) {
      cam.target.add(before.sub(after).setY(0))
      clampCam(cam)
      follow = false
    }
  }
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onCancel)
  el.addEventListener('wheel', onWheel, { passive: false })

  // ─── 매 프레임 ───
  let clock = 0
  let last = performance.now()
  let raf = 0
  let running = true
  const tmp = new THREE.Vector3()

  const stepWalk = (a: Actor, dt: number) => {
    const wk = a.walk
    if (!wk) return
    let left = wk.speed * dt
    while (left > 0 && wk.seg < wk.pts.length) {
      const to = wk.pts[wk.seg]
      const dx = to.x - a.pos.x
      const dz = to.z - a.pos.z
      const d = Math.hypot(dx, dz)
      if (d > 1e-4) a.yaw = lerpAngle(a.yaw, Math.atan2(dx, dz), Math.min(1, dt * 14))
      if (d <= left) {
        a.pos = { ...to }
        left -= d
        wk.seg++
      } else {
        a.pos = { x: a.pos.x + (dx / d) * left, z: a.pos.z + (dz / d) * left }
        left = 0
      }
    }
    if (wk.seg >= wk.pts.length) {
      a.walk = null
      wk.onArrive?.()
    }
  }

  const project = (v: THREE.Vector3) => {
    tmp.copy(v).project(camera)
    return { x: (tmp.x * 0.5 + 0.5) * width, y: (-tmp.y * 0.5 + 0.5) * height, behind: tmp.z > 1 }
  }

  const frame = (now: number) => {
    raf = 0
    if (!running) return
    const raw = Math.max(0, (now - last) / 1000)
    const dt = Math.min(0.05, raw)
    // 걷기는 실제 흐른 시간대로 (느린 기기에서도 같은 속도로 도착한다)
    const walkDt = Math.min(0.5, raw)
    last = now
    clock += dt

    // 카메라
    if (camAnim) {
      const k = Math.min(1, (now - camAnim.start) / camAnim.ms)
      const e = 1 - (1 - k) ** 3
      const f = camAnim.from
      const t = camAnim.to
      cam.target.lerpVectors(f.target, t.target, e)
      cam.yaw = f.yaw + (t.yaw - f.yaw) * e
      cam.pitch = f.pitch + (t.pitch - f.pitch) * e
      cam.dist = f.dist + (t.dist - f.dist) * e
      if (k >= 1) camAnim = null
    } else if (follow && me.area === TOWN) {
      const k = 1 - Math.exp(-dt * 3)
      cam.target.x += (me.pos.x - cam.target.x) * k
      cam.target.z += (me.pos.z + 0.5 - cam.target.z) * k
      clampCam(cam)
    }
    placeCamera()

    // 걷기 · 자세
    const doingOn = new Map<string, Actor[]>()
    let dim = false
    for (const a of actors.values()) {
      stepWalk(a, walkDt)
      const doing = a.act?.phase === 'doing' ? a.act : null
      if (doing) doingOn.set(doing.key, [...(doingOn.get(doing.key) ?? []), a])
      const root = a.avatar.root
      root.visible = a.area === me.area
      const pose = doing?.inter.pose ?? null
      let y = 0
      let px = a.pos.x
      let pz = a.pos.z
      root.rotation.set(0, a.yaw, 0, 'YXZ')
      let knee: number | undefined
      if (doing && (pose === 'sit' || pose === 'lie' || pose === 'bath')) {
        // 미니미는 앉으면 엉덩이, 누우면 등이 발밑 높이에 오게 자세를 잡는다 → 닿는 면 높이에 그대로 둔다
        const seat = SEAT[doing.item] ?? 0.45
        const fwd = { x: Math.sin(doing.yaw), z: Math.cos(doing.yaw) }
        const off = pose === 'lie' ? LIE_FORWARD : (SEAT_FORWARD[doing.item] ?? 0)
        px = doing.pos.x + fwd.x * off
        pz = doing.pos.z + fwd.z * off
        y = seat
        knee = SEAT_KNEE[doing.item]
      }
      if (doing?.inter.flee) y += Math.abs(Math.sin(clock * 14)) * 0.25
      root.position.set(px, y, pz)
      a.avatar.animate({ walking: !!a.walk, pose: a.walk ? null : pose, t: clock + a.id.length, knee })
      // 효과
      if (doing && a.area === me.area && clock >= doing.fxAt) {
        doing.fxAt = clock + 1.1
        for (const f of doing.inter.fx) burstFx(f, a, doing)
      }
      if (doing && a.area === me.area && doing.inter.fx.includes('night')) dim = true
      if (a.say && performance.now() > a.say.until) {
        a.say = null
        rerender()
      }
    }

    // 가구 상태: 이불·욕조 물, TV 화면, 움직임, 디스코
    const motionTargets: [THREE.Object3D, Activity][] = []
    const forEachThing = (fn: (key: string, o: THREE.Object3D) => void) => {
      if (house) for (const [id, g] of house.h.fixtures) fn(fixtureKey(house.roomId, id), g)
      for (const [id, g] of dropMeshes) fn(id, g)
    }
    let discoAt: THREE.Vector3 | null = null
    forEachThing((key, o) => {
      const users = doingOn.get(key) ?? []
      const act = users[0]?.act
      o.traverse((n) => {
        if (n.name === COVER) n.visible = users.some((u) => u.act?.inter.pose === 'lie' || u.act?.inter.pose === 'bath')
        // 누우면 발치에 개어 둔 이불을 펴서 덮는다
        if (n.name === 'blanket') n.visible = !users.some((u) => u.act?.inter.pose === 'lie')
        if (n.name === SCREEN) {
          const m = (n as THREE.Mesh).material as THREE.MeshStandardMaterial
          const on = users.length > 0
          const ch = tvChannel.get(key) ?? 0
          m.emissive.set(on ? TV_COLORS[ch % TV_COLORS.length] : '#000000')
          m.emissiveIntensity = on ? 0.9 + Math.sin(clock * 9) * 0.15 : 0
        }
        if (n.name === BULB) {
          const m = (n as THREE.Mesh).material as THREE.MeshStandardMaterial
          m.emissiveIntensity = lights.has(key) ? 3 : 0
        }
        if (n.name === 'spin' && act) n.rotation.y += dt * 3
      })
      if (act?.inter.motion) motionTargets.push([o, act])
      else if (o.userData.base) {
        o.position.y = 0
        o.rotation.z = 0
        o.scale.setScalar((o.userData.size as number | undefined) ?? 1)
      }
      if (act?.inter.fx.includes('disco')) discoAt = o.position.clone()
      // 막 놓인 아이템은 톡 튀어나온다
      const sp = o.userData.spawn as number | undefined
      if (sp) {
        const k = Math.min(1, (now - sp) / 600)
        o.scale.setScalar(((o.userData.size as number | undefined) ?? 1) * (k < 1 ? 0.3 + 0.7 * easeOutBack(k) : 1))
        if (k >= 1) o.userData.spawn = 0
      }
    })
    for (const [o, act] of motionTargets) {
      o.userData.base = true
      const m = act.inter.motion
      if (m === 'shake') o.rotation.z = Math.sin(clock * 40) * 0.04
      if (m === 'hop') o.position.y = Math.abs(Math.sin(clock * 8)) * 0.15
      if (m === 'float') o.position.y = 0.1 + Math.sin(clock * 2) * 0.08
      if (m === 'glow') o.scale.setScalar(((o.userData.size as number | undefined) ?? 1) * (1 + Math.sin(clock * 6) * 0.05))
    }

    // 스탠드 불빛 · TV 불빛 · 디스코
    for (const key of lights) {
      if (keyArea(key) !== me.area) continue
      const t = targetOf(key)
      if (!t) continue
      let l = lightObjs.get(key)
      if (!l) {
        l = new THREE.PointLight('#ffd27a', 6, 7, 1.6)
        lightObjs.set(key, l)
        scene.add(l)
      }
      l.position.set(t.pos.x, 1.5, t.pos.z)
      l.visible = true
    }
    for (const [key, l] of lightObjs)
      if (!lights.has(key) || keyArea(key) !== me.area) {
        scene.remove(l)
        l.dispose()
        lightObjs.delete(key)
      }
    const tvGlowKeys = new Set<string>()
    for (const [key, users] of doingOn) {
      if (!users[0].act?.inter.fx.includes('tv') || users[0].area !== me.area) continue
      tvGlowKeys.add(key)
      let s = glowSprites.get(key)
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#9fdcff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
        s.scale.set(3.2, 2.2, 1)
        glowSprites.set(key, s)
        scene.add(s)
      }
      const t = users[0].act!
      s.position.set(t.pos.x + Math.sin(t.yaw) * 0.6, 1.0, t.pos.z + Math.cos(t.yaw) * 0.6)
      ;(s.material as THREE.SpriteMaterial).opacity = 0.45 + Math.sin(clock * 11) * 0.1
      ;(s.material as THREE.SpriteMaterial).color.set(TV_COLORS[(tvChannel.get(key) ?? 0) % TV_COLORS.length])
    }
    for (const [key, s] of glowSprites)
      if (!tvGlowKeys.has(key)) {
        scene.remove(s)
        s.material.dispose()
        glowSprites.delete(key)
      }
    if (discoAt) {
      if (!disco) {
        disco = [0, 1, 2].map((i) => {
          const l = new THREE.PointLight(['#ff5c8a', '#7fc8ff', '#ffd94a'][i], 10, 9, 1.4)
          scene.add(l)
          return l
        })
      }
      disco.forEach((l, i) => {
        const a = clock * 2.4 + (i * Math.PI * 2) / 3
        l.position.set(discoAt!.x + Math.cos(a) * 2, 2.2, discoAt!.z + Math.sin(a) * 2)
      })
    } else if (disco) {
      for (const l of disco) {
        scene.remove(l)
        l.dispose()
      }
      disco = null
    }

    // 밤 (누가 자면 집 안 불이 꺼진다)
    if (dim !== dimmed || night !== lastNight) {
      dimmed = dim
      lastNight = night
      applySky(me.area, dim)
    }

    // 걸음 표시 링
    if (marker) {
      const k = (clock - marker.born) / 0.6
      if (k >= 1) {
        scene.remove(marker.mesh)
        marker = null
      } else {
        marker.mesh.scale.setScalar(1 - k * 0.6)
        ;(marker.mesh.material as THREE.MeshStandardMaterial).opacity = 1 - k
      }
    }
    if (ghostMesh) ghostMesh.position.y = 0.05 + Math.sin(clock * 4) * 0.04
    clouds.children.forEach((c, i) => {
      c.position.x += dt * (0.3 + (i % 3) * 0.1)
      if (c.position.x > map.bounds.maxX + 30) c.position.x = map.bounds.minX - 30
    })

    fx.update(clock, dt)
    renderer.render(scene, camera)

    // 이름표 · 말풍선 · 아이템 말풍선 (화면 좌표로)
    const ov = overlayEl.current
    if (ov) {
      for (const a of actors.values()) {
        const tag = ov.querySelector<HTMLDivElement>(`[data-tag="${a.id}"]`)
        const say = ov.querySelector<HTMLDivElement>(`[data-say="${a.id}"]`)
        const show = a.area === me.area && (actors.size > 1 || a.id !== 'me')
        const head = headPos(a)
        const s = project(head.add(new THREE.Vector3(0, 0.12, 0)))
        if (tag) {
          tag.style.display = show && a.info.name && !s.behind ? '' : 'none'
          tag.style.left = `${s.x}px`
          tag.style.top = `${s.y}px`
        }
        if (say) {
          say.style.display = a.area === me.area && !s.behind ? '' : 'none'
          say.style.left = `${Math.min(width - 60, Math.max(60, s.x))}px`
          say.style.top = `${s.y - (show && a.info.name ? 18 : 0)}px`
        }
      }
    }
    const bub = bubbleEl.current
    const sel = props.current.selectedId
    if (bub) {
      const m = sel ? dropMeshes.get(sel) : undefined
      if (m) {
        const box = new THREE.Box3().setFromObject(m)
        const s = project(new THREE.Vector3(m.position.x, box.max.y + 0.15, m.position.z))
        const left = Math.min(width - 100, Math.max(100, s.x))
        bub.style.display = s.behind ? 'none' : ''
        bub.style.left = `${left}px`
        bub.style.top = `${Math.max(110, s.y)}px`
        bub.style.setProperty('--tail', `${s.x - left}px`)
      } else bub.style.display = 'none'
    }

    raf = requestAnimationFrame(frame)
  }
  let disco: THREE.PointLight[] | null = null
  let dimmed = false
  let lastNight = night

  // 밤낮은 1분마다 확인
  const nightTimer = window.setInterval(() => {
    night = isNightKst()
  }, 60000)

  // 가로등 (밤에만): 몇 개만 진짜 빛을 단다
  if (town)
    for (const h of town.lampHeads.slice(0, 8)) {
      const l = new THREE.PointLight('#ffcf7a', 14, 10, 1.5)
      l.position.copy(h)
      l.visible = false
      streetLights.push(l)
      scene.add(l)
    }

  const onVis = () => {
    if (document.hidden) {
      running = false
      cancelAnimationFrame(raf)
      raf = 0
    } else if (!running) {
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
  }
  document.addEventListener('visibilitychange', onVis)

  showArea(me.area)
  placeCamera()
  raf = requestAnimationFrame(frame)

  // ─── 바깥에서 시키는 것 ───
  const control: WorldControl = {
    interactDrop: (id) => {
      const t = targetOf(id)
      if (!t) return
      if (t.area !== me.area) {
        // 다른 곳에 있으면 거기로 먼저 간다 (집 안 아이템이면 그 집으로)
        const rid = roomOfArea(t.area)
        if (rid && me.area === TOWN) enterHouse(me, rid)
        return
      }
      meAct(t)
    },
    upsertActor: (id, info, area, at) => {
      const a = actors.get(id)
      if (a) {
        a.info = info
        rebuildAvatar(a)
      } else {
        const ar = area ?? TOWN
        const p = at ?? (ar === TOWN ? gateOfHost() : uvToHouse(HOUSE_ENTRANCE))
        actors.set(id, newActor(id, info, ar, open(ar, p)))
      }
      rerender()
    },
    removeActor: (id) => {
      const a = actors.get(id)
      if (!a || id === 'me') return
      removeActorObj(a)
      actors.delete(id)
      rerender()
    },
    moveActor: (id, area, from, to) => {
      const a = actors.get(id)
      if (!a || id === 'me') return
      if (a.area !== area) {
        a.area = area
        a.pos = { ...from }
      } else if (dist(a.pos, from) > SNAP) a.pos = { ...from }
      endAct(a)
      go(a, to)
    },
    actActor: (id, area, key, from) => {
      const a = actors.get(id)
      const t = targetOf(key)
      if (!a || !t || id === 'me') return
      if (a.area !== area) {
        a.area = area
        a.pos = { ...from }
      } else if (dist(a.pos, from) > SNAP) a.pos = { ...from }
      startAct(a, t)
    },
    areaActor: (id, area, at) => {
      const a = actors.get(id)
      if (!a || id === 'me') return
      changeArea(a, area, at)
      rerender()
    },
    sayActor: (id, text) => {
      const a = actors.get(id)
      if (a) speak(a, text, Math.min(6000, 2600 + text.length * 80))
    },
    setNpc: (roomId, info) => {
      const id = `npc:${roomId}`
      const cur = actors.get(id)
      if (!info) {
        if (cur) {
          removeActorObj(cur)
          actors.delete(id)
          rerender()
        }
        return
      }
      if (cur) {
        cur.info = info
        rebuildAvatar(cur)
        return
      }
      const a = newActor(id, info, houseArea(roomId), uvToHouse({ u: 0.3, v: 0.36 }))
      a.idle = roomId
      actors.set(id, a)
      idleStep(a)
      rerender()
    },
    snapshot: () => ({
      area: me.area,
      at: me.walk ? me.walk.pts[me.walk.pts.length - 1] : me.pos,
      act: me.act?.phase === 'doing' ? me.act.key : null,
      outfit: me.outfit,
      room: { lights: [...lights], tv: Object.fromEntries(tvChannel) },
    }),
    placeActor: (id, area, at, act, outfit) => {
      const a = actors.get(id)
      if (!a || id === 'me') return
      window.clearTimeout(a.actTimer)
      a.walk = null
      a.area = area
      a.pos = open(area, at)
      if (a.outfit !== outfit) {
        a.outfit = outfit
        rebuildAvatar(a)
      }
      const t = act ? targetOf(act) : null
      const inter = t && interactionFor(t.item)
      a.act = t && inter && !inter.ms && t.area === area ? { ...t, inter, phase: 'doing', fxAt: 0 } : null
    },
    applyRoom: (room) => {
      lights.clear()
      for (const k of room.lights) if (typeof k === 'string' && targetOf(k)) lights.add(k)
      tvChannel.clear()
      for (const [k, v] of Object.entries(room.tv ?? {}))
        if (typeof v === 'number') tvChannel.set(k, Math.max(0, Math.min(TV_CHANNELS.length - 1, v | 0)))
    },
    focusDrop: (id) => {
      const t = targetOf(id)
      if (!t || t.area !== me.area) return false
      follow = false
      animateCam({ ...cam, target: new THREE.Vector3(t.pos.x, 0.4, t.pos.z), dist: Math.min(cam.dist, 14) })
      return true
    },
    goOut: () => {
      if (me.area !== TOWN) leaveHouse(me)
    },
    goHouse: (rid) => {
      if (me.area === TOWN) enterHouse(me, rid)
      else if (roomOfArea(me.area) !== rid) {
        // 다른 집 안이면 먼저 나간다
        leaveHouse(me)
      }
    },
    capture: () => {
      const W = 1320
      const H = 960
      const prev = { w: width, h: height, fov: camera.fov }
      renderer.setSize(W, H, false)
      camera.aspect = W / H
      camera.fov = 32
      camera.updateProjectionMatrix()
      renderer.render(scene, camera)
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      c.getContext('2d')!.drawImage(renderer.domElement, 0, 0, W, H)
      renderer.setSize(prev.w, prev.h, false)
      camera.aspect = prev.w / prev.h
      camera.fov = prev.fov
      camera.updateProjectionMatrix()
      return c
    },
    arrangeRotate: (dir) => {
      if (!sel) return false
      const step = Math.PI / 4
      const yaw = Math.round((sel.obj.rotation.y + dir * step) / step) * step
      if (!canPlace(sel, sel.obj.position.x, sel.obj.position.z, yaw)) return false
      sel.obj.rotation.y = yaw
      pinSel(sel)
      showRing()
      return true
    },
    arrangeReset: () => {
      if (!sel) return
      draft.set(sel.lkey, null)
      applyLayout()
      sel.last = { x: sel.obj.position.x, z: sel.obj.position.z, yaw: sel.obj.rotation.y }
      showRing()
    },
    arrangeChanges: () => [...draft.entries()],
  }

  // 개발 중 확인용 (자동 스크린샷에서 상태를 본다)
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__bdWorld = { control, me: () => ({ area: me.area, pos: me.pos, walk: !!me.walk }), cam: () => cam, actors: () => [...actors.values()].map((a) => ({ id: a.id, area: a.area, pos: a.pos, name: a.info.name })), obstacles: () => collectObstacles(), walkTo: (x: number, z: number) => go(me, { x, z }), use: (fixtureId: string) => { const t = house && targetOf(fixtureKey(house.roomId, fixtureId)); if (t) { me.walk = null; me.pos = { ...t.pos }; startAct(me, t) } return !!t }, info: () => ({ ...renderer.info.render, geos: renderer.info.memory.geometries }), screen: (x: number, z: number) => { const r = el.getBoundingClientRect(); const s = project(new THREE.Vector3(x, 0, z)); return { x: r.left + s.x, y: r.top + s.y } } }

  function gateOfHost() {
    const lot = map.lots[0]
    return lot ? { x: lot.x, z: -3.8 } : { x: 0, z: 0 }
  }

  return {
    control,
    syncDrops,
    setArrange(rid: string | null) {
      if (rid === draftRoom) return
      dropGrab(true)
      draftRoom = rid
      draft.clear()
      if (sel) setSel(null)
      // 옮기는 동안은 걷지 않고, 카메라도 미니미를 따라가지 않는다
      if (rid) {
        me.walk = null
        follow = false
      }
      applyLayout()
    },
    syncRooms(next: Map<string, Room>) {
      rooms = next
      applyLayout()
    },
    setMe(info: ActorInfo) {
      me.info = info
      rebuildAvatar(me)
      rerender()
    },
    overlayList: () =>
      [...actors.values()].map((a) => ({ id: a.id, name: a.info.name, badge: a.info.badge, say: a.say })),
    destroy() {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.clearInterval(nightTimer)
      document.removeEventListener('visibilitychange', onVis)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      el.removeEventListener('wheel', onWheel)
      for (const a of actors.values()) removeActorObj(a)
      fx.clear()
      if (house) {
        disposeTree(house.h.group)
        house.h.dispose()
      }
      if (town) {
        disposeTree(town.group)
        town.dispose()
        town = null
      }
      for (const m of dropMeshes.values()) disposeTree(m)
      ring.geometry.dispose()
      ringMat.dispose()
      starGeo.dispose()
      renderer.dispose()
      el.remove()
    },
  }
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

function easeOutBack(k: number) {
  const c = 1.70158
  return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2
}

/** 도구 창이 있는 가구인지 (표시용) */
export const hasTool = (item: string) => !!toolFor(item)
