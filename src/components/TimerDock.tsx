import { useEffect, useReducer, useState } from 'react'
import { ring } from '../lib/chime'
import { clock, nextPomodoro, remaining, type Timer, timers } from '../lib/timers'
import { Icon } from './PixelSprite'

/** 끝난 지 이만큼 지난 타이머는 (앱을 늦게 열었을 때) 울리지 않고 치운다 */
const STALE_MS = 10 * 60 * 1000

const DONE_TEXT: Record<Timer['source'], string> = {
  desk: '집중 끝!',
  microwave: '띵! 다 데워졌어요',
  washer: '빨래 다 됐어요',
  recipe: '다 됐어요',
}

/** 화면 구석의 돌고 있는 타이머 + 끝나면 알림. 앱 어느 화면에서든 돈다 */
export function TimerDock() {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  const [done, setDone] = useState<{ title: string; body: string; stop: () => void } | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  useEffect(() => timers.subscribe(tick), [])

  useEffect(() => {
    const check = () => {
      const now = Date.now()
      for (const t of timers.list()) {
        if (t.endsAt > now) continue
        const late = now - t.endsAt > STALE_MS
        if (t.pomodoro && !late) {
          const next = nextPomodoro(t, now)
          timers.replace(next)
          const stop = ring('timer')
          setDone({
            title: t.pomodoro.phase === 'focus' ? `${t.pomodoro.round}번째 집중 끝!` : '휴식 끝!',
            body: next.pomodoro?.phase === 'break' ? '5분 쉬었다 해요' : '다시 25분 집중해 봐요',
            stop,
          })
          continue
        }
        timers.cancel(t.id)
        if (late) continue
        const stop = ring('timer')
        setDone({ title: DONE_TEXT[t.source], body: t.label, stop })
      }
      tick()
    }
    check()
    const id = window.setInterval(check, 1000)
    return () => window.clearInterval(id)
  }, [])

  const list = timers.list()
  const now = Date.now()

  return (
    <>
      {list.length > 0 && (
        <div className="timer-dock" aria-live="off">
          {list.map((t) => (
            <button key={t.id} className="timer-pill" onClick={() => setConfirm(t.id)} aria-label={`${t.label} 남은 시간 ${clock(remaining(t, now))}, 눌러서 취소`}>
              <Icon id="clock" size={12} /> {t.label} {clock(remaining(t, now))}
            </button>
          ))}
        </div>
      )}
      {confirm && (
        <div className="notice-backdrop" onClick={() => setConfirm(null)}>
          <div className="notice" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
            <p className="notice-title">타이머를 끌까요?</p>
            <div className="row">
              <button className="btn" onClick={() => setConfirm(null)}>
                계속
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  timers.cancel(confirm)
                  setConfirm(null)
                }}
              >
                끄기
              </button>
            </div>
          </div>
        </div>
      )}
      {done && (
        <div className="notice-backdrop">
          <div className="notice" role="alertdialog" aria-modal>
            <p className="notice-title">{done.title}</p>
            <p className="notice-body">{done.body}</p>
            <button
              className="btn btn-primary"
              onClick={() => {
                done.stop()
                setDone(null)
              }}
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  )
}
