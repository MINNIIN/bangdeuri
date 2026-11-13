import { useEffect, useState } from 'react'
import type { AppContext } from '../App'
import { buildAvatar, PRESET_LOOKS } from '../art/avatar'
import { defaultDecor } from '../art/decor'
import { ITEMS } from '../art/items'
import { themeById } from '../art/themes'
import { backend } from '../lib/backend'
import { allOff, isIOS, needsUpgrade, prefsFor, pushSupport, savedPrefs, setPushPrefs } from '../lib/push'
import { charLength, clip, errorText, FEEDBACK_CONTACT_MAX, FEEDBACK_MAX } from '../lib/rules'
import { store, type VisitedRoom } from '../lib/storage'
import type { Drop, PushPrefs, Room } from '../lib/types'
import { InstallCard } from './InstallCard'
import { Icon, SpriteIcon } from './PixelSprite'
import { RoomScene } from './RoomScene'
import { Sheet } from './Sheet'

// 첫 화면 예시 방: 친구들이 놓고 간 것처럼 몇 개 깔아 둔다
const demo = (item: string, u: number, v: number): Drop => ({
  id: `demo-${item}`,
  roomId: 'demo',
  item,
  place: 'in',
  u,
  v,
  nickname: '',
  message: '',
  createdAt: '',
})
const DEMO_DROPS = [
  demo('plant', 0.42, 0.06),
  demo('ramen', 0.3, 0.3),
  demo('teddy', 0.7, 0.24),
  demo('balloon', 0.44, 0.44),
  demo('poop', 0.58, 0.82),
  demo('cat', 0.2, 0.68),
  demo('disco', 0.46, 0.62),
]

const DEMO_DECOR = defaultDecor('pink')

const DEMO_NOTES = [
  { who: '지윤', item: 'ramen', text: '맨날 라면만 먹는 너에게' },
  { who: '수상한 고구마', item: 'poop', text: '누군지 맞혀 봐 ㅋ' },
  { who: '하린', item: 'teddy', text: '안고 자라고 놓고 감' },
]

export function Home({ ctx }: { ctx: AppContext }) {
  return ctx.user && ctx.profile ? <Dashboard ctx={ctx} /> : <Landing ctx={ctx} />
}

