import { useEffect, useMemo, useState } from 'react'
import { backend } from '../../lib/backend'
import { addMonths, dayLabel, EVENT_TITLE_MAX, kstMonth, kstToday, monthGrid, WEEK } from '../../lib/calendar'
import { clip, errorText, openPicker } from '../../lib/rules'
import { store } from '../../lib/storage'
import type { CalEvent } from '../../lib/types'

/**
 * 달력: 방 주인 일정과 친구가 적은 약속을 같이 본다.
 * 누구나 쓰고(익명 손님도), 주인은 '나만 보기' 일정도 쓴다. 지우기는 주인과 쓴 사람만.
 */
export function CalendarTool({
  roomId,
  owner,
  name,
  anon,
  version,
  onChanged,
  onGuestWrote,
  toast,
}: {
  roomId: string
  owner: boolean
  /** 쓰는 사람 이름 (방에 들어온 이름) */
  name: string
  anon: boolean
  /** 다른 사람이 일정을 바꾸면 올라간다 (다시 불러오기) */
  version: number
  onChanged: () => void
  onGuestWrote: () => void
  toast: (t: string) => void
}) {
  const today = kstToday()
  const [month, setMonth] = useState(kstMonth)
  const [events, setEvents] = useState<CalEvent[] | null>(null)
  const [day, setDay] = useState<string>(today)
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [secret, setSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const key = useMemo(() => store.deviceKey(), [])

  useEffect(() => {
    // 달을 빨리 넘기면 늦게 온 앞 달 응답이 덮어쓰지 않게
    let current = true
    backend
      .listEvents(roomId, month, key)
      .then((list) => current && setEvents(list))
      .catch(() => current && setEvents([]))
    return () => {
      current = false
    }
  }, [roomId, month, key, version])

  /** 달을 넘기면 그 달 1일(이번 달이면 오늘)을 고른다 */
  const goMonth = (next: string) => {
    setMonth(next)
    setDay(next === today.slice(0, 7) ? today : `${next}-01`)
  }

  const grid = monthGrid(month)
  const byDay = new Map<string, CalEvent[]>()
  for (const e of events ?? []) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  const dayEvents = byDay.get(day) ?? []
  const [y, m] = month.split('-').map(Number)

  const add = async () => {
    const t = title.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      const e = await backend.addEvent(roomId, { date: day, time: time || null, title: t, name, anon, private: owner && secret }, key)
      setEvents((list) => [...(list ?? []), e])
      setTitle('')
      setTime('')
      onChanged()
      if (!owner) onGuestWrote()
    } catch (err) {
      toast(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (e: CalEvent) => {
    try {
      await backend.deleteEvent(roomId, e.id, key)
      setEvents((list) => (list ?? []).filter((x) => x.id !== e.id))
      onChanged()
    } catch (err) {
      toast((err as Error).message === 'forbidden' ? '방 주인이나 쓴 사람만 지울 수 있어요' : errorText(err))
    }
  }

  return (
    <div className="tool-body calendar-tool">
      <div className="cal-head">
        <button className="btn btn-small" onClick={() => goMonth(addMonths(month, -1))} aria-label="지난달">
          ‹
        </button>
        <b>
          {y}년 {m}월
        </b>
        <button className="btn btn-small" onClick={() => goMonth(addMonths(month, 1))} aria-label="다음달">
          ›
        </button>
      </div>

      <div className="cal-grid" role="grid" aria-label={`${y}년 ${m}월`}>
        {WEEK.map((w, i) => (
          <span key={w} className={`cal-week ${i === 0 ? 'is-sun' : i === 6 ? 'is-sat' : ''}`} role="columnheader">
            {w}
          </span>
        ))}
        {grid.map((c) => {
          const list = byDay.get(c.date) ?? []
          return (
            <button
              key={c.date}
              role="gridcell"
              className={`cal-day ${c.inMonth ? '' : 'is-out'} ${c.date === today ? 'is-today' : ''} ${c.date === day ? 'is-on' : ''}`}
              onClick={() => {
                setDay(c.date)
                if (!c.inMonth) setMonth(c.date.slice(0, 7))
              }}
              aria-label={`${dayLabel(c.date)}${list.length ? `, 일정 ${list.length}개` : ''}`}
              aria-selected={c.date === day}
            >
              <span>{Number(c.date.slice(8))}</span>
              {list.length > 0 && (
                <span className="cal-dots" aria-hidden>
                  {list.slice(0, 3).map((e) => (
                    <i key={e.id} className={e.byOwner ? 'is-owner' : 'is-friend'} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <section className="cal-day-panel">
        <p className="cal-day-title">{dayLabel(day)}</p>
        {events === null ? (
          <p className="tool-empty">불러오는 중…</p>
        ) : dayEvents.length === 0 ? (
          <p className="tool-empty">아직 일정이 없어요</p>
        ) : (
          <ul className="cal-list">
            {dayEvents.map((e) => (
              <li key={e.id} className={e.byOwner ? 'is-owner' : 'is-friend'}>
                <span className="cal-time">{e.time ?? '하루'}</span>
                <span className="cal-body">
                  <b>{e.title}</b>
                  <span className="muted">
                    {e.byOwner ? '방 주인' : e.name}
                    {e.private ? ' · 나만 보기' : ''}
                  </span>
                </span>
                {e.mine && (
                  <button className="btn-ghost cal-del" onClick={() => void remove(e)} aria-label={`${e.title} 지우기`}>
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="cal-form">
          <input
            className="input"
            value={title}
            maxLength={EVENT_TITLE_MAX}
            placeholder={owner ? '일정 적기' : '약속 적기 (예: 이날 치킨 먹자)'}
            onChange={(e) => setTitle(clip(e.target.value, EVENT_TITLE_MAX))}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            aria-label="일정 내용"
          />
          <div className="row cal-form-row">
            <input className="input cal-time-input" type="time" value={time} onClick={openPicker} onChange={(e) => setTime(e.target.value)} aria-label="시각 (선택)" />
            {owner && (
              <label className="cal-secret">
                <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} /> 나만 보기
              </label>
            )}
            <button className="btn btn-primary" disabled={!title.trim() || busy} onClick={() => void add()}>
              적기
            </button>
          </div>
          {!owner && <p className="panel-tip">{name} 이름으로 적혀요. 방 주인과 이 기기에서만 지울 수 있어요</p>}
        </div>
      </section>
    </div>
  )
}
