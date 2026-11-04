import { useCallback, useEffect, useReducer, useState } from 'react'
import { type Alarm, ALARM_LABEL_MAX, ALARM_WEEK, daysLabel, kstClock, MAX_ALARMS } from '../../lib/alarm'
import { backend } from '../../lib/backend'
import { pushSupport, savedPrefs, setPushPrefs } from '../../lib/push'
import { clip, errorText } from '../../lib/rules'
import { alarmsChanged } from '../AlarmWatcher'

/** 알람 시계: 방 주인만 맞춘다. 손님은 지금 시각만 본다 */
export function AlarmTool({ owner, toast }: { owner: boolean; toast: (t: string) => void }) {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="tool-body alarm-tool">
      <p className="alarm-now" aria-label={`지금 ${kstClock()}`}>
        {kstClock()}
      </p>
      {owner ? <OwnerAlarms toast={toast} /> : <p className="tool-empty">방 주인만 알람을 맞출 수 있어요</p>}
    </div>
  )
}

function OwnerAlarms({ toast }: { toast: (t: string) => void }) {
  const [list, setList] = useState<Alarm[] | null>(null)
  const [time, setTime] = useState('07:30')
  const [days, setDays] = useState<number[]>([])
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [prefs, setPrefs] = useState(savedPrefs)
  const support = pushSupport()

  const load = useCallback(() => {
    backend
      .listAlarms()
      .then(setList)
      .catch(() => setList([]))
  }, [])
  useEffect(load, [load])

  const run = async (f: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await f()
      load()
      alarmsChanged()
    } catch (e) {
      toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const add = () =>
    run(async () => {
      await backend.saveAlarm({ time, days, label, enabled: true })
      setLabel('')
      toast(`${time} ${daysLabel(days)} 알람을 맞췄어요`)
    })

  const turnOnPush = async () => {
    try {
      setPrefs(await setPushPrefs({ ...prefs, alarm: true }))
    } catch (e) {
      toast(errorText(e))
    }
  }

  const warn =
    support === 'local'
      ? '테스트 모드에서는 앱이 열려 있을 때만 울려요'
      : support === 'ios-home'
        ? '앱을 닫으면 안 울려요. 아이폰은 Safari 공유 → "홈 화면에 추가"로 깐 앱에서 알림을 켜야 해요'
        : support !== 'ok'
          ? '이 브라우저는 푸시를 못 받아서, 앱을 닫으면 안 울려요'
          : !prefs.alarm
            ? '알람 푸시가 꺼져 있어서 앱을 닫으면 안 울려요'
            : null

  return (
    <>
      {warn && (
        <div className="alarm-warn" role="note">
          {warn}
          {support === 'ok' && !prefs.alarm && (
            <button className="btn btn-small" onClick={() => void turnOnPush()}>
              이 기기에서 알람 푸시 켜기
            </button>
          )}
        </div>
      )}

      {list === null ? (
        <p className="tool-empty">불러오는 중…</p>
      ) : list.length === 0 ? (
        <p className="tool-empty">맞춘 알람이 없어요</p>
      ) : (
        <ul className="alarm-list">
          {list.map((a) => (
            <li key={a.id} className={`alarm-row ${a.enabled ? '' : 'is-off'}`}>
              <span className="alarm-time">{a.time}</span>
              <span className="alarm-body">
                <b>{a.label || '알람'}</b>
                <span className="muted">{daysLabel(a.days)}</span>
              </span>
              <button
                className={`toggle alarm-toggle ${a.enabled ? 'is-on' : ''}`}
                role="switch"
                aria-checked={a.enabled}
                aria-label={`${a.time} 알람 ${a.enabled ? '끄기' : '켜기'}`}
                disabled={busy}
                onClick={() => void run(() => backend.saveAlarm({ ...a, enabled: !a.enabled }))}
              >
                <span className="toggle-knob" aria-hidden />
              </button>
              <button className="btn-ghost cal-del" aria-label={`${a.time} 알람 지우기`} disabled={busy} onClick={() => void run(() => backend.deleteAlarm(a.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {(list?.length ?? 0) < MAX_ALARMS && (
        <div className="alarm-form">
          <div className="row cal-form-row">
            <input className="input cal-time-input" type="time" value={time} required onChange={(e) => setTime(e.target.value)} aria-label="알람 시각" />
            <button className="btn btn-primary" disabled={busy || !/^\d{2}:\d{2}$/.test(time)} onClick={() => void add()}>
              맞추기
            </button>
          </div>
          <div className="chips" role="group" aria-label="반복 요일 (안 고르면 한 번만)">
            {ALARM_WEEK.map((w, i) => (
              <button
                key={w}
                className={`chip ${days.includes(i) ? 'is-on' : ''}`}
                aria-pressed={days.includes(i)}
                onClick={() => setDays(days.includes(i) ? days.filter((d) => d !== i) : [...days, i].sort())}
              >
                {w}
              </button>
            ))}
          </div>
          <input
            className="input"
            value={label}
            maxLength={ALARM_LABEL_MAX}
            placeholder="알람 이름 (예: 기상!)"
            onChange={(e) => setLabel(clip(e.target.value, ALARM_LABEL_MAX))}
            aria-label="알람 이름"
          />
          <p className="panel-tip">요일을 안 고르면 한 번만 울려요. 한국 시간 기준이에요</p>
        </div>
      )}
    </>
  )
}
