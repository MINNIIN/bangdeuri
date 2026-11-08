import { useEffect, useState } from 'react'
import type { AppContext } from '../App'
import { buildAvatar, PRESET_LOOKS } from '../art/avatar'
import { defaultDecor } from '../art/decor'
import { ITEMS } from '../art/items'
import { themeById } from '../art/themes'
import { backend } from '../lib/backend'
import { allOff, isIOS, needsUpgrade, prefsFor, pushSupport, savedPrefs, setPushPrefs } from '../lib/push'
import { errorText } from '../lib/rules'
import { store, type VisitedRoom } from '../lib/storage'
import type { Drop, PushPrefs, Room } from '../lib/types'
import { InstallCard } from './InstallCard'
import { Icon, SpriteIcon } from './PixelSprite'
import { RoomScene } from './RoomScene'

// 첫 화면 예시 방: 친구들이 놓고 간 것처럼 몇 개 깔아 둔다
const demo = (item: string, u: number, v: number): Drop => ({
  id: `demo-${item}`,
  roomId: 'demo',
  item,
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
      <a className="link center-link" href="/privacy.html">
        개인정보처리방침
      </a>
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

      <button className="link center-link" onClick={() => backend.signOut().then(() => ctx.toast('로그아웃했어요'))}>
        로그아웃
      </button>
      <a className="link center-link" href="/privacy.html">
        개인정보처리방침
      </a>
    </main>
  )
}

/** 놀러 갔던 친구 방: 링크를 다시 찾지 않아도 바로 들어간다 (이 기기에 기억) */
function VisitedRooms({ ctx }: { ctx: AppContext }) {
  const [list, setList] = useState<VisitedRoom[]>(() => store.visits())
  // 내 방은 '내 방'에 따로 나온다
  const shown = list.filter((v) => v.ownerId !== ctx.user?.id)
  if (shown.length === 0) return null

  const forget = (id: string) => {
    store.forgetVisit(id)
    setList(store.visits())
  }

  return (
    <section className="my-rooms visited-rooms">
      <h2>
        놀러 간 방 <span className="muted">{shown.length}</span>
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
            <button className="visited-forget" aria-label={`${v.name}의 미니룸 목록에서 지우기`} onClick={() => forget(v.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <p className="panel-tip">이 기기에서 들어간 방만 기억해요. 주인이 링크를 새로 만들면 새 링크로 한 번 더 들어와 주세요</p>
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
