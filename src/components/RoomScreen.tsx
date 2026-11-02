import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppContext } from '../App'
import type { Decor } from '../art/decor'
import { ITEM_CATS, type ItemCat, ITEMS, itemById } from '../art/items'
import { backend } from '../lib/backend'
import { interactionFor } from '../lib/interactions'
import { CHARACTER_SPOT } from '../lib/iso'
import { RETURN_KEY, roomUrl } from '../lib/links'
import { MAX_GUESTS, newCid, type Peer, type RoomChannel, type RoomEvent } from '../lib/realtime'
import { charLength, clip, errorText, inviteText, kstDate, MAX_DROPS, MESSAGE_MAX, MOTTO_MAX, todayCount } from '../lib/rules'
import { renderStoryImage } from '../lib/shareImage'
import { firstVisitThisSession, store } from '../lib/storage'
import type { ChatMessage, Drop, Room } from '../lib/types'
import { DecorEditor } from './DecorEditor'
import { type Entry, EnterSheet } from './EnterSheet'
import { Icon, SpriteIcon } from './PixelSprite'
import { RoomChat } from './RoomChat'
import { ENTRANCE, type Ghost, RoomScene, type SceneControl } from './RoomScene'
import { Sheet } from './Sheet'

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

export function RoomScreen({ ctx, slug }: { ctx: AppContext; slug: string }) {
  const [room, setRoom] = useState<Room | null>(null)
  const [drops, setDrops] = useState<Drop[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [entry, setEntry] = useState<Entry | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [unread, setUnread] = useState<{ since: string; until: string } | null>(null)

  const [mode, setMode] = useState<Mode>('view')
  const [item, setItem] = useState<string | null>(null)
  const [cat, setCat] = useState<ItemCat | 'all'>('all')
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Drop | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [freshId, setFreshId] = useState<string | null>(null)
  const [dropped, setDropped] = useState(false)
  const [editingMotto, setEditingMotto] = useState<string | null>(null)
  const [bookOpen, setBookOpen] = useState(false)
  const [page, setPage] = useState(0)
  // 방 주인이 "친구에게 어떻게 보이는지" 확인하면서 직접 놓아 볼 수 있는 모드
  const [guestView, setGuestView] = useState(false)
  const [confirmRemoveRoom, setConfirmRemoveRoom] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const viewport = useVisibleViewport()

  const svgRef = useRef<SVGSVGElement>(null)
  const sceneRef = useRef<SceneControl>(null)
  const chRef = useRef<RoomChannel | null>(null)
  const cid = useMemo(newCid, [])

  const owner = !!ctx.user && room?.ownerId === ctx.user.id
  const ownerUi = owner && !guestView

  // ─── 방 불러오기 ───
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await backend.getRoom(slug)
        if (!alive) return
        if (!r) return setStatus('missing')
        const [d, m] = await Promise.all([backend.listDrops(r.id), backend.listMessages(r.id)])
        if (!alive) return
        setRoom(r)
        setDrops(d)
        setMessages(m)
        setDropped(store.hasDropped(r.id))
        if (store.kickedUntil(r.id)) return setStatus('kicked')
        setStatus('ready')
      } catch {
        if (alive) setStatus('error')
      }
    })()
    return () => {
      alive = false
    }
  }, [slug])

  // 방 주인은 바로 내 미니미로 들어간다
  useEffect(() => {
    if (!room || entry || !owner || !ctx.profile) return
    setEntry({ name: ctx.profile.nickname, look: ctx.profile.look, anon: false })
    // 없는 동안 쌓인 대화 표시하고, 이제 본 것으로
    setUnread({ since: store.seenAt(room.id) ?? room.createdAt, until: new Date().toISOString() })
    store.markSeen(room.id)
  }, [room, entry, owner, ctx.profile])

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
      const [d, m] = await Promise.all([backend.listDrops(room.id), backend.listMessages(room.id)])
      setDrops(d)
      setMessages(m)
    } catch {
      // 조용히 다음 기회에 다시
    }
  }, [room])

  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  // ─── 실시간: 같이 있는 사람, 움직임, 채팅 ───
  const roomId = room?.id
  useEffect(() => {
    if (!room || !entry || status !== 'ready') return
    const me: Peer = { cid, name: entry.name, look: entry.look, owner }
    const ch = backend.joinRoom(room.id, me)
    chRef.current = ch
    let known = new Set<string>()
    let first = true
    let ownerHere = owner
    let roomApplied = false
    const pending = new Map<string, Extract<RoomEvent, { t: 'hello' }>>()
    const ownerInfo = { look: room.owner.look, name: room.owner.nickname, badge: 'owner' as const }

    const applyHello = (e: Extract<RoomEvent, { t: 'hello' }>) => {
      const scene = sceneRef.current
      if (!scene) return
      scene.placeActor(e.cid, e.at, e.act, e.outfit)
      if (!roomApplied) {
        scene.applyRoom(e.room)
        roomApplied = true
      }
    }

    ch.onPeers((list) => {
      const scene = sceneRef.current
      if (!scene) return
      const others = list.filter((p) => p.cid !== cid)
      if (first && !owner && others.filter((p) => !p.owner).length >= MAX_GUESTS) {
        ch.leave()
        setStatus('full')
        return
      }
      let newcomer = false
      for (const p of others) {
        scene.upsertActor(p.cid, { look: p.look, name: p.name, badge: p.owner ? 'owner' : undefined })
        if (!known.has(p.cid)) {
          newcomer = true
          const h = pending.get(p.cid)
          if (h) {
            applyHello(h)
            pending.delete(p.cid)
          }
        }
      }
      for (const id of known) if (!others.some((p) => p.cid === id)) scene.removeActor(id)
      known = new Set(others.map((p) => p.cid))

      // 방 주인이 없으면 주인 미니미가 혼자 집에서 논다
      ownerHere = owner || others.some((p) => p.owner)
      if (ownerHere) scene.removeActor('npc')
      else {
        scene.upsertActor('npc', ownerInfo, CHARACTER_SPOT)
        scene.setIdle('npc', true)
      }
      // 새로 온 사람에게 내 자리와 방 상태를 알려 준다
      if (newcomer) ch.send({ t: 'hello', cid, ...scene.snapshot() })
      first = false
      setPeers(list)
    })

    ch.onEvent((e) => {
      const scene = sceneRef.current
      if (!scene) return
      switch (e.t) {
        case 'move':
          scene.moveActor(e.cid, e.from, e.to)
          break
        case 'act':
          scene.actActor(e.cid, e.key, e.from)
          break
        case 'hello':
          if (known.has(e.cid)) applyHello(e)
          else pending.set(e.cid, e)
          break
        case 'chat':
          setMessages((m) => (m.some((x) => x.id === e.msg.id) ? m : [...m, e.msg]))
          scene.sayActor(e.cid, e.msg.body)
          if (owner) store.markSeen(room.id)
          break
        case 'chat-del':
          setMessages((m) => m.filter((x) => x.id !== e.id))
          break
        case 'drop':
          setDrops((d) => (d.some((x) => x.id === e.drop.id) ? d : [...d, e.drop]))
          setFreshId(e.drop.id)
          break
        case 'drop-del':
          setDrops((d) => d.filter((x) => x.id !== e.id))
          break
        case 'room':
          setRoom((r) => r && { ...r, motto: e.motto, decor: e.decor })
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
  }, [roomId, entry, status, cid, owner])

  const send = (e: RoomEvent) => chRef.current?.send(e)

  if (status === 'loading') return <main className="screen center muted">방 문 여는 중…</main>
  if (status === 'kicked' || status === 'full') {
    return (
      <main className="screen center">
        <p>{status === 'kicked' ? '방 주인이 내보냈어요. 조금 있다가 다시 와 주세요' : `방이 꽉 찼어요 (최대 ${MAX_GUESTS}명). 조금 있다가 다시 와 주세요`}</p>
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
  const full = drops.length >= MAX_DROPS
  // 로컬 모드는 혼자 테스트하는 용도라 "방마다 1개" 제한을 두지 않는다
  const alreadyDropped = dropped && !backend.local
  const canDrop = entered && !ownerUi && !alreadyDropped && !full
  const pickedItem = item ? itemById(item) : undefined
  const link = roomUrl(window.location.href, room.slug)
  const placing = mode === 'place' || mode === 'write'

  const guestbook = [...drops].reverse()
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
    setMode('place')
  }

  const cancelDrop = () => {
    setMode('view')
    setItem(null)
    setGhost(null)
  }

  const submitDrop = async () => {
    if (!ghost || !entry || busy) return
    setBusy(true)
    try {
      const d = await backend.addDrop(room.id, {
        item: ghost.item,
        u: ghost.u,
        v: ghost.v,
        nickname: entry.name,
        message: message.trim(),
      })
      setDrops((prev) => [...prev, d])
      setFreshId(d.id)
      select(d)
      store.markDropped(room.id)
      setDropped(true)
      cancelDrop()
      setMessage('')
      send({ t: 'drop', cid, drop: d })
      if (!owner) void backend.notify(room.id, { kind: 'drop', name: entry.name, item: itemById(d.item)?.name })
      ctx.toast(`${room.owner.nickname}의 방에 놓고 왔어요!`)
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
      await backend.deleteDrop(room.id, d.id)
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
      sceneRef.current?.sayActor('me', body)
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
    if (!svgRef.current || busy) return
    setBusy(true)
    try {
      const blob = await renderStoryImage(svgRef.current, room, drops.length)
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

  const openFromBook = (d: Drop) => {
    setBookOpen(false)
    setChatOpen(false)
    select(d)
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
            sceneRef.current?.interactDrop(id)
          }}
        >
          {selectedItem && <SpriteIcon sprite={selectedItem.sprite} size={16} />} {selectedInter.verb}
        </button>
      )}
      {ownerUi &&
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
        drops={drops}
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

  return (
    <main className="room-screen" style={viewport}>
      {/* 방 그림이 화면 전체 */}
      <div className={`room-full ${placing ? 'is-placing' : ''}`}>
        <RoomScene
          key={entered ? 'in' : 'out'}
          svgRef={svgRef}
          controlRef={sceneRef}
          camera="free"
          fill
          decor={room.decor}
          look={meLook}
          name={entry?.name}
          badge={owner ? 'owner' : 'me'}
          spawn={entered && !owner ? ENTRANCE : CHARACTER_SPOT}
          drops={drops}
          ghost={ghost}
          selectedId={placing ? null : selected?.id}
          freshId={freshId}
          bubble={placing ? null : bubble}
          walkable={entered}
          onFloorTap={mode === 'place' && item ? (p) => setGhost({ item, ...p }) : undefined}
          onDropTap={placing ? undefined : (d) => select(selected?.id === d.id ? null : d)}
          onBackgroundTap={() => select(null)}
          onMeMove={(from, to) => send({ t: 'move', cid, from, to })}
          onMeAct={(key, from) => send({ t: 'act', cid, key, from })}
        />
        {!entered && (
          <div className="enter-overlay">
            <EnterSheet ctx={ctx} room={room} onEnter={setEntry} />
          </div>
        )}
      </div>

      {/* 위: 나가기 · 방 이름 · 방명록 · 메뉴 */}
      <header className="hud-top">
        <button className="hud-btn" onClick={() => ctx.go({ kind: 'home' })} aria-label="처음으로">
          <Icon id="back" />
        </button>
        <div className="hud-title">
          <b>{room.name}의 미니룸</b>
          {room.motto && <span>{room.motto}</span>}
        </div>
        {/* PC에서는 꾸미기·놓고 가기 버튼을 위쪽에 (휴대폰은 아래 떠 있는 버튼) */}
        {entered && !placing && (ownerUi || canDrop) && (
          <button className="hud-btn hud-wide" onClick={ownerUi ? startDecorate : startPick}>
            {ownerUi ? (
              <>
                <Icon id="paint" size={14} /> 꾸미기
              </>
            ) : (
              <>
                <SpriteIcon sprite={ITEMS.find((i) => i.id === 'gift')!.sprite} size={18} /> 아이템 놓고 가기
              </>
            )}
          </button>
        )}
        <button
          className="hud-btn hud-book"
          onClick={() => {
            setPage(0)
            setBookOpen(true)
          }}
          aria-label={`방명록 ${drops.length}개`}
        >
          <Icon id="book" />
          <span>{drops.length}</span>
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

      {menuOpen && (
        <>
          <div className="menu-backdrop" onClick={closeMenu} />
          <div className="menu" role="menu">
            <p className="menu-counter">
              TODAY {todayCount(room)} · TOTAL {room.totalVisits} · 아이템 {drops.length}/{MAX_DROPS}
            </p>
            {ownerUi ? (
              <>
                {menuItem(
                  <>
                    <Icon id="paint" size={14} /> 방 꾸미기
                  </>,
                  () => {
                    select(null)
                    setMode('decorate')
                  },
                )}
                {menuItem(room.motto ? '오늘의 한마디 고치기' : '오늘의 한마디 쓰기', () => setEditingMotto(room.motto))}
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
                {menuItem('직접 아이템 놓아 보기', () => {
                  select(null)
                  setGuestView(true)
                })}
                <hr />
                {menuItem('새 링크 만들기', () => setConfirmReset(true), 'is-quiet')}
                {menuItem('방 삭제하기', () => setConfirmRemoveRoom(true), 'is-danger')}
              </>
            ) : (
              <>
                {guestView && menuItem('내 방으로 돌아가기', () => setGuestView(false))}
                {entered && !canDrop && !guestView && (
                  <p className="menu-note">
                    {alreadyDropped ? '이 방엔 이미 하나 놓고 왔어요' : '방이 꽉 찼어요. 방 주인이 정리하면 다시 놓을 수 있어요'}
                  </p>
                )}
                {!guestView && menuItem('나도 내 방 만들기', goMakeRoom)}
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

      {mode === 'place' && <p className="place-hint">{ghost ? '다른 곳을 누르면 옮겨져요' : '놓을 자리를 눌러 줘 (끌면 둘러보기)'}</p>}

      {/* 아래: 놓기 버튼 · 수다방 */}
      {entered && (
        <div className="hud-bottom">
          {placing ? (
            <div className="row hud-place">
              <button className="btn" onClick={() => setMode('pick')}>
                다시 고르기
              </button>
              <button className="btn btn-primary" disabled={!ghost} onClick={() => setMode('write')}>
                여기에 놓기
              </button>
            </div>
          ) : (
            <>
              {!chatOpen && (ownerUi || canDrop) && (
                <div className="hud-fabs">
                  {ownerUi ? (
                    <button className="fab" onClick={startDecorate}>
                      <Icon id="paint" size={18} /> 꾸미기
                    </button>
                  ) : (
                    <button className="fab fab-primary" onClick={startPick}>
                      <SpriteIcon sprite={ITEMS.find((i) => i.id === 'gift')!.sprite} size={24} /> 아이템 놓고 가기
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

      {/* 방명록 */}
      <Sheet open={bookOpen} onClose={() => setBookOpen(false)} title={`방명록 ${drops.length}/${MAX_DROPS}`}>
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
                            {it?.name} · {timeAgo(d.createdAt)}
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
            <p className="muted book-tip">누르면 방에서 그 아이템을 보여줘요</p>
          </>
        )}
      </Sheet>

      {/* 아이템 고르기 */}
      <Sheet open={mode === 'pick'} onClose={cancelDrop} title="뭘 놓고 갈까?">
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
      <Sheet open={mode === 'write'} onClose={() => setMode('place')} title={`${pickedItem?.name ?? ''} 놓고 가기`}>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            submitDrop()
          }}
        >
          <p className="muted">
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
            {busy ? '놓는 중…' : '놓고 가기'}
          </button>
        </form>
      </Sheet>
    </main>
  )
}