/** 로그인 전 첫 화면 */
function Landing({ ctx }: { ctx: AppContext }) {
  return (
    <main className="screen home">
      <header className="home-head">
        <p className="eyebrow">친구들이 놀러 오는 미니룸</p>
        <h1 className="logo">방들이</h1>
        <p className="lead">
          내 방 링크를 보내면 친구들이 놀러 와서
          <br />
          같이 돌아다니고, 수다 떨고, 선물을 놓고 가요
        </p>
      </header>

      <section className="window">
        <div className="window-bar">
          <span>내친구의 미니룸</span>
          <span className="counter">TODAY 12 | TOTAL 128</span>
        </div>
        <RoomScene decor={DEMO_DECOR} look={PRESET_LOOKS[0].look} drops={DEMO_DROPS} className="room" walkable />
        <ul className="demo-notes">
          {DEMO_NOTES.map((n) => (
            <li key={n.who}>
              <b>{n.who}</b>
              <span className="muted">{ITEMS.find((i) => i.id === n.item)?.name}</span>
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="actions">
        <button className="btn btn-primary btn-big" onClick={() => ctx.go({ kind: 'login' })}>
          내 방 만들러 가기
        </button>
      </div>

      <VisitedRooms ctx={ctx} />

      <InstallCard reason="앱처럼 아이콘 한 번에 바로 열려요" />

      <ol className="steps">
        <li>
          <b>1</b>내 미니미 만들고 방 고르기
        </li>
        <li>
          <b>2</b>친구들에게 방 링크 보내기
        </li>
        <li>
          <b>3</b>놀러 온 친구들이랑 같이 놀기
        </li>
      </ol>
      <FeedbackButton ctx={ctx} />
      <a className="link center-link" href="/privacy.html">
        개인정보처리방침
      </a>
      <p className="made-by">made by mingcoding_</p>
    </main>
  )
}

/** 로그인한 회원의 첫 화면: 내 미니미, 내 방들, 알림 설정 */
function Dashboard({ ctx }: { ctx: AppContext }) {
  const profile = ctx.profile!
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [unread, setUnread] = useState<Record<string, number>>({})

  useEffect(() => {
    let alive = true
    backend
      .myRooms()
      .then(async (list) => {
        if (!alive) return
        setRooms(list)
        // 없는 동안 친구들이 남긴 대화 수
        const counts = await Promise.all(
          list.map((r) => backend.countMessagesSince(r.id, store.seenAt(r.id) ?? r.createdAt).catch(() => 0)),
        )
        if (alive) setUnread(Object.fromEntries(list.map((r, i) => [r.id, counts[i]])))
      })
      .catch(() => alive && setRooms([]))
    return () => {
      alive = false
    }
  }, [])

  return (
    <main className="screen home dashboard">
      <header className="me-card">
        <SpriteIcon sprite={buildAvatar(profile.look)} size={84} className="me-avatar" />
        <div className="me-body">
          <p className="eyebrow">반가워요</p>
          <h1 className="me-name">{profile.nickname}</h1>
          <button className="btn btn-small" onClick={() => ctx.go({ kind: 'me' })}>
            <Icon id="paint" size={14} /> 내 미니미 꾸미기
          </button>
        </div>
      </header>

      <InstallCard reason="앱처럼 바로 열고, 친구가 놀러 오면 알림도 받아요" />

      <section className="my-rooms">
        <h2>
          내 방 <span className="muted">{rooms?.length ?? ''}</span>
        </h2>
        {rooms === null ? (
          <p className="muted">불러오는 중…</p>
        ) : rooms.length === 0 ? (
          <p className="owner-tip">아직 방이 없어요. 방을 만들고 친구들을 불러 봐요</p>
        ) : (
          <ul>
            {rooms.map((r) => (
              <li key={r.id}>
                <button className="my-room" onClick={() => ctx.go({ kind: 'room', slug: r.slug })}>
                  <SpriteIcon sprite={buildAvatar(profile.look)} size={40} />
                  <span className="my-room-body">
                    <b>{r.name}의 미니룸</b>
                    <span className="muted">
                      {themeById(r.theme).name} · TOTAL {r.totalVisits}
                    </span>
                  </span>
                  {unread[r.id] > 0 && (
                    <span className="unread" aria-label={`새 대화 ${unread[r.id]}개`}>
                      <Icon id="chat" size={12} /> {unread[r.id]}
                    </span>
                  )}
                  <span className="my-room-go" aria-hidden>
                    <Icon id="send" size={12} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="actions">
        <button className={`btn ${rooms?.length ? '' : 'btn-primary'}`} onClick={() => ctx.go({ kind: 'create' })}>
          {rooms?.length ? '방 하나 더 만들기' : '내 방 만들기'}
        </button>
      </div>

      <VisitedRooms ctx={ctx} />

      <NotifySettings ctx={ctx} />

      <AdminInbox ctx={ctx} />
      <FeedbackButton ctx={ctx} />

      <button className="link center-link" onClick={() => backend.signOut().then(() => ctx.toast('로그아웃했어요'))}>
        로그아웃
      </button>
      <a className="link center-link" href="/privacy.html">
        개인정보처리방침
      </a>
      <p className="made-by">made by mingcoding_</p>
    </main>
  )
}

/** 서버 목록 + 이 브라우저 목록: 같은 방은 하나로 (방 이름·링크는 서버 것이 최신), 최근 순 */
function mergeFriends(server: VisitedRoom[], local: VisitedRoom[]) {
  const byId = new Map<string, VisitedRoom>()
  for (const v of local) byId.set(v.id, v)
  for (const v of server) {
    const prev = byId.get(v.id)
    byId.set(v.id, prev && prev.at > v.at ? { ...v, at: prev.at } : v)
  }
  return [...byId.values()].sort((a, b) => b.at.localeCompare(a.at))
}

/**
 * 친구 방: 링크를 다시 찾지 않아도 바로 들어간다.
 * 로그인했으면 계정의 서버 기록(이웃)에서 와서 카톡·인스타 안 브라우저, 홈 화면 앱, PC 어디서 열어도 같다.
 * 로그인 전에 이 브라우저에서 들어간 방은 로그인하는 순간 계정 기록으로 옮긴다
 */
function VisitedRooms({ ctx }: { ctx: AppContext }) {
  const [local, setLocal] = useState<VisitedRoom[]>(() => store.visits())
  const [server, setServer] = useState<VisitedRoom[]>([])
  const [asking, setAsking] = useState<VisitedRoom | null>(null)
  const [busy, setBusy] = useState(false)
  const userId = ctx.user?.id ?? null
  const hasProfile = !!ctx.profile

  useEffect(() => {
    if (!userId) return setServer([])
    let alive = true
    ;(async () => {
      // 로그인 전에 이 브라우저에서 이름을 밝히고 들어간 친구 방을 내 계정 기록으로 옮긴다 (프로필이 있어야 이웃이 된다)
      if (hasProfile) {
        const pending = store.visits().filter((v) => v.named && !v.synced && v.ownerId !== userId)
        const done = await Promise.allSettled(pending.map((v) => backend.becomeNeighbor(v.id)))
        store.markVisitsSynced(pending.filter((_, i) => done[i].status === 'fulfilled').map((v) => v.id))
      }
      const fr = await backend.friendRooms()
      if (!alive) return
      setServer(fr.map(({ room, at }) => ({ id: room.id, slug: room.slug, name: room.name, ownerId: room.ownerId, owner: room.owner, at })))
      setLocal(store.visits())
    })().catch((e) => console.error('친구 방 목록을 서버에서 못 불러왔어요', e))
    return () => {
      alive = false
    }
  }, [userId, hasProfile])

  // 내 방은 '내 방'에 따로 나온다
  const shown = mergeFriends(server, local).filter((v) => v.ownerId !== userId)
  if (shown.length === 0) return null

  // 목록에서 지우면 동네 골목에서도 뺀다 (로그인했을 때만 이웃이 있다)
  const forget = async (v: VisitedRoom) => {
    if (busy) return
    setBusy(true)
    try {
      if (ctx.user) await backend.forgetNeighbor(v.id)
      store.forgetVisit(v.id)
      setLocal(store.visits())
      // 서버 기록은 그 친구(주인)와의 이웃이 통째로 끊긴다
      setServer((s) => s.filter((x) => x.ownerId !== v.ownerId))
      setAsking(null)
    } catch (e) {
      ctx.toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="my-rooms visited-rooms">
      <h2>
        친구 방 <span className="muted">{shown.length}</span>
      </h2>
      <ul>
        {shown.map((v) => (
          <li key={v.id} className="visited-room">
            <button className="my-room" onClick={() => ctx.go({ kind: 'room', slug: v.slug })}>
              <SpriteIcon sprite={buildAvatar(v.owner.look)} size={40} />
              <span className="my-room-body">
                <b>{v.name}의 미니룸</b>
                <span className="muted">
                  {v.owner.nickname} · {ago(v.at)}
                </span>
              </span>
              <span className="my-room-go" aria-hidden>
                <Icon id="send" size={12} />
              </span>
            </button>
            <button className="visited-forget" aria-label={`${v.name}의 미니룸 목록에서 지우기`} onClick={() => setAsking(v)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <p className="panel-tip">
        {ctx.user
          ? '내 계정에 저장돼서 카톡·인스타로 들어간 방도 어디서 열든 여기 모여요'
          : '이 브라우저에서 들어간 방만 기억해요. 로그인하면 카톡·인스타 어디서 들어간 방이든 한곳에 모여요'}
      </p>
      <Sheet open={asking !== null} onClose={() => !busy && setAsking(null)} title="친구 방 지우기">
        {asking && (
          <>
            <p className="confirm-text">
              {asking.name}의 미니룸을 목록에서 지울까요?
              {ctx.user && (
                <>
                  <br />
                  {asking.owner.nickname}님과 서로의 동네 골목에서도 집이 없어져요. 다시 놀러 가면 다시 이웃이 돼요.
                </>
              )}
            </p>
            <div className="row">
              <button className="btn" onClick={() => setAsking(null)} disabled={busy}>
                그냥 둘래
              </button>
              <button className="btn btn-danger" onClick={() => void forget(asking)} disabled={busy}>
                {busy ? '지우는 중…' : '지우기'}
              </button>
            </div>
          </>
        )}
      </Sheet>
    </section>
  )
}

/** 마지막으로 간 때 */
function ago(iso: string, now = Date.now()) {
  const min = Math.floor((now - new Date(iso).getTime()) / 60000)
  if (!(min >= 0)) return ''
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`
  return `${Math.floor(min / 60 / 24)}일 전`
}

function NotifySettings({ ctx }: { ctx: AppContext }) {
  const support = pushSupport()
  const [prefs, setPrefs] = useState<PushPrefs>(savedPrefs)
  const [busy, setBusy] = useState(false)

  const on = !allOff(prefs)

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      setPrefs(await setPushPrefs(prefsFor(!on)))
    } catch (e) {
      ctx.toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  // 예전에 종류별로 일부만 켜 둔 기기는 조용히 전부 켜짐으로 (이미 알림을 허락한 경우만)
  useEffect(() => {
    if (support !== 'ok' || !needsUpgrade(prefs) || Notification.permission !== 'granted') return
    setPushPrefs(prefsFor(true))
      .then(setPrefs)
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tip =
    support === 'local'
      ? '테스트 모드에서는 알림을 보낼 수 없어요. 배포하면 켤 수 있어요'
      : support === 'no-key'
        ? '알림 키(VITE_VAPID_PUBLIC_KEY)가 아직 설정되지 않았어요'
        : support === 'ios-home'
          ? '아이폰은 Safari 공유 버튼 > "홈 화면에 추가"로 앱을 깔아야 알림을 받을 수 있어요'
          : support === 'unsupported'
            ? '이 브라우저는 알림을 지원하지 않아요'
            : null

  return (
    <section className="panel notify">
      <p className="panel-label">
        <Icon id="bell" size={14} /> 알림
      </p>
      {tip ? (
        <p className="panel-tip">{tip}</p>
      ) : (
        <>
          <Toggle on={on} disabled={busy} onClick={() => void toggle()} label="알림 받기" />
          <p className="panel-tip">친구가 놀러 오거나, 선물·일정을 남기거나, 알람 시각이 되면 알려 줘요</p>
          <p className="panel-tip">이 기기에서만 켜져요{isIOS() ? '' : '. 휴대폰에서 받으려면 휴대폰에서도 켜 주세요'}</p>
        </>
      )}
    </section>
  )
}

function Toggle({ on, disabled, onClick, label }: { on: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button className={`toggle ${on ? 'is-on' : ''}`} role="switch" aria-checked={on} disabled={disabled} onClick={onClick}>
      <span>{label}</span>
      <span className="toggle-knob" aria-hidden />
    </button>
  )
}

/** 개발자에게 한마디: 피드백·버그·그냥 인사. 로그인 안 해도 보낼 수 있다 */
function FeedbackButton({ ctx }: { ctx: AppContext }) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const name = ctx.profile?.nickname ?? store.guest()?.nickname ?? ''

  const send = async () => {
    if (busy || !body.trim()) return
    setBusy(true)
    try {
      await backend.sendFeedback({ body, nickname: name, contact }, store.deviceKey())
      void backend.notifyAdmins()
      setBody('')
      setContact('')
      setOpen(false)
      ctx.toast('보냈어요! 고마워요 💌')
    } catch (e) {
      ctx.toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className="btn feedback-open" onClick={() => setOpen(true)}>
        💌 개발자에게 한마디
      </button>
      <Sheet open={open} onClose={() => !busy && setOpen(false)} title="개발자에게 한마디">
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <p className="muted">하고 싶은 말, 불편한 점, 바라는 기능 뭐든 좋아요. 개발자만 읽어요{name ? ` (${name} 이름으로 보내요)` : ''}</p>
          <label className="field">
            <span>
              한마디 <em>{charLength(body)}/{FEEDBACK_MAX}</em>
            </span>
            <textarea rows={4} value={body} onChange={(e) => setBody(clip(e.target.value, FEEDBACK_MAX))} placeholder="예: 그네 너무 재밌어요! 시소도 같이 타고 싶어요" />
          </label>
          <label className="field">
            <span>
              답장 받을 연락처 <em>선택</em>
            </span>
            <input value={contact} onChange={(e) => setContact(clip(e.target.value, FEEDBACK_CONTACT_MAX))} placeholder="인스타 아이디, 이메일 등" />
          </label>
          <button className="btn btn-primary" disabled={busy || !body.trim()}>
            {busy ? '보내는 중…' : '보내기'}
          </button>
        </form>
      </Sheet>
    </>
  )
}

/** 개발자 계정에만 보이는 받은 메시지함 입구 */
function AdminInbox({ ctx }: { ctx: AppContext }) {
  const [unread, setUnread] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    backend
      .isAdmin()
      .then(async (ok) => {
        if (!ok || !alive) return
        const list = await backend.listFeedback()
        if (alive) setUnread(list.filter((f) => !f.read).length)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  if (unread === null) return null
  return (
    <button className="btn admin-inbox" onClick={() => ctx.go({ kind: 'inbox' })}>
      💌 받은 메시지{unread > 0 ? <span className="unread"> 새 {unread}</span> : ''}
    </button>
  )
}
