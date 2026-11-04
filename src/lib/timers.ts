/**
 * 가구 타이머 (책상 뽀모도로·전자레인지·세탁기·레시피). 이 기기에서만 돌고, 새로고침해도 남는다.
 * 앱이 열려 있을 때만 울린다 (TimerDock이 1초마다 확인).
 */
export interface Timer {
  id: string
  label: string
  source: 'desk' | 'microwave' | 'washer' | 'recipe'
  /** 끝나는 시각 (epoch ms) */
  endsAt: number
  /** 처음 맞춘 길이 (초) */
  total: number
  pomodoro?: { phase: 'focus' | 'break'; round: number }
}

export const POMODORO = { focus: 25 * 60, break: 5 * 60 }
export const MICROWAVE_PRESETS = [60, 120, 180]
export const WASHER_DEFAULT = 40 * 60

export const remaining = (t: Timer, now: number) => Math.max(0, Math.ceil((t.endsAt - now) / 1000))

export function nextPomodoro(t: Timer, now: number): Timer {
  const p = t.pomodoro ?? { phase: 'focus', round: 1 }
  const next = p.phase === 'focus' ? { phase: 'break' as const, round: p.round } : { phase: 'focus' as const, round: p.round + 1 }
  const total = POMODORO[next.phase]
  return { ...t, pomodoro: next, total, endsAt: now + total * 1000, label: next.phase === 'focus' ? '집중' : '휴식' }
}

/** mm:ss (한 시간 넘으면 h:mm:ss) */
export function clock(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const KEY = 'bangdeuri:timers'
const listeners = new Set<() => void>()

function load(): Timer[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as Timer[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function save(list: Timer[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // 저장 못 해도 이번 화면에서는 돈다
  }
  for (const l of listeners) l()
}

const newId = () => Math.random().toString(36).slice(2, 10)

export const timers = {
  list: load,
  start(t: Omit<Timer, 'id'>): Timer {
    const timer = { ...t, id: newId() }
    // 같은 가구 타이머는 하나만
    save([...load().filter((x) => x.source !== t.source || t.source === 'recipe'), timer])
    return timer
  },
  replace(t: Timer) {
    save(load().map((x) => (x.id === t.id ? t : x)))
  },
  cancel(id: string) {
    save(load().filter((x) => x.id !== id))
  },
  subscribe(cb: () => void) {
    listeners.add(cb)
    const onStorage = (e: StorageEvent) => e.key === KEY && cb()
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(cb)
      window.removeEventListener('storage', onStorage)
    }
  },
}
