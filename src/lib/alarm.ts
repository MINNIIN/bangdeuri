/**
 * 시계 알람: 방 주인 계정에 딸린다. 시각은 한국 시간(KST) 기준.
 * 서버(supabase/schema.sql alarm_next)와 같은 규칙으로 다음 울릴 시각을 계산한다.
 */
export interface Alarm {
  id: string
  /** HH:MM (한국 시간) */
  time: string
  /** 울리는 요일 0=일…6=토. 비면 한 번만 */
  days: number[]
  label: string
  enabled: boolean
  /** 다음에 울릴 시각 (ISO). 꺼져 있으면 null */
  nextAt: string | null
}

export const MAX_ALARMS = 10
export const ALARM_LABEL_MAX = 20
/** 이만큼 지난 알람은 (앱을 늦게 열었을 때) 울리지 않는다 */
export const ALARM_GRACE_MS = 60_000
export const SNOOZE_MIN = 5

const KST = 9 * 60 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

/** after(epoch ms)보다 뒤인 가장 빠른 알람 시각 */
export function nextAlarmAt(a: Pick<Alarm, 'time' | 'days'>, after: number): number {
  const [h, m] = a.time.split(':').map(Number)
  // 한국 날짜의 0시 (epoch ms)
  const kstMidnight = Math.floor((after + KST) / DAY) * DAY - KST
  for (let i = 0; i <= 8; i++) {
    const at = kstMidnight + i * DAY + (h * 60 + m) * 60_000
    if (at <= after) continue
    const weekday = new Date(at + KST).getUTCDay()
    if (a.days.length === 0 || a.days.includes(weekday)) return at
  }
  // 요일이 이상하면 (0~6 밖) 하루 뒤로
  return kstMidnight + DAY + (h * 60 + m) * 60_000
}

export function dueAlarms(list: Alarm[], now: number, graceMs = ALARM_GRACE_MS): Alarm[] {
  return list.filter((a) => {
    if (!a.enabled || !a.nextAt) return false
    const at = new Date(a.nextAt).getTime()
    return at <= now && now - at <= graceMs
  })
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토']
/** 평일 / 주말 / 매일 / 월·수·금 / 한 번 */
export function daysLabel(days: number[]) {
  const set = [...new Set(days)].sort()
  if (set.length === 0) return '한 번'
  if (set.length === 7) return '매일'
  if (set.join() === '1,2,3,4,5') return '평일'
  if (set.join() === '0,6') return '주말'
  return set.map((d) => WEEK[d]).join('·')
}
export { WEEK as ALARM_WEEK }

/** 지금 한국 시각 HH:MM */
export function kstClock(now = Date.now()) {
  const d = new Date(now + KST)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
