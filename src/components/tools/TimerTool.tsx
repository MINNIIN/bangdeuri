import { useEffect, useReducer, useState } from 'react'
import { clock, MICROWAVE_PRESETS, POMODORO, remaining, type Timer, timers, WASHER_DEFAULT } from '../../lib/timers'

type Source = 'desk' | 'microwave' | 'washer'

/** 책상: 뽀모도로, 전자레인지: 1·2·3분, 세탁기: 40분 (조절 가능) */
export function TimerTool({ source }: { source: Source }) {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  const [washer, setWasher] = useState(WASHER_DEFAULT)

  useEffect(() => {
    const off = timers.subscribe(tick)
    const id = window.setInterval(tick, 1000)
    return () => {
      off()
      window.clearInterval(id)
    }
  }, [])

  const running = timers.list().find((t) => t.source === source)
  const start = (label: string, sec: number, extra: Partial<Timer> = {}) =>
    timers.start({ label, source, endsAt: Date.now() + sec * 1000, total: sec, ...extra })

  if (running) {
    const left = remaining(running, Date.now())
    const p = running.pomodoro
    return (
      <div className="tool-body timer-tool">
        <p className="timer-big">{clock(left)}</p>
        <p className="timer-sub">
          {p ? `${p.round}번째 ${p.phase === 'focus' ? '집중' : '휴식'}` : running.label}
        </p>
        <div className="timer-bar" aria-hidden>
          <span style={{ width: `${100 - (left / running.total) * 100}%` }} />
        </div>
        <button className="btn" onClick={() => timers.cancel(running.id)}>
          {p ? '그만하기' : '취소'}
        </button>
      </div>
    )
  }

  return (
    <div className="tool-body timer-tool">
      {source === 'desk' && (
        <>
          <p className="panel-tip">
            {POMODORO.focus / 60}분 집중하고 {POMODORO.break / 60}분 쉬기를 반복해요. 앱이 열려 있을 때 알려 줘요
          </p>
          <button className="btn btn-primary" onClick={() => start('집중', POMODORO.focus, { pomodoro: { phase: 'focus', round: 1 } })}>
            집중 시작
          </button>
        </>
      )}
      {source === 'microwave' && (
        <>
          <p className="panel-tip">컵라면은 3분!</p>
          <div className="row">
            {MICROWAVE_PRESETS.map((s) => (
              <button key={s} className="btn" onClick={() => start(`전자레인지 ${s / 60}분`, s)}>
                {s / 60}분
              </button>
            ))}
          </div>
        </>
      )}
      {source === 'washer' && (
        <>
          <div className="row timer-adjust">
            <button className="btn btn-small" onClick={() => setWasher(Math.max(5 * 60, washer - 5 * 60))} aria-label="5분 줄이기">
              −5분
            </button>
            <p className="timer-big">{washer / 60}분</p>
            <button className="btn btn-small" onClick={() => setWasher(Math.min(180 * 60, washer + 5 * 60))} aria-label="5분 늘리기">
              +5분
            </button>
          </div>
          <button className="btn btn-primary" onClick={() => start('빨래', washer)}>
            세탁 시작
          </button>
        </>
      )}
    </div>
  )
}
