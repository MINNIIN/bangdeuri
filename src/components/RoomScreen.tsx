import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { AppContext } from '../App'
import type { Decor } from '../art/decor'
import { ITEM_CATS, type ItemCat, ITEMS, itemById } from '../art/items'
import { backend } from '../lib/backend'
import { interactionFor } from '../lib/interactions'
import { CHARACTER_SPOT } from '../lib/iso'
import { type AreaId, buildTown, houseArea, isArea, roomOfArea, safeVec, TOWN, uvToHouse, type Vec2 } from '../lib/town'
import { RETURN_KEY, roomUrl } from '../lib/links'
import { MAX_GUESTS, newCid, type Peer, type RoomChannel, type RoomEvent } from '../lib/realtime'
import { charLength, clip, errorText, inviteText, kstDate, MAX_DROPS, MESSAGE_MAX, MOTTO_MAX, todayCount } from '../lib/rules'
import { renderStoryImage } from '../lib/shareImage'
import { bgm, bgmEnabled } from '../lib/music'
import { isSafeSong } from '../lib/songs'
import { timers } from '../lib/timers'
import { type NowPlaying, turntable } from '../lib/turntable'
import { type ToolId, toolFor } from '../lib/tools'
import { firstVisitThisSession, store } from '../lib/storage'
import type { ChatMessage, Drop, Room } from '../lib/types'
import { type Ghost, type PlaceTap, World, type WorldControl } from '../three/World'
import { DecorEditor } from './DecorEditor'
import { type Entry, EnterSheet } from './EnterSheet'
import { Icon, SpriteIcon } from './PixelSprite'
import { RoomChat } from './RoomChat'
import { Sheet } from './Sheet'
import { ToolSheet } from './tools/ToolSheet'

type Mode = 'view' | 'pick' | 'place' | 'write' | 'decorate'
type Status = 'loading' | 'ready' | 'missing' | 'error' | 'kicked' | 'full'

const PAGE_SIZE = 5

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

