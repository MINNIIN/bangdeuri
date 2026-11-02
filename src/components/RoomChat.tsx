import { useEffect, useRef, useState } from 'react'
import { buildAvatar } from '../art/avatar'
import type { Peer } from '../lib/realtime'
import { CHAT_MAX, clip } from '../lib/rules'
import type { ChatMessage } from '../lib/types'
import { Icon, SpriteIcon } from './PixelSprite'

interface Props {
  messages: ChatMessage[]
  peers: Peer[]
  meCid: string
  /** 내가 방 주인인지 (지우기·내보내기) */
  owner: boolean
  /** 방 주인이 없던 동안 (마지막으로 본 때 ~ 들어온 때) */
  unread: { since: string; until: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSend: (body: string) => Promise<void>
  onDelete: (m: ChatMessage) => void
  onKick: (p: Peer) => void
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })

/** 화면 맨 아래 채팅 줄. 누르면 위로 올라와서 같이 있는 사람들 + 대화 기록 + 입력창 */
export function RoomChat({ messages, peers, meCid, owner, unread, open, onOpenChange, onSend, onDelete, onKick }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const logRef = useRef<HTMLOListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // 닫혀 있는 동안 새로 온 말 수
  const [seen, setSeen] = useState(messages.length)

  const missed = unread ? messages.filter((m) => !m.owner && m.createdAt > unread.since && m.createdAt <= unread.until) : []
  const firstUnread = missed[0]?.id
  const badge = open ? 0 : Math.max(messages.length - seen, missed.length)

  useEffect(() => {
    if (open) setSeen(messages.length)
  }, [open, messages.length])

  // 열리면 맨 아래로, 새 말이 오면 맨 아래로 (위로 올려 읽는 중이면 그대로)
  const last = messages[messages.length - 1]?.id
  useEffect(() => {
    const el = logRef.current
    if (!el || !open) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80 || !el.dataset.scrolled) {
      el.scrollTop = el.scrollHeight
      el.dataset.scrolled = '1'
    }
  }, [last, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const send = async () => {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    try {
      await onSend(body)
      setText('')
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const sorted = [...peers].sort((a, b) => Number(b.owner) - Number(a.owner) || Number(b.cid === meCid) - Number(a.cid === meCid))
  const lastMsg = messages[messages.length - 1]

  if (!open) {
    return (
      <button className="chat-dock" onClick={() => onOpenChange(true)} aria-label="수다방 열기">
        <Icon id="chat" size={16} />
        <span className="chat-dock-text">
          {lastMsg ? (
            <>
              <b>{lastMsg.name}</b> {lastMsg.body}
            </>
          ) : (
            <span className="muted">말 걸기</span>
          )}
        </span>
        {badge > 0 && <span className="chat-badge">{badge > 99 ? '99+' : badge}</span>}
        <span className="chat-dock-people">
          <Icon id="people" size={13} /> {peers.length}
        </span>
      </button>
    )
  }

  return (
    <section className="chat-panel" aria-label="수다방">
      <div className="chat-head">
        <span>
          <Icon id="chat" size={13} /> 수다방
        </span>
        <span className="counter">
          <Icon id="people" size={13} /> 지금 {peers.length}명
        </span>
        <button className="btn-ghost chat-close" onClick={() => onOpenChange(false)} aria-label="수다방 접기">
          <Icon id="close" size={12} />
        </button>
      </div>

      <ul className="peers">
        {sorted.map((p) => (
          <li key={p.cid}>
            <button
              className={`peer ${picked === p.cid ? 'is-on' : ''}`}
              onClick={() => setPicked(owner && !p.owner && p.cid !== meCid ? (picked === p.cid ? null : p.cid) : null)}
            >
              <SpriteIcon sprite={buildAvatar(p.look)} size={30} />
              <span>
                {p.owner && <Icon id="crown" size={11} />}
                {p.name}
                {p.cid === meCid && <em> (나)</em>}
              </span>
            </button>
            {picked === p.cid && (
              <button
                className="btn btn-small btn-danger peer-kick"
                onClick={() => {
                  setPicked(null)
                  onKick(p)
                }}
              >
                내보내기
              </button>
            )}
          </li>
        ))}
      </ul>

      {missed.length > 0 && <p className="chat-unread">내가 없는 동안 새 대화 {missed.length}개</p>}

      <ol className="chat-log" ref={logRef}>
        {messages.length === 0 && <li className="muted chat-empty">아직 아무 말도 없어요. 먼저 인사해 볼까요?</li>}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const newDay = !prev || day(prev.createdAt) !== day(m.createdAt)
          return (
            <li key={m.id} className={m.owner ? 'is-owner' : ''}>
              {newDay && <p className="chat-day">{day(m.createdAt)}</p>}
              {m.id === firstUnread && <p className="chat-day is-new">여기부터 새 대화</p>}
              <div className="chat-line">
                <b>
                  {m.owner && <Icon id="crown" size={11} />}
                  {m.name}
                </b>
                <span className="chat-body">{m.body}</span>
                <span className="chat-time">{time(m.createdAt)}</span>
                {owner && (
                  <button className="chat-del" onClick={() => onDelete(m)} aria-label="이 말 지우기">
                    <Icon id="close" size={9} />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(clip(e.target.value, CHAT_MAX))}
          placeholder="말 걸기"
          aria-label="채팅 입력"
          enterKeyHint="send"
          autoFocus
        />
        <button className="btn btn-primary btn-small" disabled={!text.trim() || busy} aria-label="보내기">
          <Icon id="send" size={14} />
        </button>
      </form>
    </section>
  )
}
