import { useEffect, useState } from 'react'
import type { AppContext } from '../App'
import { backend } from '../lib/backend'
import { errorText } from '../lib/rules'
import type { Feedback } from '../lib/types'
import { Icon } from './PixelSprite'

/** 개발자에게 온 한마디 (개발자 목록의 계정만 열린다. 서버 권한으로도 막혀 있다) */
export function InboxScreen({ ctx }: { ctx: AppContext }) {
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading')
  const [list, setList] = useState<Feedback[]>([])

  const load = async () => {
    setState('loading')
    try {
      if (!(await backend.isAdmin())) return setState('forbidden')
      setList(await backend.listFeedback())
      setState('ok')
    } catch {
      setState('error')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const open = async (f: Feedback) => {
    if (f.read) return
    setList((l) => l.map((x) => (x.id === f.id ? { ...x, read: true } : x)))
    await backend.markFeedbackRead(f.id).catch((e) => ctx.toast(errorText(e)))
  }
  const remove = async (f: Feedback) => {
    try {
      await backend.deleteFeedback(f.id)
      setList((l) => l.filter((x) => x.id !== f.id))
    } catch (e) {
      ctx.toast(errorText(e))
    }
  }

  const unread = list.filter((f) => !f.read).length

  return (
    <main className="screen inbox">
      <nav className="topbar">
        <button className="btn-ghost" onClick={() => ctx.go({ kind: 'home' })} aria-label="뒤로">
          <Icon id="back" />
        </button>
        <span className="topbar-title">💌 받은 메시지{state === 'ok' ? ` ${list.length}` : ''}</span>
        <span className="topbar-spacer" />
      </nav>

      {state === 'loading' && <p className="muted center">불러오는 중…</p>}
      {state === 'forbidden' && <p className="muted center">개발자 계정만 볼 수 있어요</p>}
      {state === 'error' && (
        <div className="center">
          <p className="muted">불러오지 못했어요</p>
          <button className="btn" onClick={() => void load()}>
            다시 시도
          </button>
        </div>
      )}
      {state === 'ok' &&
        (list.length === 0 ? (
          <p className="muted center">아직 온 메시지가 없어요</p>
        ) : (
          <>
            {unread > 0 && <p className="panel-tip">안 읽은 메시지 {unread}개 · 누르면 읽음으로 바뀌어요</p>}
            <ul className="inbox-list">
              {list.map((f) => (
                <li key={f.id}>
                  <button className={`inbox-item ${f.read ? '' : 'is-new'}`} onClick={() => void open(f)}>
                    <span className="inbox-head">
                      <b>{f.nickname ?? '이름 없음'}</b>
                      <span className="muted">{when(f.createdAt)}</span>
                      {!f.read && <span className="inbox-dot" aria-label="안 읽음" />}
                    </span>
                    <span className="inbox-body">{f.body}</span>
                    {f.contact && <span className="inbox-contact">연락처: {f.contact}</span>}
                  </button>
                  <button className="link danger inbox-del" onClick={() => void remove(f)}>
                    지우기
                  </button>
                </li>
              ))}
            </ul>
          </>
        ))}
    </main>
  )
}

/** 11월 13일 오후 2:05 */
function when(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' })
}
