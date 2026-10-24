/** 이 브라우저에만 남는 정보: 내가 만든 방의 비밀 키, 아이템을 놓고 온 방 */
const KEY = 'bangmunrok:v1'

interface Saved {
  mine: { id: string; secret: string }[]
  dropped: string[]
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Partial<Saved>
      return { mine: s.mine ?? [], dropped: s.dropped ?? [] }
    }
  } catch {
    // 시크릿 창 등에서 저장소를 못 쓰면 빈 상태로 간다
  }
  return { mine: [], dropped: [] }
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // 저장 실패해도 이번 화면에서는 계속 쓸 수 있다
  }
}

export const store = {
  secretFor(roomId: string) {
    return load().mine.find((m) => m.id === roomId)?.secret ?? null
  },
  myRooms() {
    return load().mine.map((m) => m.id)
  },
  addMine(id: string, secret: string) {
    const s = load()
    s.mine = [{ id, secret }, ...s.mine.filter((m) => m.id !== id)]
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
}

/** 같은 탭에서 새로고침할 때마다 방문자 수가 오르지 않게 */
export function firstVisitThisSession(roomId: string) {
  try {
    const k = `bangmunrok:visited:${roomId}`
    if (sessionStorage.getItem(k)) return false
    sessionStorage.setItem(k, '1')
  } catch {
    // sessionStorage를 못 쓰면 그냥 센다
  }
  return true
}