export function timeAgo(iso: string, now = Date.now()) {
  const min = Math.floor((now - new Date(iso).getTime()) / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  return day < 30 ? `${day}일 전` : new Date(iso).toLocaleDateString('ko-KR')
}

/** 이번 탭에서 이 방 입장 알림을 이미 보냈는지 */
function firstEnterNotice(roomId: string) {
  try {
    const k = `bangdeuri:notified:${roomId}`
    if (sessionStorage.getItem(k)) return false
    sessionStorage.setItem(k, '1')
  } catch {
    // 못 기억하면 그냥 보낸다 (서버도 2분 안에 같은 알림은 막는다)
  }
  return true
}

/** 휴대폰 키보드가 올라오면 실제로 보이는 영역만큼만 쓴다 (아래 채팅 입력창이 가려지지 않게) */
function useVisibleViewport(): CSSProperties | undefined {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const covered = window.innerHeight - vv.height
      // 키보드처럼 크게 가려질 때만 맞춘다 (주소창이 줄었다 늘었다 하는 정도는 무시)
      setBox(covered > 80 ? { top: vv.offsetTop, height: vv.height } : null)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return box ? { top: box.top, height: box.height, bottom: 'auto' } : undefined
}

const PLACE_NAME = { in: '집 안', yard: '마당', mail: '우편함' } as const

export function RoomScreen({ ctx, slug }: { ctx: AppContext; slug: string }) {
  const [room, setRoom] = useState<Room | null>(null)
  /** 동네 이웃 방 (방 주인 집 빼고) */
  const [neighbors, setNeighbors] = useState<Room[]>([])
  /** 동네 모든 집의 아이템 */
  const [drops, setDrops] = useState<Drop[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [entry, setEntry] = useState<Entry | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [unread, setUnread] = useState<{ since: string; until: string } | null>(null)
  /** 지금 내가 있는 곳 (골목 또는 어느 집 안) */
  const [area, setArea] = useState<AreaId>(TOWN)
  /** 내 집 방 번호들 (이웃 집에 주인이 와 있는지 알리려고). null = 아직 모름 */
  const [homes, setHomes] = useState<string[] | null>(null)

  const [mode, setMode] = useState<Mode>('view')
  const [item, setItem] = useState<string | null>(null)
  const [cat, setCat] = useState<ItemCat | 'all'>('all')
  const [ghost, setGhost] = useState<Ghost | null>(null)
  /** 놓기: 고른 자리 (집 안 · 마당 · 우편함) */
  const [spot, setSpot] = useState<PlaceTap | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Drop | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [freshId, setFreshId] = useState<string | null>(null)
  const [editingMotto, setEditingMotto] = useState<string | null>(null)
  const [bookOpen, setBookOpen] = useState(false)
  const [page, setPage] = useState(0)
  /** 열어 본 우편함 (그 집 방 번호) */
  const [mailbox, setMailbox] = useState<string | null>(null)
  const [townOpen, setTownOpen] = useState(false)
  // 방 주인이 "친구에게 어떻게 보이는지" 확인하면서 직접 놓아 볼 수 있는 모드
  const [guestView, setGuestView] = useState(false)
  const [confirmRemoveRoom, setConfirmRemoveRoom] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  /** 미니미가 가구에 도착해서 연 도구 창 (그 가구가 있는 집) */
  const [tool, setTool] = useState<ToolId | null>(null)
  const [toolRoom, setToolRoom] = useState<string | null>(null)
  /** 달력: 누가 일정을 바꾸면 올려서 다시 불러온다 */
  const [calVersion, setCalVersion] = useState(0)
  /** 친구가 튼 노래를 브라우저가 막았을 때 (눌러서 같이 듣기) */
  const [songBlocked, setSongBlocked] = useState<NowPlaying | null>(null)
  const [, songBump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => turntable.subscribe(songBump), [])
  // 방을 나가면 노래도 끈다
  useEffect(() => () => turntable.stop(), [])
  const viewport = useVisibleViewport()

  const worldRef = useRef<WorldControl>(null)
  const chRef = useRef<RoomChannel | null>(null)
  const cid = useMemo(newCid, [])

  const owner = !!ctx.user && room?.ownerId === ctx.user.id
  const ownerUi = owner && !guestView

  // ─── 동네: 방 주인 집 + 이웃 집 ───
  const townRooms = useMemo(() => (room ? [room, ...neighbors] : []), [room, neighbors])
  const roomsById = useMemo(() => new Map(townRooms.map((r) => [r.id, r])), [townRooms])
  const townKey = townRooms.map((r) => r.id).join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const townMap = useMemo(() => buildTown(townRooms.map((r) => r.id)), [townKey])
  const townRef = useRef(townRooms)
  townRef.current = townRooms

  const loadDrops = useCallback(async (ids: string[]) => {
    const lists = await Promise.all(ids.map((id) => backend.listDrops(id).catch(() => [] as Drop[])))
    return lists.flat()
  }, [])

  // ─── 방 불러오기 ───
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await backend.getRoom(slug)
        if (!alive) return
        if (!r) return setStatus('missing')
        const nb = await backend.neighbors(r.id).catch(() => [] as Room[])
        const [d, m] = await Promise.all([loadDrops([r.id, ...nb.map((x) => x.id)]), backend.listMessages(r.id)])
        if (!alive) return
        setRoom(r)
        setNeighbors(nb)
        setDrops(d)
        setMessages(m)
        if (store.kickedUntil(r.id)) return setStatus('kicked')
        setStatus('ready')
      } catch {
        if (alive) setStatus('error')
      }
    })()
    return () => {
      alive = false
    }
  }, [slug, loadDrops])

  // 방 주인은 바로 내 미니미로 들어간다
  useEffect(() => {
    if (!room || entry || !owner || !ctx.profile) return
    setEntry({ name: ctx.profile.nickname, look: ctx.profile.look, anon: false })
    // 없는 동안 쌓인 대화 표시하고, 이제 본 것으로
    setUnread({ since: store.seenAt(room.id) ?? room.createdAt, until: new Date().toISOString() })
    store.markSeen(room.id)
  }, [room, entry, owner, ctx.profile])

  // 들어갈 때 어디에 서는지: 방 주인은 거실, 손님은 그 집 대문 앞 골목
  const spawn = useMemo(
    () =>
      owner && room
        ? { area: houseArea(room.id), at: uvToHouse(CHARACTER_SPOT) }
        : { area: TOWN, at: { x: 0, z: -3.6 } as Vec2 },
    [owner, room],
  )
  useEffect(() => setArea(spawn.area), [spawn])

  // 내 집들 (이름을 밝히고 들어온 회원만). 실시간에 붙어서 내 집에 주인이 와 있다고 알린다
  useEffect(() => {
    if (!entry) return
    if (!ctx.user || entry.anon) return setHomes([])
    let alive = true
    backend
      .myRooms()
      .then((rs) => alive && setHomes(rs.map((r) => r.id)))
      .catch(() => alive && setHomes([]))
    return () => {
      alive = false
    }
  }, [entry, ctx.user])

  // 회원이 내 이름으로 놀러 오면 서로 이웃이 된다 (다음부터 서로의 동네에 집이 생긴다)
  useEffect(() => {
    if (!room || !entry || owner || entry.anon || !ctx.user) return
    void backend.becomeNeighbor(room.id).catch(() => undefined)
  }, [room?.id, entry, owner, ctx.user]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 배경음악: 첫 터치 때 시작 (브라우저가 그 전엔 소리를 막는다), 화면이 가려지면 멈춘다 ───
  const [, bgmBump] = useReducer((n: number) => n + 1, 0)
  const theme = room?.theme
  useEffect(() => {
    if (!theme) return
    const off = bgm.subscribe(bgmBump)
    const start = () => bgm.play(theme)
    window.addEventListener('pointerdown', start, { once: true })
    const onVis = () => (document.hidden ? bgm.pause() : bgm.resume())
    document.addEventListener('visibilitychange', onVis)
    return () => {
      off()
      window.removeEventListener('pointerdown', start)
      document.removeEventListener('visibilitychange', onVis)
      bgm.stop()
    }
  }, [theme])

  // 친구 방이면 기억해 둔다 (다음엔 링크 없이 첫 화면에서 바로 들어오게)
  useEffect(() => {
    if (!room || status !== 'ready' || owner) return
    store.rememberVisit({ id: room.id, slug: room.slug, name: room.name, ownerId: room.ownerId, owner: room.owner })
  }, [room, status, owner])

  // 손님이 들어오면 방문자 수
  useEffect(() => {
    if (!room || !entry || owner || !firstVisitThisSession(room.id)) return
    backend
      .visit(room.id)
      .then((c) => setRoom((r) => r && { ...r, todayVisits: c.today, totalVisits: c.total, todayDate: kstDate() }))
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, entry, owner])

  // 다른 앱 갔다 돌아오면 놓친 아이템·채팅을 다시 불러온다
  const reload = useCallback(async () => {
    if (!room) return
    try {
      const [d, m] = await Promise.all([loadDrops(townRef.current.map((r) => r.id)), backend.listMessages(room.id)])
      setDrops(d)
      setMessages(m)
    } catch {
      // 조용히 다음 기회에 다시
    }
  }, [room, loadDrops])

  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  // ─── 실시간: 같은 동네에 있는 사람, 움직임, 채팅 ───
  const roomId = room?.id
  const homesKey = homes?.join(',') ?? null
  useEffect(() => {
    if (!room || !entry || status !== 'ready' || homes === null) return
    const me: Peer = { cid, name: entry.name, look: entry.look, owner, homes }
    const ch = backend.joinRoom(room.id, me)
    chRef.current = ch
    let known = new Set<string>()
    let first = true
    let ownerHere = owner
    let roomApplied = false
    // 자리를 이미 받아 둔 사람 (새 사람이 올 때마다 모두가 '내 자리'를 다시 보내는데, 그때마다 옮기면 걷던 사람이 순간이동한다)
    const placed = new Set<string>()
    const pending = new Map<string, Extract<RoomEvent, { t: 'hello' }>>()
    const areaOf = (a: unknown): AreaId => (isArea(a) ? a : TOWN)
    const vec = (p: unknown) => safeVec(p) ?? { x: 0, z: -3.6 }

    // 남이 보낸 곡은 Apple 주소인지 확인하고 튼다
    const hear = (np: NowPlaying) => {
      if (!isSafeSong(np.song) || !Number.isFinite(np.at) || typeof np.by !== 'string') return
      const safe = { by: np.by.slice(0, 12), song: np.song, at: np.at }
      void turntable.play(safe).then((r) => setSongBlocked(r === 'blocked' ? safe : null))
    }

    const applyHello = (e: Extract<RoomEvent, { t: 'hello' }>) => {
      const w = worldRef.current
      if (!w) return
      if (e.song && !turntable.current()) hear(e.song)
      if (!placed.has(e.cid)) {
        placed.add(e.cid)
        w.placeActor(e.cid, areaOf(e.area), vec(e.at), typeof e.act === 'string' ? e.act : null, e.outfit | 0)
      }
      if (!roomApplied && e.room && Array.isArray(e.room.lights)) {
        w.applyRoom(e.room)
        roomApplied = true
      }
    }

    ch.onPeers((list) => {
      const w = worldRef.current
      if (!w) return
      const others = list.filter((p) => p.cid !== cid)
      if (first && !owner && others.filter((p) => !p.owner).length >= MAX_GUESTS) {
        ch.leave()
        setStatus('full')
        return
      }
      let newcomer = false
      for (const p of others) {
        w.upsertActor(p.cid, { look: p.look, name: p.name, badge: p.owner ? 'owner' : undefined })
        if (!known.has(p.cid)) {
          newcomer = true
          const h = pending.get(p.cid)
          if (h) {
            applyHello(h)
            pending.delete(p.cid)
          }
        }
      }
      for (const id of known)
        if (!others.some((p) => p.cid === id)) {
          w.removeActor(id)
          placed.delete(id)
        }
      known = new Set(others.map((p) => p.cid))

      // 주인이 없는 집은 주인 미니미가 혼자 집에서 논다
      ownerHere = owner || others.some((p) => p.owner)
      const present = new Set<string>()
      for (const p of list) for (const h of p.homes ?? []) present.add(h)
      if (ownerHere) present.add(room.id)
      for (const r of townRef.current)
        w.setNpc(r.id, present.has(r.id) ? null : { look: r.owner.look, name: r.owner.nickname, badge: 'owner' })
      // 새로 온 사람에게 내 자리와 동네 상태를 알려 준다
      if (newcomer) ch.send({ t: 'hello', cid, ...w.snapshot(), song: turntable.current() })
      first = false
      setPeers(list)
    })

    ch.onEvent((e) => {
      const w = worldRef.current
      if (!w) return
      switch (e.t) {
        // 움직임이 먼저 왔으면 늦게 온 '내 자리'로 옮기지 않는다 (걷던 사람이 목적지로 순간이동한다)
        case 'move':
          if (known.has(e.cid)) placed.add(e.cid)
          w.moveActor(e.cid, areaOf(e.area), vec(e.from), vec(e.to))
          break
        case 'act':
          if (known.has(e.cid)) placed.add(e.cid)
          if (typeof e.key === 'string') w.actActor(e.cid, areaOf(e.area), e.key, vec(e.from))
          break
        case 'area':
          if (known.has(e.cid)) placed.add(e.cid)
          w.areaActor(e.cid, areaOf(e.area), vec(e.at))
          break
        case 'hello':
          if (known.has(e.cid)) applyHello(e)
          else pending.set(e.cid, e)
          break
        case 'chat':
          setMessages((m) => (m.some((x) => x.id === e.msg.id) ? m : [...m, e.msg]))
          w.sayActor(e.cid, e.msg.body)
          if (owner) store.markSeen(room.id)
          break
        case 'chat-del':
          setMessages((m) => m.filter((x) => x.id !== e.id))
          break
        case 'drop':
          setDrops((d) => (d.some((x) => x.id === e.drop.id) ? d : [...d, { ...e.drop, place: e.drop.place ?? 'in' }]))
          setFreshId(e.drop.id)
          break
        case 'drop-del':
          setDrops((d) => d.filter((x) => x.id !== e.id))
          break
        case 'room':
          setRoom((r) => r && { ...r, motto: e.motto, decor: e.decor })
          break
        case 'song':
          hear({ by: e.by, song: e.song, at: e.at })
          break
        case 'cal':
          setCalVersion((v) => v + 1)
          break
        case 'song-stop':
          turntable.stop()
          setSongBlocked(null)
          break
        case 'kick':
          if (e.cid === cid) {
            store.markKicked(room.id)
            ch.leave()
            setStatus('kicked')
          }
          break
      }
    })

    // 방 주인이 없을 때 들어오면 주인에게 알림 (잠깐 기다려 사람 명단을 다 받은 뒤)
    const noticeTimer = window.setTimeout(() => {
      if (!owner && !ownerHere && firstEnterNotice(room.id)) void backend.notify(room.id, { kind: 'enter', name: entry.name })
    }, 2500)

    return () => {
      window.clearTimeout(noticeTimer)
      ch.leave()
      chRef.current = null
      if (owner) store.markSeen(room.id)
    }
    // 방 정보(한마디·꾸미기)가 바뀌어도 다시 들어가지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, entry, status, cid, owner, homesKey, townKey])

  const send = (e: RoomEvent) => chRef.current?.send(e)

  if (status === 'loading') return <main className="screen center muted">동네 골목 들어가는 중…</main>
  if (status === 'kicked' || status === 'full') {
    return (
      <main className="screen center">
        <p>{status === 'kicked' ? '방 주인이 내보냈어요. 조금 있다가 다시 와 주세요' : `동네가 꽉 찼어요 (최대 ${MAX_GUESTS}명). 조금 있다가 다시 와 주세요`}</p>
        <button className="btn btn-primary" onClick={() => ctx.go({ kind: 'home' })}>
          처음으로
        </button>
      </main>
    )
  }
  if (status !== 'ready' || !room) {
    return (
      <main className="screen center">
        <p>{status === 'missing' ? '이 방은 찾을 수 없어요. 링크가 바뀌었을 수도 있어요' : '방을 불러오지 못했어요'}</p>
        <button className="btn btn-primary" onClick={() => ctx.go({ kind: 'home' })}>
          처음으로
        </button>
      </main>
    )
  }

  const entered = entry !== null
  const hostDrops = drops.filter((d) => d.roomId === room.id)
  const pickedItem = item ? itemById(item) : undefined
  const link = roomUrl(window.location.href, room.slug)
  const placing = mode === 'place' || mode === 'write'
  const areaRoom = roomOfArea(area)
  const inMyHouse = areaRoom === room.id
  /** 그 집 주인인지 (치우기 · 우편함 정리) */
  const ownsRoom = (rid: string) => !!ctx.user && roomsById.get(rid)?.ownerId === ctx.user.id && !guestView
  const nickOf = (rid: string) => roomsById.get(rid)?.owner.nickname ?? '친구'

  const guestbook = [...hostDrops].reverse()
  const pages = Math.max(1, Math.ceil(guestbook.length / PAGE_SIZE))
  const pageItems = guestbook.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const select = (d: Drop | null) => {
    setConfirmDelete(false)
    setSelected(d)
  }

  const startPick = () => {
    select(null)
    setMode('pick')
  }

  const choose = (id: string) => {
    setItem(id)
    setGhost(null)
    setSpot(null)
    setMode('place')
  }

  const cancelDrop = () => {
    setMode('view')
    setItem(null)
    setGhost(null)
    setSpot(null)
  }

  /** 놓기 모드에서 누른 곳: 집 안 바닥 · 마당 · 우편함이면 거기에 */
  const pickSpot = (t: PlaceTap | null) => {
    if (!t || !item) {
      ctx.toast('집 안 바닥, 마당, 우편함 중에 눌러 줘')
      return
    }
    const target = roomsById.get(t.roomId)
    if (!target) return
    if (ctx.user && target.ownerId === ctx.user.id && !guestView) {
      ctx.toast('내 집은 꾸미기로 채워요. 친구네에 놓고 와 줘')
      return
    }
    // 로컬 모드는 혼자 테스트하는 용도라 "집마다 1개" 제한을 두지 않는다
    if (store.hasDropped(t.roomId) && !backend.local) {
      ctx.toast(`${target.owner.nickname}네에는 이미 하나 두고 왔어요`)
      return
    }
    setSpot(t)
    if (t.place === 'mail') {
      setGhost(null)
      setMode('write')
    } else setGhost({ item, area: t.area, x: t.x, z: t.z })
  }

  const submitDrop = async () => {
    if (!spot || !item || !entry || busy) return
    setBusy(true)
    try {
      const d = await backend.addDrop(spot.roomId, {
        item,
        place: spot.place,
        u: spot.place === 'mail' ? 0.5 : spot.u,
        v: spot.place === 'mail' ? 0.5 : spot.v,
        nickname: entry.name,
        message: message.trim(),
      })
      setDrops((prev) => [...prev, d])
      setFreshId(d.id)
      if (d.place !== 'mail') select(d)
      store.markDropped(spot.roomId)
      cancelDrop()
      setMessage('')
      send({ t: 'drop', cid, drop: d })
      if (!ownsRoom(spot.roomId)) void backend.notify(spot.roomId, { kind: 'drop', name: entry.name, item: itemById(d.item)?.name })
      ctx.toast(`${nickOf(spot.roomId)}네 ${PLACE_NAME[d.place]}에 두고 왔어요!`)
    } catch (e) {
      ctx.toast(errorText(e))
      if (e instanceof Error && e.message === 'room_full') {
        cancelDrop()
        reload()
      }
    } finally {
      setBusy(false)
    }
  }

  const removeDrop = async (d: Drop) => {
    try {
      await backend.deleteDrop(d.roomId, d.id)
      setDrops((prev) => prev.filter((x) => x.id !== d.id))
      select(null)
      send({ t: 'drop-del', id: d.id })
      ctx.toast('치웠어요')
    } catch (e) {
      ctx.toast(errorText(e))
    }
  }

  const saveMotto = async () => {
    if (editingMotto === null) return
    const motto = editingMotto.trim()
    try {
      await backend.updateMotto(room.id, motto)
      setRoom({ ...room, motto })
      setEditingMotto(null)
      send({ t: 'room', motto, decor: room.decor })
    } catch (e) {
      ctx.toast(errorText(e))
    }
  }

  const removeRoom = async () => {
    if (busy) return
    setBusy(true)
    try {
      await backend.deleteRoom(room.id)
      ctx.go({ kind: 'home' })
      ctx.toast('방을 삭제했어요')
    } catch (e) {
      ctx.toast(errorText(e))
      setBusy(false)
    }
  }

  const resetLink = async () => {
    if (busy) return
    setBusy(true)
    try {
      const next = await backend.resetLink(room.id)
      setRoom({ ...room, slug: next })
      // 화면은 그대로 두고 주소만 바꾼다 (지금 같이 있는 친구들도 그대로)
      window.history.replaceState(null, '', roomUrl(window.location.href, next))
      setConfirmReset(false)
      ctx.toast('새 링크를 만들었어요. 예전 링크로는 더 못 들어와요')
    } catch (e) {
      ctx.toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const saveDecor = async (decor: Decor) => {
    if (busy) return
    setBusy(true)
    try {
      await backend.updateDecor(room.id, decor)
      setRoom({ ...room, decor })
      setMode('view')
      send({ t: 'room', motto: room.motto, decor })
      ctx.toast('방을 새로 꾸몄어요!')
    } catch (e) {
      ctx.toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const sendChat = async (body: string) => {
    if (!entry) return
    try {
      const msg = await backend.postMessage(room.id, { name: entry.name, body })
      setMessages((m) => [...m, msg])
      worldRef.current?.sayActor('me', body)
      send({ t: 'chat', cid, msg })
      if (owner) store.markSeen(room.id)
    } catch (e) {
      ctx.toast(errorText(e))
      throw e
    }
  }

  const deleteChat = async (m: ChatMessage) => {
    try {
      await backend.deleteMessage(room.id, m.id)
      setMessages((list) => list.filter((x) => x.id !== m.id))
      send({ t: 'chat-del', id: m.id })
    } catch (e) {
      ctx.toast(errorText(e))
    }
  }

  const kick = (p: Peer) => {
    send({ t: 'kick', cid: p.cid })
    ctx.toast(`${p.name}님을 내보냈어요`)
  }

  const shareStory = async () => {
    const shot = worldRef.current?.capture()
    if (!shot || busy) return
    setBusy(true)
    try {
      const blob = await renderStoryImage(shot, room, hostDrops.length)
      const file = new File([blob], `bangdeuri-${room.slug}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '방들이' })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        ctx.toast('이미지를 저장했어요. 스토리에 올리고 링크 스티커를 붙여 주세요')
      }
    } catch (e) {
      if (!isAbort(e)) ctx.toast('이미지를 만들지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  const shareLink = async () => {
    const text = inviteText(room.owner.nickname)
    try {
      if (navigator.share) {
        await navigator.share({ title: '방들이', text, url: link })
      } else {
        await navigator.clipboard.writeText(link)
        ctx.toast('링크를 복사했어요')
      }
    } catch (e) {
      if (!isAbort(e)) ctx.toast('링크를 복사하지 못했어요')
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link)
      ctx.toast('링크를 복사했어요. 스토리 링크 스티커에 붙여 넣어 주세요')
    } catch {
      ctx.toast('링크를 복사하지 못했어요')
    }
  }

  /** 방명록에서 누르면: 우편함이면 우편함을, 아니면 그곳으로 카메라를 (다른 곳이면 그쪽으로 걸어간다) */
  const openFromBook = (d: Drop) => {
    setBookOpen(false)
    setChatOpen(false)
    if (d.place === 'mail') return setMailbox(d.roomId)
    if (worldRef.current?.focusDrop(d.id)) return select(d)
    const there: AreaId = d.place === 'yard' ? TOWN : houseArea(d.roomId)
    if (!entered) return ctx.toast(`${PLACE_NAME[d.place]}에 있어요. 들어가서 찾아봐요`)
    if (there === TOWN) worldRef.current?.goOut()
    else worldRef.current?.goHouse(d.roomId)
    ctx.toast(`${nickOf(d.roomId)}네 ${PLACE_NAME[d.place]}에 있어요. 그쪽으로 가요`)
  }

  const goMakeRoom = () => {
    if (ctx.user) return ctx.go({ kind: 'create' })
    try {
      sessionStorage.removeItem(RETURN_KEY)
    } catch {
      // 상관없다
    }
    ctx.go({ kind: 'login' })
  }

  const selectedItem = selected ? itemById(selected.item) : undefined
  const selectedInter = selected ? interactionFor(selected.item) : undefined
  const bubble = selected && (
    <>
      <p className="bubble-head">
        <b>{selected.nickname}</b>
        <span className="muted">
          {selectedItem?.name} · {timeAgo(selected.createdAt)}
        </span>
      </p>
      <p className="bubble-msg">{selected.message || '(말없이 놓고 감)'}</p>
      {selectedInter && entered && !confirmDelete && (
        <button
          className="bubble-use"
          onClick={() => {
            const id = selected.id
            select(null)
            worldRef.current?.interactDrop(id)
          }}
        >
          {selectedItem && <SpriteIcon sprite={selectedItem.sprite} size={16} />} {selectedInter.verb}
        </button>
      )}
      {ownsRoom(selected.roomId) &&
        (confirmDelete ? (
          <span className="bubble-actions">
            <button className="link" onClick={() => setConfirmDelete(false)}>
              그냥 둘래
            </button>
            <button className="link danger" onClick={() => removeDrop(selected)}>
              치우기
            </button>
          </span>
        ) : (
          <span className="bubble-actions">
            <button className="link" onClick={() => setConfirmDelete(true)}>
              치우기
            </button>
          </span>
        ))}
    </>
  )

  if (mode === 'decorate') {
    return (
      <DecorEditor
        initial={room.decor}
        look={room.owner.look}
        drops={hostDrops.filter((d) => d.place === 'in')}
        busy={busy}
        onSave={saveDecor}
        onCancel={() => setMode('view')}
      />
    )
  }

  const shownItems = cat === 'all' ? ITEMS : ITEMS.filter((it) => it.cat === cat)
  // 들어가기 전에는 방 주인 미니미가 서 있는 모습만 보여 준다
  const meLook = entry?.look ?? room.owner.look

  const startDecorate = () => {
    select(null)
    setMode('decorate')
  }
  const closeMenu = () => setMenuOpen(false)
  const menuItem = (label: ReactNode, onClick: () => void, cls = '') => (
    <button
      className={`menu-item ${cls}`}
      role="menuitem"
      onClick={() => {
        closeMenu()
        onClick()
      }}
    >
      {label}
    </button>
  )

  const where = areaRoom ? (areaRoom === room.id ? `${room.name}의 미니룸` : `${nickOf(areaRoom)}네 집`) : `${room.owner.nickname}네 동네`
  const mailList = mailbox ? drops.filter((d) => d.roomId === mailbox && d.place === 'mail').reverse() : []
  /** 같은 동네 사람들이 어디 있는지 (명단에 붙인다) */
  const giftIcon = ITEMS.find((i) => i.id === 'gift')!.sprite

  return (
    <main className="room-screen" style={viewport}>
      {/* 3D 동네가 화면 전체 */}
      <div className={`room-full ${placing ? 'is-placing' : ''}`}>
        <World
          key={entered ? 'in' : 'out'}
          map={townMap}
          rooms={roomsById}
          controlRef={worldRef}
          look={meLook}
          name={entry?.name}
          badge={owner ? 'owner' : 'me'}
          spawn={spawn}
          drops={drops}
          ghost={ghost}
          selectedId={placing ? null : selected?.id}
          freshId={freshId}
          bubble={placing ? null : bubble}
          walkable={entered}
          onPlaceTap={mode === 'place' && item ? pickSpot : undefined}
          onDropTap={placing ? undefined : (d) => select(selected?.id === d.id ? null : d)}
          onMailTap={(rid) => setMailbox(rid)}
          onBackgroundTap={() => select(null)}
          onMeMove={(a, from, to) => send({ t: 'move', cid, area: a, from, to })}
          onMeAct={(a, key, from) => send({ t: 'act', cid, area: a, key, from })}
          onMeArea={(a, at) => {
            setArea(a)
            select(null)
            send({ t: 'area', cid, area: a, at })
          }}
          onMeArrive={(key, it) => {
            // 친구가 놓은 전자레인지·알람시계도 쓸 수 있다. 놓기·꾸미기 중에는 열지 않는다
            if (mode !== 'view') return
            setTool(toolFor(it) ?? null)
            setToolRoom(key.includes('/') ? key.split('/')[0] : (drops.find((d) => d.id === key)?.roomId ?? room.id))
          }}
        />
        {!entered && (
          <div className="enter-overlay">
            <EnterSheet ctx={ctx} room={room} onEnter={setEntry} />
          </div>
        )}
      </div>

      {/* 위: 나가기 · 지금 있는 곳 · 방명록 · 메뉴 */}
      <header className="hud-top">
        <button className="hud-btn" onClick={() => ctx.go({ kind: 'home' })} aria-label="처음으로">
          <Icon id="back" />
        </button>
        <div className="hud-title">
          <b>{where}</b>
          {turntable.isPlaying() ? (
            <span className="hud-song">
              ♪ {turntable.current()!.song.title} · {turntable.current()!.song.artist}
            </span>
          ) : (
            room.motto && <span>{room.motto}</span>
          )}
        </div>
        {/* PC에서는 꾸미기·놓고 가기 버튼을 위쪽에 (휴대폰은 아래 떠 있는 버튼) */}
        {entered && !placing && (
          <button className="hud-btn hud-wide" onClick={ownerUi && inMyHouse ? startDecorate : startPick}>
            {ownerUi && inMyHouse ? (
              <>
                <Icon id="paint" size={14} /> 꾸미기
              </>
            ) : (
              <>
                <SpriteIcon sprite={giftIcon} size={18} /> 선물 두고 오기
              </>
            )}
          </button>
        )}
        <button
          className="hud-btn"
          onClick={(e) => {
            // 위 '첫 터치' 시작과 겹치지 않게
            e.stopPropagation()
            bgm.toggle(room.theme)
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={bgmEnabled() ? '배경음악 끄기' : '배경음악 켜기'}
          aria-pressed={bgmEnabled()}
        >
          <Icon id={bgmEnabled() ? 'music' : 'mute'} />
        </button>
        <button
          className="hud-btn hud-book"
          onClick={() => {
            setPage(0)
            setBookOpen(true)
          }}
          aria-label={`방명록 ${hostDrops.length}개`}
        >
          <Icon id="book" />
          <span>{hostDrops.length}</span>
        </button>
        <button
          className={`hud-btn ${menuOpen ? 'is-on' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="메뉴"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <Icon id="menu" />
        </button>
      </header>

      {/* 어디로 갈지: 집 안이면 밖으로, 골목이면 동네 집 목록 */}
      {entered && !placing && (
        <nav className="hud-where" aria-label="이동">
          {areaRoom ? (
            <button className="chip is-on" onClick={() => worldRef.current?.goOut()}>
              <Icon id="back" size={12} /> 밖으로 나가기
            </button>
          ) : (
            <button className="chip is-on" onClick={() => setTownOpen(true)}>
              <Icon id="home" size={12} /> 동네 집 {townRooms.length}채
            </button>
          )}
        </nav>
      )}

      {menuOpen && (
        <>
          <div className="menu-backdrop" onClick={closeMenu} />
          <div className="menu" role="menu">
            <p className="menu-counter">
              TODAY {todayCount(room)} · TOTAL {room.totalVisits} · 아이템 {hostDrops.length}/{MAX_DROPS}
            </p>
            {ownerUi ? (
              <>
                {menuItem(
                  <>
                    <Icon id="paint" size={14} /> 방 꾸미기
                  </>,
                  startDecorate,
                )}
                {menuItem(
                  <>
                    <Icon id="note" size={14} /> {room.motto ? '오늘의 한마디 고치기' : '오늘의 한마디 쓰기'}
                  </>,
                  () => setEditingMotto(room.motto),
                )}
                {menuItem(
                  <>
                    <Icon id="camera" size={14} /> 스토리 이미지 저장하기
                  </>,
                  shareStory,
                )}
                {menuItem(
                  <>
                    <Icon id="link" size={14} /> 링크 복사
                  </>,
                  copyLink,
                )}
                {menuItem(
                  <>
                    <Icon id="share" size={14} /> 친구에게 보내기
                  </>,
                  shareLink,
                )}
                {menuItem(
                  <>
                    <Icon id="eye" size={14} /> 직접 아이템 놓아 보기
                  </>,
                  () => {
                    select(null)
                    setGuestView(true)
                  },
                )}
                <hr />
                {menuItem(
                  <>
                    <Icon id="refresh" size={14} /> 새 링크 만들기
                  </>,
                  () => setConfirmReset(true),
                  'is-quiet',
                )}
                {menuItem(
                  <>
                    <Icon id="trash" size={14} /> 방 삭제하기
                  </>,
                  () => setConfirmRemoveRoom(true),
                  'is-danger',
                )}
              </>
            ) : (
              <>
                {guestView &&
                  menuItem(
                    <>
                      <Icon id="undo" size={14} /> 내 방으로 돌아가기
                    </>,
                    () => setGuestView(false),
                  )}
                {!guestView &&
                  menuItem(
                    <>
                      <Icon id="home" size={14} /> 나도 내 방 만들기
                    </>,
                    goMakeRoom,
                  )}
              </>
            )}
          </div>
        </>
      )}

      {guestView && (
        <p className="hud-banner">
          친구에게는 이렇게 보여요
          <button className="link" onClick={() => setGuestView(false)}>
            돌아가기
          </button>
        </p>
      )}

      {mode === 'place' && (
        <p className="place-hint">
          {ghost ? '다른 곳을 누르면 옮겨져요' : '집 안 바닥 · 마당 · 우편함 중에 놓을 곳을 눌러 줘 (끌면 둘러보기)'}
        </p>
      )}

      {/* 아래: 놓기 버튼 · 수다방 */}
      {entered && (
        <div className="hud-bottom">
          {placing ? (
            <div className="row hud-place">
              <button className="btn" onClick={() => setMode('pick')}>
                다시 고르기
              </button>
              <button className="btn btn-primary" disabled={!spot} onClick={() => setMode('write')}>
                여기에 놓기
              </button>
            </div>
          ) : (
            <>
              {!chatOpen && (
                <div className="hud-fabs">
                  {ownerUi && inMyHouse ? (
                    <button className="fab" onClick={startDecorate}>
                      <Icon id="paint" size={18} /> 꾸미기
                    </button>
                  ) : (
                    <button className="fab fab-primary" onClick={startPick}>
                      <SpriteIcon sprite={giftIcon} size={24} /> 선물 두고 오기
                    </button>
                  )}
                </div>
              )}
              <RoomChat
                messages={messages}
                peers={peers.length ? peers : [{ cid, name: entry.name, look: entry.look, owner }]}
                meCid={cid}
                owner={ownerUi}
                unread={owner ? unread : null}
                open={chatOpen}
                onOpenChange={setChatOpen}
                onSend={sendChat}
                onDelete={deleteChat}
                onKick={kick}
              />
            </>
          )}
        </div>
      )}

      {/* 오늘의 한마디 */}
      <Sheet open={editingMotto !== null} onClose={() => setEditingMotto(null)} title="오늘의 한마디">
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            saveMotto()
          }}
        >
          <label className="field">
            <span>
              방 이름 아래에 보여요 <em>{charLength(editingMotto ?? '')}/{MOTTO_MAX}</em>
            </span>
            <input
              value={editingMotto ?? ''}
              onChange={(e) => setEditingMotto(clip(e.target.value, MOTTO_MAX))}
              placeholder="오늘의 한마디"
              autoFocus
            />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            저장
          </button>
        </form>
      </Sheet>

      {/* 새 링크 · 방 삭제 확인 */}
      <Sheet open={confirmReset} onClose={() => setConfirmReset(false)} title="새 링크 만들기">
        <p className="confirm-text">새 링크를 만들면 예전 링크로는 아무도 못 들어와요. 친구들에게 새 링크를 다시 보내야 해요.</p>
        <div className="row">
          <button className="btn" onClick={() => setConfirmReset(false)}>
            그냥 둘래
          </button>
          <button className="btn btn-danger" onClick={resetLink} disabled={busy}>
            새 링크 만들기
          </button>
        </div>
      </Sheet>
      <Sheet open={confirmRemoveRoom} onClose={() => setConfirmRemoveRoom(false)} title="방 삭제하기">
        <p className="confirm-text">방을 지우면 친구들이 놓고 간 아이템, 방명록, 채팅도 모두 사라지고 되돌릴 수 없어요.</p>
        <div className="row">
          <button className="btn" onClick={() => setConfirmRemoveRoom(false)}>
            그냥 둘래
          </button>
          <button className="btn btn-danger" onClick={removeRoom} disabled={busy}>
            {busy ? '지우는 중…' : '정말 삭제하기'}
          </button>
        </div>
      </Sheet>

      {songBlocked && turntable.current() === songBlocked && (
        <button
          className="btn btn-primary song-prompt"
          onClick={() => void turntable.play(songBlocked).then((r) => setSongBlocked(r === 'blocked' ? songBlocked : null))}
        >
          ♪ {songBlocked.by}님이 노래를 틀었어요 — 눌러서 같이 듣기
        </button>
      )}

      <ToolSheet
        tool={tool}
        onClose={() => setTool(null)}
        onPlaySong={(song) => {
          const np = { by: entry?.name ?? '나', song, at: Date.now() }
          void turntable.play(np)
          setSongBlocked(null)
          send({ t: 'song', cid, ...np })
        }}
        calendar={
          entry
            ? {
                roomId: toolRoom ?? room.id,
                owner: ownsRoom(toolRoom ?? room.id) || (owner && (toolRoom ?? room.id) === room.id),
                name: entry.name,
                anon: entry.anon,
                version: calVersion,
                onChanged: () => send({ t: 'cal', cid }),
                onGuestWrote: () => void backend.notify(toolRoom ?? room.id, { kind: 'event', name: entry.name }),
                toast: ctx.toast,
              }
            : undefined
        }
        alarm={{ owner: ownerUi && (toolRoom ?? room.id) === room.id, toast: ctx.toast }}
        onStopSong={() => {
          turntable.stop()
          send({ t: 'song-stop', cid })
        }}
        onTimer={(label, sec) => {
          timers.start({ label, source: 'recipe', endsAt: Date.now() + sec * 1000, total: sec })
          ctx.toast(`${label} ${sec / 60}분 타이머를 맞췄어요`)
        }}
      />

      {/* 동네 집 목록 */}
      <Sheet open={townOpen} onClose={() => setTownOpen(false)} title={`${room.owner.nickname}네 동네`}>
        <ul className="town-list">
          {townRooms.map((r) => {
            const here = peers.filter((p) => p.homes?.includes(r.id) || (r.id === room.id && p.owner)).length > 0
            return (
              <li key={r.id}>
                <button
                  className="town-house"
                  onClick={() => {
                    setTownOpen(false)
                    worldRef.current?.goHouse(r.id)
                  }}
                >
                  <span className={`town-dot is-${r.theme}`} aria-hidden />
                  <span className="town-name">
                    <b>{r.owner.nickname}네</b>
                    <span className="muted">
                      {r.name}
                      {here ? ' · 주인 있음' : ''}
                    </span>
                  </span>
                  <span className="town-go">놀러 가기</span>
                </button>
              </li>
            )
          })}
        </ul>
        <p className="muted book-tip">
          {neighbors.length
            ? '서로 놀러 간 적 있는 친구들 집이에요. 문을 눌러도 들어가요'
            : '아직 이웃이 없어요. 친구가 내 이름으로 놀러 오면 그 친구 집이 골목에 생겨요'}
        </p>
      </Sheet>

      {/* 우편함 */}
      <Sheet open={mailbox !== null} onClose={() => setMailbox(null)} title={`${mailbox ? nickOf(mailbox) : ''}네 우편함`}>
        {mailList.length === 0 ? (
          <p className="muted empty">우편함이 비어 있어요. 선물 두고 오기로 편지를 넣을 수 있어요</p>
        ) : (
          <ul className="book">
            {mailList.map((d) => {
              const it = itemById(d.item)
              return (
                <li key={d.id}>
                  <div className={`note ${d.id === freshId ? 'is-fresh' : ''}`}>
                    {it && <SpriteIcon sprite={it.sprite} size={36} />}
                    <span className="note-body">
                      <span className="note-head">
                        <b>{d.nickname}</b>
                        <span className="muted">
                          {it?.name} · {timeAgo(d.createdAt)}
                        </span>
                      </span>
                      <span className="note-text">{d.message || '(말없이 넣고 감)'}</span>
                    </span>
                    {mailbox && ownsRoom(mailbox) && (
                      <button className="link danger" onClick={() => removeDrop(d)}>
                        치우기
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Sheet>

      {/* 방명록 */}
      <Sheet open={bookOpen} onClose={() => setBookOpen(false)} title={`방명록 ${hostDrops.length}/${MAX_DROPS}`}>
        {guestbook.length === 0 ? (
          <p className="muted empty">아직 아무도 다녀가지 않았어요</p>
        ) : (
          <>
            <ul className="book">
              {pageItems.map((d) => {
                const it = itemById(d.item)
                return (
                  <li key={d.id}>
                    <button className={`note ${d.id === freshId ? 'is-fresh' : ''}`} onClick={() => openFromBook(d)}>
                      {it && <SpriteIcon sprite={it.sprite} size={36} />}
                      <span className="note-body">
                        <span className="note-head">
                          <b>{d.nickname}</b>
                          <span className="muted">
                            {it?.name} · {PLACE_NAME[d.place]} · {timeAgo(d.createdAt)}
                          </span>
                        </span>
                        <span className="note-text">{d.message || '(말없이 놓고 감)'}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {pages > 1 && (
              <nav className="pager" aria-label="방명록 페이지">
                <button className="btn btn-small" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  이전
                </button>
                <span>
                  {page + 1} / {pages}
                </span>
                <button className="btn btn-small" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                  다음
                </button>
              </nav>
            )}
            <p className="muted book-tip">누르면 그 아이템이 있는 곳을 보여줘요</p>
          </>
        )}
      </Sheet>

      {/* 아이템 고르기 */}
      <Sheet open={mode === 'pick'} onClose={cancelDrop} title="뭘 두고 갈까?">
        <div className="cat-tabs" role="tablist">
          {[{ id: 'all' as const, name: '전체' }, ...ITEM_CATS].map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={cat === c.id}
              className={`chip ${cat === c.id ? 'is-on' : ''}`}
              onClick={() => setCat(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="item-grid">
          {shownItems.map((it) => (
            <button key={it.id} className={`item-cell ${item === it.id ? 'is-on' : ''}`} onClick={() => choose(it.id)}>
              <SpriteIcon sprite={it.sprite} size={44} />
              <span>{it.name}</span>
            </button>
          ))}
        </div>
      </Sheet>

      {/* 한마디 쓰기 */}
      <Sheet
        open={mode === 'write'}
        onClose={() => (spot?.place === 'mail' ? cancelDrop() : setMode('place'))}
        title={`${pickedItem?.name ?? ''} 두고 가기`}
      >
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            submitDrop()
          }}
        >
          <p className="muted">
            {spot && spot.place !== undefined && (
              <>
                <b>{nickOf(spot.roomId)}네 {PLACE_NAME[spot.place]}</b>에{' '}
              </>
            )}
            <b>{entry?.name}</b> 이름으로 남겨요
          </p>
          <label className="field">
            <span>
              한마디 <em>{charLength(message)}/{MESSAGE_MAX}</em>
            </span>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(clip(e.target.value.replace(/\n/g, ' '), MESSAGE_MAX))}
              placeholder={pickedItem?.hint}
            />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? '두는 중…' : '두고 가기'}
          </button>
        </form>
      </Sheet>
    </main>
  )
}
