/**
 * 유입 경로 세기: 어디서(꼬리표·초대 링크·이전 사이트), 어떤 앱 안에서 열었는지만 센다.
 * IP·계정·기기 키는 보내지 않고, 서버에는 "날짜 × 경로 × 앱 × 첫 화면" 별 숫자만 쌓인다.
 */

export type Landing = 'home' | 'room'

export interface Entry {
  /** insta, threads, kakao, invite, direct, google … */
  source: string
  /** 링크를 연 곳: kakao, insta, threads, facebook, naver, line, x, pwa, browser */
  app: string
  landing: Landing
}

export interface EntryStat extends Entry {
  /** 한국 날짜 YYYY-MM-DD */
  day: string
  count: number
}

/** 링크 꼬리표로 받는 이름 (?from=insta, ?utm_source=insta) */
export const TAG_PARAMS = ['from', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid', 'igshid'] as const

const SAFE = /^[a-z0-9_-]{1,20}$/

/** 꼬리표 정리: 소문자, 허용 문자만, 자주 쓰는 다른 이름은 하나로 */
export function normalizeTag(raw: string | null | undefined): string | null {
  if (!raw) return null
  const t = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20)
  if (!t) return null
  const alias: Record<string, string> = {
    instagram: 'insta',
    ig: 'insta',
    thread: 'threads',
    kakaotalk: 'kakao',
    katalk: 'kakao',
    twitter: 'x',
    youtube: 'yt',
  }
  const v = alias[t] ?? t
  return SAFE.test(v) ? v : null
}

/** 앞 사이트 주소로 짐작 (앱 안 브라우저는 대부분 비어 있다) */
export function sourceFromReferrer(referrer: string, ownHost: string): string | null {
  if (!referrer) return null
  let host: string
  try {
    host = new URL(referrer).hostname.toLowerCase()
  } catch {
    return null
  }
  if (!host || host === ownHost || host.endsWith('.' + ownHost)) return null
  const rules: [RegExp, string][] = [
    [/(^|\.)instagram\.com$/, 'insta'],
    [/(^|\.)threads\.(net|com)$/, 'threads'],
    [/(^|\.)kakao\.(com|co\.kr)$|(^|\.)daum\.net$/, 'kakao'],
    [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, 'facebook'],
    [/(^|\.)(t\.co|x\.com|twitter\.com)$/, 'x'],
    [/(^|\.)naver\.com$/, 'naver'],
    [/(^|\.)google\./, 'google'],
    [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'yt'],
  ]
  for (const [re, name] of rules) if (re.test(host)) return name
  return 'web'
}

/** 링크를 연 앱 (앱 안 브라우저는 이름표가 붙어 있다) */
export function appFromUserAgent(ua: string, standalone: boolean): string {
  if (standalone) return 'pwa'
  const rules: [RegExp, string][] = [
    [/KAKAOTALK/i, 'kakao'],
    [/Barcelona/i, 'threads'], // 스레드 앱 안 브라우저
    [/Instagram/i, 'insta'],
    [/FBAN|FBAV|FB_IAB/i, 'facebook'],
    [/NAVER\(inapp|NAVER\//i, 'naver'],
    [/\bLine\//i, 'line'],
    [/Twitter/i, 'x'],
  ]
  for (const [re, name] of rules) if (re.test(ua)) return name
  return 'browser'
}

/**
 * 이번 방문의 경로.
 * 꼬리표가 1순위, 없으면 방 링크(초대), 그다음 앞 사이트, 그다음 앱 이름, 다 없으면 직접.
 */
export function detectEntry(input: { href: string; referrer: string; ua: string; standalone: boolean; landing: Landing }): Entry {
  const url = new URL(input.href)
  const app = appFromUserAgent(input.ua, input.standalone)
  const tag = normalizeTag(url.searchParams.get('from')) ?? normalizeTag(url.searchParams.get('utm_source'))
  const source =
    tag ??
    (input.landing === 'room' ? 'invite' : null) ??
    sourceFromReferrer(input.referrer, url.hostname.toLowerCase()) ??
    (app === 'pwa' ? 'pwa' : app !== 'browser' ? app : 'direct')
  return { source, app, landing: input.landing }
}

/** 꼬리표를 주소에서 지운다 (복사해서 다시 퍼뜨려도 처음 경로로 세지 않게). 바뀐 게 없으면 null */
export function stripTags(href: string): string | null {
  const url = new URL(href)
  let changed = false
  for (const p of TAG_PARAMS) {
    if (url.searchParams.has(p)) {
      url.searchParams.delete(p)
      changed = true
    }
  }
  if (!changed) return null
  // ?inbox 처럼 값 없는 쿼리가 ?inbox= 로 바뀌지 않게
  return url.toString().replace(/=(?=&|$)/g, '')
}

/** 통계 묶기: 키별 합계를 큰 순으로 */
export function sumBy(stats: EntryStat[], key: 'source' | 'app' | 'landing' | 'day'): { key: string; count: number }[] {
  const m = new Map<string, number>()
  for (const s of stats) m.set(s[key], (m.get(s[key]) ?? 0) + s.count)
  return [...m.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}
