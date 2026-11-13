import { useEffect, useState } from 'react'
import type { AppContext } from '../App'
import { backend } from '../lib/backend'
import { type EntryStat, sumBy } from '../lib/entry'
import { kstDate } from '../lib/rules'
import { Icon } from './PixelSprite'

const NAMES: Record<string, string> = {
  insta: '인스타',
  threads: '스레드',
  kakao: '카톡',
  facebook: '페이스북',
  naver: '네이버',
  google: '구글',
  line: '라인',
  x: 'X',
  yt: '유튜브',
  invite: '친구 초대 링크',
  direct: '직접 (주소·북마크)',
  web: '다른 사이트',
  pwa: '홈 화면 앱',
  browser: '일반 브라우저',
  etc: '기타',
  home: '첫 화면',
  room: '친구 방',
}
const label = (k: string) => NAMES[k] ?? k

const RANGES = [
  { days: 1, text: '오늘' },
  { days: 7, text: '7일' },
  { days: 30, text: '30일' },
] as const

/** 유입 통계 (개발자 계정만. 숫자만 있고 누가 왔는지는 없다) */
export function StatsScreen({ ctx }: { ctx: AppContext }) {
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading')
  const [stats, setStats] = useState<EntryStat[]>([])
  const [days, setDays] = useState<number>(7)

  const load = async () => {
    setState('loading')
    try {
      if (!(await backend.isAdmin())) return setState('forbidden')
      setStats(await backend.entryStats(kstDate(new Date(Date.now() - 29 * 86400000))))
      setState('ok')
    } catch {
      setState('error')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const since = kstDate(new Date(Date.now() - (days - 1) * 86400000))
  const shown = stats.filter((s) => s.day >= since)
  const total = shown.reduce((n, s) => n + s.count, 0)

  return (
    <main className="screen stats">
      <nav className="topbar">
        <button className="btn-ghost" onClick={() => ctx.go({ kind: 'home' })} aria-label="뒤로">
          <Icon id="back" />
        </button>
        <span className="topbar-title">📊 유입 통계</span>
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
      {state === 'ok' && (
        <>
          <div className="stats-range" role="tablist">
            {RANGES.map((r) => (
              <button key={r.days} role="tab" aria-selected={days === r.days} className={`chip ${days === r.days ? 'is-on' : ''}`} onClick={() => setDays(r.days)}>
                {r.text}
              </button>
            ))}
          </div>
          <p className="stats-total">
            들어온 횟수 <b>{total}</b>
          </p>
          <p className="panel-tip">탭을 열 때 한 번씩 세요. 링크에 ?from=insta 처럼 꼬리표를 붙이면 경로가 정확해져요.</p>
          {total === 0 ? (
            <p className="muted center">아직 기록이 없어요</p>
          ) : (
            <>
              <Bars title="어디서 왔나" rows={sumBy(shown, 'source')} total={total} />
              <Bars title="어떤 앱에서 열었나" rows={sumBy(shown, 'app')} total={total} />
              <Bars title="처음 본 화면" rows={sumBy(shown, 'landing')} total={total} />
              {days > 1 && <Bars title="날짜별" rows={sumBy(shown, 'day').sort((a, b) => b.key.localeCompare(a.key))} total={total} raw />}
            </>
          )}
        </>
      )}
    </main>
  )
}

function Bars({ title, rows, total, raw }: { title: string; rows: { key: string; count: number }[]; total: number; raw?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <section className="stats-block">
      <h2 className="panel-label">{title}</h2>
      <ul className="stats-bars">
        {rows.map((r) => (
          <li key={r.key}>
            <span className="stats-name">{raw ? r.key.slice(5).replace('-', '/') : label(r.key)}</span>
            <span className="stats-bar">
              <span style={{ width: `${(r.count / max) * 100}%` }} />
            </span>
            <span className="stats-num">
              {r.count}
              <span className="muted"> {Math.round((r.count / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
