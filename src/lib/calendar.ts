/** 달력 날짜 계산 (날짜는 'YYYY-MM-DD', 달은 'YYYY-MM' 문자열. 시간대 영향을 안 받게 UTC로만 계산한다) */
import { kstDate } from './rules'

/** 일정 내용 최대 글자 수 */
export const EVENT_TITLE_MAX = 40
/** 방마다 앞으로 있을 일정 최대 수 */
export const MAX_EVENTS = 200
/** 같은 작성자가 1분에 쓸 수 있는 일정 수 */
export const EVENTS_PER_MINUTE = 5

const iso = (d: Date) => d.toISOString().slice(0, 10)
const parseMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return { y, m }
}

export function addMonths(month: string, n: number): string {
  const { y, m } = parseMonth(month)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return iso(d).slice(0, 7)
}

/** 일요일부터 6주 = 42칸 */
export function monthGrid(month: string): { date: string; inMonth: boolean }[] {
  const { y, m } = parseMonth(month)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const start = Date.UTC(y, m - 1, 1 - first.getUTCDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start + i * 86_400_000)
    return { date: iso(d), inMonth: d.getUTCMonth() === m - 1 }
  })
}

/** 그 달 격자에 보이는 날짜 범위 (불러올 일정) */
export function monthRange(month: string) {
  const g = monthGrid(month)
  return { from: g[0].date, to: g[g.length - 1].date }
}

export const kstToday = (now = Date.now()) => kstDate(new Date(now))
export const kstMonth = (now = Date.now()) => kstToday(now).slice(0, 7)

const WEEK = ['일', '월', '화', '수', '목', '금', '토']
/** 11월 20일 (금) */
export function dayLabel(date: string) {
  const d = new Date(`${date}T00:00:00Z`)
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEK[d.getUTCDay()]})`
}
export { WEEK }
