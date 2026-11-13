import { describe, expect, it } from 'vitest'
import { appFromUserAgent, detectEntry, normalizeTag, sourceFromReferrer, stripTags, sumBy } from './entry'
import { createLocalBackend } from './localBackend'

const UA = {
  kakao: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5',
  insta: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0.0.22.109',
  threads: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 340.0.0.18.111',
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
}

describe('유입 경로', () => {
  it('꼬리표는 소문자·허용 문자만, 다른 이름은 하나로', () => {
    expect(normalizeTag('Instagram')).toBe('insta')
    expect(normalizeTag(' threads ')).toBe('threads')
    expect(normalizeTag('<script>')).toBe('script')
    expect(normalizeTag('한글')).toBeNull()
    expect(normalizeTag('')).toBeNull()
    expect(normalizeTag('a'.repeat(40))).toBe('a'.repeat(20))
  })

  it('앱 안 브라우저 이름표로 연 앱을 안다', () => {
    expect(appFromUserAgent(UA.kakao, false)).toBe('kakao')
    expect(appFromUserAgent(UA.insta, false)).toBe('insta')
    expect(appFromUserAgent(UA.threads, false)).toBe('threads')
    expect(appFromUserAgent(UA.safari, false)).toBe('browser')
    expect(appFromUserAgent(UA.safari, true)).toBe('pwa')
  })

  it('앞 사이트 주소로 짐작하고, 내 사이트는 무시', () => {
    expect(sourceFromReferrer('https://l.instagram.com/?u=x', 'bangdeuri.com')).toBe('insta')
    expect(sourceFromReferrer('https://www.threads.net/@a', 'bangdeuri.com')).toBe('threads')
    expect(sourceFromReferrer('https://www.google.co.kr/', 'bangdeuri.com')).toBe('google')
    expect(sourceFromReferrer('https://bangdeuri.com/?r=abcd', 'bangdeuri.com')).toBeNull()
    expect(sourceFromReferrer('https://blog.example.com/', 'bangdeuri.com')).toBe('web')
    expect(sourceFromReferrer('', 'bangdeuri.com')).toBeNull()
  })

  it('꼬리표 > 초대 링크 > 앞 사이트 > 연 앱 > 직접', () => {
    const base = { referrer: '', ua: UA.safari, standalone: false }
    expect(detectEntry({ ...base, href: 'https://bangdeuri.com/?from=insta', landing: 'home' }).source).toBe('insta')
    expect(detectEntry({ ...base, href: 'https://bangdeuri.com/?r=abcd&from=threads', landing: 'room' }).source).toBe('threads')
    expect(detectEntry({ ...base, href: 'https://bangdeuri.com/?r=abcd', landing: 'room' }).source).toBe('invite')
    expect(detectEntry({ ...base, href: 'https://bangdeuri.com/?utm_source=Instagram', landing: 'home' }).source).toBe('insta')
    expect(detectEntry({ ...base, referrer: 'https://www.google.com/', href: 'https://bangdeuri.com/', landing: 'home' }).source).toBe('google')
    expect(detectEntry({ ...base, ua: UA.kakao, href: 'https://bangdeuri.com/', landing: 'home' })).toEqual({ source: 'kakao', app: 'kakao', landing: 'home' })
    expect(detectEntry({ ...base, standalone: true, href: 'https://bangdeuri.com/', landing: 'home' }).source).toBe('pwa')
    expect(detectEntry({ ...base, href: 'https://bangdeuri.com/', landing: 'home' }).source).toBe('direct')
  })

  it('세고 나면 꼬리표만 주소에서 지운다', () => {
    expect(stripTags('https://bangdeuri.com/?r=abcd&from=insta')).toBe('https://bangdeuri.com/?r=abcd')
    expect(stripTags('https://bangdeuri.com/?from=insta&fbclid=xx')).toBe('https://bangdeuri.com/')
    expect(stripTags('https://bangdeuri.com/?inbox&from=kakao')).toBe('https://bangdeuri.com/?inbox')
    expect(stripTags('https://bangdeuri.com/?r=abcd')).toBeNull()
  })

  it('숫자는 키별로 묶어 큰 순으로', () => {
    const rows = [
      { day: '2026-11-13', source: 'insta', app: 'insta', landing: 'home' as const, count: 3 },
      { day: '2026-11-13', source: 'invite', app: 'kakao', landing: 'room' as const, count: 5 },
      { day: '2026-11-12', source: 'insta', app: 'browser', landing: 'home' as const, count: 4 },
    ]
    expect(sumBy(rows, 'source')).toEqual([
      { key: 'insta', count: 7 },
      { key: 'invite', count: 5 },
    ])
    expect(sumBy(rows, 'landing')[0]).toEqual({ key: 'home', count: 7 })
  })
})

describe('유입 숫자 저장 (로컬 백엔드)', () => {
  const memory = () => {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
      key: () => null,
      length: 0,
    } as Storage
  }

  it('같은 경로는 숫자만 오르고, 개발자만 본다', async () => {
    const storage = memory()
    const b = createLocalBackend(storage, memory())
    await b.logEntry({ source: 'insta', app: 'insta', landing: 'home' })
    await b.logEntry({ source: 'insta', app: 'insta', landing: 'home' })
    await b.logEntry({ source: 'invite', app: 'kakao', landing: 'room' })
    await expect(b.logEntry({ source: 'BAD TAG', app: 'x', landing: 'home' })).rejects.toThrow('bad_request')

    await expect(b.entryStats('2000-01-01')).rejects.toThrow('forbidden')
    await b.signUpEmail('dev@example.com', 'pw123456')
    const db = JSON.parse(storage.getItem('bangdeuri:localdb:v2')!)
    storage.setItem('bangdeuri:localdb:v2', JSON.stringify({ ...db, admins: ['dev@example.com'] }))
    const stats = await b.entryStats('2000-01-01')
    expect(sumBy(stats, 'source')).toEqual([
      { key: 'insta', count: 2 },
      { key: 'invite', count: 1 },
    ])
    // 누가 왔는지는 남지 않는다
    expect(Object.keys(stats[0]).sort()).toEqual(['app', 'count', 'day', 'landing', 'source'])
  })
})
