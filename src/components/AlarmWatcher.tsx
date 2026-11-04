import { useEffect, useRef, useState } from 'react'
import { type Alarm, dueAlarms, SNOOZE_MIN } from '../lib/alarm'
import { backend } from '../lib/backend'
import { ring } from '../lib/chime'

const CHANGED = 'bangdeuri:alarms'
/** 알람을 고친 뒤 부르면 지켜보는 쪽이 다시 불러온다 */
export const alarmsChanged = () => window.dispatchEvent(new Event(CHANGED))

/**
 * 로그인한 내 알람을 지켜보다가 시각이 되면 울린다 (앱 어느 화면에서든).
 * 앱이 닫혀 있을 때는 서버 예약 작업이 푸시를 보낸다.
 */
export function AlarmWatcher() {
  const list = useRef<Alarm[]>([])
  /** 같은 알람·같은 시각은 한 번만 */
  const rung = useRef(new Set<string>())
  const [ringing, setRinging] = useState<{ alarm: Alarm; stop: () => void } | null>(null)

  useEffect(() => {
    let alive = true
    const load = () =>
      backend
        .listAlarms()
        .then((l) => {
          if (alive) list.current = l
        })
        .catch(() => undefined)
    void load()
    const onVis = () => !document.hidden && void load()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener(CHANGED, load)
    const poll = window.setInterval(load, 30_000)
    const tick = window.setInterval(() => {
      for (const a of dueAlarms(list.current, Date.now())) {
        const k = `${a.id}:${a.nextAt}`
        if (rung.current.has(k)) continue
        rung.current.add(k)
        const stop = ring('alarm')
        setRinging((cur) => {
          cur?.stop()
          return { alarm: a, stop }
        })
      }
    }, 1000)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener(CHANGED, load)
      window.clearInterval(poll)
      window.clearInterval(tick)
    }
  }, [])

  // 알림 창을 닫지 않고 화면을 떠나도 소리는 멈춘다
  useEffect(() => () => ringing?.stop(), [ringing])

  if (!ringing) return null
  const { alarm, stop } = ringing
  const done = async (snooze: boolean) => {
    stop()
    setRinging(null)
    // 서버가 이미 다음 시각으로 넘겼을 수도 있어서 실패해도 창은 닫는다
    await (snooze ? backend.snoozeAlarm(alarm.id, SNOOZE_MIN) : backend.ackAlarm(alarm.id)).catch(() => undefined)
    alarmsChanged()
  }

  return (
    <div className="notice-backdrop">
      <div className="notice alarm-ring" role="alertdialog" aria-modal aria-label="알람">
        <p className="notice-title">{alarm.time}</p>
        <p className="notice-body">{alarm.label || '알람이에요!'}</p>
        <div className="row">
          <button className="btn" onClick={() => void done(true)}>
            {SNOOZE_MIN}분 뒤 다시
          </button>
          <button className="btn btn-primary" onClick={() => void done(false)}>
            끄기
          </button>
        </div>
      </div>
    </div>
  )
}
