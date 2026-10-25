import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppContext } from '../App'
import { ITEMS, itemById } from '../art/items'
import { backend } from '../lib/backend'
import { roomUrl } from '../lib/links'
import {
  charLength,
  clip,
  errorText,
  kstDate,
  MAX_DROPS,
  MESSAGE_MAX,
  MOTTO_MAX,
  NICK_MAX,
  todayCount,
} from '../lib/rules'
import { renderStoryImage } from '../lib/shareImage'
import { firstVisitThisSession, store } from '../lib/storage'
import type { Drop, Room } from '../lib/types'
import { SpriteIcon } from './PixelSprite'
import { type Ghost, RoomScene } from './RoomScene'
import { Sheet } from './Sheet'

type Mode = 'view' | 'pick' | 'place' | 'write'

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

export function RoomScreen({ ctx, roomId }: { ctx: AppContext; roomId: string }) {
  const [room, setRoom] = useState<Room | null>(null)
  const [drops, setDrops] = useState<Drop[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [mode, setMode] = useState<Mode>('view')
  const [item, setItem] = useState<string | null>(null)
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const [nickname, setNickname] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Drop | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [freshId, setFreshId] = useState<string | null>(null)
  const [dropped, setDropped] = useState(() => store.hasDropped(roomId))
  const [editingMotto, setEditingMotto] = useState<string | null>(null)
  const [bookOpen, setBookOpen] = useState(false)
  const [page, setPage] = useState(0)
  // 방 주인이 "친구에게 어떻게 보이는지" 확인하면서 직접 놓아 볼 수 있는 모드
  const [guestView, setGuestView] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const roomRef = useRef<HTMLElement>(null)

  const secret = store.secretFor(roomId)
  const isOwner = secret !== null && !guestView

  const reloadDrops = useCallback(async () => {
    try {
      setDrops(await backend.listDrops(roomId))
    } catch {
      // 조용히 다음 기회에 다시
    }
  }, [roomId])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [r, d] = await Promise.all([backend.getRoom(roomId), backend.listDrops(roomId)])
        if (!alive) return
        if (!r) return setStatus('missing')
        setRoom(r)
        setDrops(d)
        setStatus('ready')
        if (store.secretFor(roomId) === null && firstVisitThisSession(roomId)) {
          const counts = await backend.visit(roomId)
          if (alive) setRoom({ ...r, todayVisits: counts.today, totalVisits: counts.total, todayDate: kstDate() })
        }
      } catch {
        if (alive) setStatus('error')
      }
    })()
    return () => {
      alive = false
    }
  }, [roomId])

  // 다른 앱 갔다 돌아오면 새로 놓인 아이템을 불러온다
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reloadDrops()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reloadDrops])

  if (status === 'loading') return <main className="screen center muted">방 문 여는 중…</main>
  if (status !== 'ready' || !room) {
    return (
      <main className="screen center">
        <p>{status === 'missing' ? '이 방은 찾을 수 없어요' : '방을 불러오지 못했어요'}</p>
        <button className="btn btn-primary" onClick={() => ctx.go({ kind: 'create' })}>
          내 방 만들기
        </button>
      </main>
    )
  }

  const full = drops.length >= MAX_DROPS
  // 로컬 모드는 혼자 테스트하는 용도라 "방마다 1개" 제한을 두지 않는다
  const alreadyDropped = dropped && !backend.local
  const canDrop = !isOwner && !alreadyDropped && !full
  const pickedItem = item ? itemById(item) : undefined
  const link = roomUrl(window.location.href, room.id)
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
    if (!ghost || !nickname.trim() || busy) return
    setBusy(true)
    try {
      const d = await backend.addDrop(room.id, {
        item: ghost.item,
        u: ghost.u,
        v: ghost.v,
        nickname: nickname.trim(),
        message: message.trim(),
      })
      setDrops((prev) => [...prev, d])
      setFreshId(d.id)
      select(d)
      store.markDropped(room.id)
      setDropped(true)
      cancelDrop()
      setMessage('')
      ctx.toast(`${room.name}의 방에 놓고 왔어요!`)
    } catch (e) {
      ctx.toast(errorText(e))
      if (e instanceof Error && e.message === 'room_full') {
        cancelDrop()
        reloadDrops()
      }
    } finally {
      setBusy(false)
    }
  }

  const removeDrop = async (d: Drop) => {
    if (!secret) return
    try {
      await backend.deleteDrop(room.id, secret, d.id)
      setDrops((prev) => prev.filter((x) => x.id !== d.id))
      select(null)
      ctx.toast('치웠어요')
    } catch (e) {
      ctx.toast(errorText(e))
    }
  }

  const saveMotto = async () => {
    if (!secret || editingMotto === null) return
    const motto = editingMotto.trim()
    try {
      await backend.updateMotto(room.id, secret, motto)
      setRoom({ ...room, motto })
      setEditingMotto(null)
    } catch (e) {
      ctx.toast(errorText(e))
    }
  }

  const shareStory = async () => {
    if (!svgRef.current || busy) return
    setBusy(true)
    try {
      const blob = await renderStoryImage(svgRef.current, room, drops.length)
      const file = new File([blob], `bangdeuri-${room.id}.png`, { type: 'image/png' })
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
    const text = `${room.name}의 방들이에 와 줘! 뭐 하나 놓고 가`
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
    select(d)
    roomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const selectedItem = selected ? itemById(selected.item) : undefined
  const bubble = selected && (
    <>
      <p className="bubble-head">
        <b>{selected.nickname}</b>
        <span className="muted">
          {selectedItem?.name} · {timeAgo(selected.createdAt)}
        </span>
      </p>
      <p className="bubble-msg">{selected.message || '(말없이 놓고 감)'}</p>
      {isOwner &&
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

  return (
    <main className="screen room-screen">
      <nav className="topbar">
        <button className="btn-ghost" onClick={() => ctx.go({ kind: 'home' })} aria-label="처음으로">
          ←
        </button>
        <span className="topbar-title">방들이</span>
        <span className="topbar-spacer" />
      </nav>

      {guestView && (
        <p className="guest-banner">
          친구에게는 이렇게 보여요
          <button className="link" onClick={() => setGuestView(false)}>
            내 방으로 돌아가기
          </button>
        </p>
      )}

      <section ref={roomRef} className={`window ${placing ? 'is-placing' : ''}`}>
        <div className="window-bar">
          <span>{room.name}의 미니룸</span>
          <span className="counter">
            TODAY {todayCount(room)} | TOTAL {room.totalVisits}
          </span>
        </div>

        {editingMotto !== null ? (
          <form
            className="motto motto-edit"
            onSubmit={(e) => {
              e.preventDefault()
              saveMotto()
            }}
          >
            <input
              value={editingMotto}
              onChange={(e) => setEditingMotto(clip(e.target.value, MOTTO_MAX))}
              placeholder="오늘의 한마디"
              autoFocus
            />
            <button className="btn btn-small btn-primary">저장</button>
          </form>
        ) : (
          (room.motto || isOwner) && (
            <p className="motto">
              <span>{room.motto || '오늘의 한마디를 남겨 보세요'}</span>
              {isOwner && (
                <button className="link" onClick={() => setEditingMotto(room.motto)}>
                  수정
                </button>
              )}
            </p>
          )
        )}

        <div className="room-wrap">
          <RoomScene
            svgRef={svgRef}
            theme={room.theme}
            character={room.character}
            drops={drops}
            ghost={ghost}
            selectedId={placing ? null : selected?.id}
            freshId={freshId}
            bubble={placing ? null : bubble}
            rotatable
            onFloorTap={mode === 'place' && item ? (p) => setGhost({ item, ...p }) : undefined}
            onDropTap={placing ? undefined : (d) => select(selected?.id === d.id ? null : d)}
            onBackgroundTap={() => select(null)}
          />
          {mode === 'place' && (
            <p className="place-hint">{ghost ? '다른 곳을 누르면 옮겨져요' : '놓을 자리를 눌러 줘'}</p>
          )}
        </div>

        <div className="room-foot">
          <span className="muted">
            놓고 간 아이템 {drops.length}/{MAX_DROPS}
          </span>
          <button className="btn btn-small" onClick={() => (setPage(0), setBookOpen(true))}>
            방명록 보기 {drops.length}
          </button>
        </div>
      </section>

      {/* 아래 행동 버튼 */}
      {placing ? (
        <div className="actions sticky row">
          <button className="btn" onClick={() => setMode('pick')}>
            다시 고르기
          </button>
          <button className="btn btn-primary" disabled={!ghost} onClick={() => setMode('write')}>
            여기에 놓기
          </button>
        </div>
      ) : isOwner ? (
        <div className="actions">
          {drops.length === 0 && (
            <p className="owner-tip">
              아직 텅 빈 방이에요. 스토리에 올리고 링크 스티커를 붙이면 친구들이 채워 줘요
            </p>
          )}
          <button className="btn btn-primary" onClick={shareStory} disabled={busy}>
            {busy ? '이미지 만드는 중…' : '스토리 이미지 저장하기'}
          </button>
          <div className="row">
            <button className="btn" onClick={copyLink}>
              링크 복사
            </button>
            <button className="btn" onClick={shareLink}>
              친구에게 보내기
            </button>
          </div>
          <button
            className="link center-link"
            onClick={() => {
              select(null)
              setGuestView(true)
            }}
          >
            친구 입장으로 보기 (직접 아이템 놓아 보기)
          </button>
        </div>
      ) : (
        <div className="actions">
          {canDrop ? (
            <button className="btn btn-primary btn-big" onClick={startPick}>
              <SpriteIcon sprite={ITEMS.find((i) => i.id === 'gift')!.sprite} size={28} />
              {room.name}의 방에 아이템 놓고 가기
            </button>
          ) : (
            <p className="owner-tip">
              {alreadyDropped ? '이 방엔 이미 하나 놓고 왔어요' : '방이 꽉 찼어요. 방 주인이 정리하면 다시 놓을 수 있어요'}
            </p>
          )}
          {!guestView && (
            <button className={`btn ${canDrop ? '' : 'btn-primary'}`} onClick={() => ctx.go({ kind: 'create' })}>
              나도 내 방 만들기
            </button>
          )}
        </div>
      )}

      {/* 방명록 */}
      <Sheet open={bookOpen} onClose={() => setBookOpen(false)} title={`방명록 ${drops.length}`}>
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
        <div className="item-grid">
          {ITEMS.map((it) => (
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
          <label className="field">
            <span>
              내 닉네임 <em>{charLength(nickname)}/{NICK_MAX}</em>
            </span>
            <input
              value={nickname}
              onChange={(e) => setNickname(clip(e.target.value, NICK_MAX))}
              placeholder={`${room.name}이(가) 알아볼 이름`}
              required
            />
          </label>
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
          <button className="btn btn-primary" disabled={!nickname.trim() || busy}>
            {busy ? '놓는 중…' : '놓고 가기'}
          </button>
        </form>
      </Sheet>
    </main>
  )
}
