import { type AvatarLook, normalizeLook } from '../art/avatar'

/** 이 브라우저에만 남는 것들: 손님 닉네임·미니미, 아이템을 놓고 온 방, 채팅 읽은 시각, 내보내진 방 */
const KEY = 'bangdeuri:v2'

interface Saved {
  guest: { nickname: string; look: AvatarLook } | null
  dropped: string[]
  seen: Record<string, string>
  kicked: Record<string, number>
}

const empty = (): Saved => ({ guest: null, dropped: [], seen: {}, kicked: {} })

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...empty(), ...(JSON.parse(raw) as Partial<Saved>) }
  } catch {
    // 시크릿 창 등에서 저장소를 못 쓰면 빈 상태로 간다
  }
  return empty()
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // 저장 실패해도 이번 화면에서는 계속 쓸 수 있다
  }
}

/** 내보내진 방에 다시 못 들어오는 시간 */
export const KICK_MS = 10 * 60 * 1000

export const store = {
  guest() {
    const g = load().guest
    return g ? { nickname: g.nickname, look: normalizeLook(g.look) } : null
  },
  setGuest(nickname: string, look: AvatarLook) {
    const s = load()
    s.guest = { nickname, look }
    save(s)
  },
  hasDropped(roomId: string) {
    return load().dropped.includes(roomId)
  },
  markDropped(roomId: string) {
    const s = load()
    if (!s.dropped.includes(roomId)) s.dropped.push(roomId)
    save(s)
  },
  /** 방 주인이 마지막으로 채팅을 본 시각 */
  seenAt(roomId: string) {
    return load().seen[roomId] ?? null
  },
  markSeen(roomId: string, iso = new Date().toISOString()) {
    const s = load()
    s.seen[roomId] = iso
    save(s)
  },
  kickedUntil(roomId: string, now = Date.now()) {
    const until = load().kicked[roomId] ?? 0
    return until > now ? until : 0
  },
  markKicked(roomId: string, now = Date.now()) {
    const s = load()
    s.kicked[roomId] = now + KICK_MS
    save(s)
  },
}

/** 같은 탭에서 새로고침할 때마다 방문자 수가 오르지 않게 */
export function firstVisitThisSession(roomId: string) {
  try {
    const k = `bangdeuri:visited:${roomId}`
    if (sessionStorage.getItem(k)) return false
    sessionStorage.setItem(k, '1')
  } catch {
    // sessionStorage를 못 쓰면 그냥 센다
  }
  return true
}

const ADJ = ['수상한', '지나가던', '배고픈', '졸린', '몰래 온', '복면 쓴', '정체불명', '부끄러운', '심심한', '빙글빙글']
const NOUN = ['고구마', '너구리', '감자', '펭귄', '두더지', '호떡', '오리', '단무지', '다람쥐', '만두']

/** 익명으로 들어갈 때 붙는 이름 */
export function anonName(r: () => number = Math.random) {
  return `${ADJ[Math.floor(r() * ADJ.length)]} ${NOUN[Math.floor(r() * NOUN.length)]}`
}
