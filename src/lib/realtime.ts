import type { AvatarLook } from '../art/avatar'
import type { Decor } from '../art/decor'
import type { AreaId, Vec2 } from './town'
import type { NowPlaying } from './turntable'
import type { ChatMessage, Drop } from './types'

/** 방에 같이 있는 사람 한 명 (탭 하나 = 한 명) */
export interface Peer {
  /** 탭마다 새로 만드는 번호 */
  cid: string
  name: string
  look: AvatarLook
  /** 방 주인 */
  owner: boolean
  /** 이 사람의 집 방 번호들 (동네에 그 집이 있으면 주인이 와 있는 것) */
  homes?: string[]
}

/** 동네 상태: 켜 둔 스탠드, TV마다 채널 (key = 가구·아이템 key) */
export interface SharedRoomState {
  lights: string[]
  tv: Record<string, number>
}

export type RoomEvent =
  /** 걸어가기 (받는 쪽이 길을 직접 찾는다). area = 골목 또는 어느 집 안 */
  | { t: 'move'; cid: string; area: AreaId; from: Vec2; to: Vec2 }
  /** 가구·아이템 쓰기 (key = 가구 key 또는 아이템 id) */
  | { t: 'act'; cid: string; area: AreaId; key: string; from: Vec2 }
  /** 문을 지나 다른 곳으로 (골목 ↔ 집 안) */
  | { t: 'area'; cid: string; area: AreaId; at: Vec2 }
  /** 새로 들어온 사람에게 지금 내 자리와 동네 상태를 알려 준다 */
  | {
      t: 'hello'
      cid: string
      area: AreaId
      at: Vec2
      act: string | null
      outfit: number
      room: SharedRoomState
      song?: NowPlaying | null
    }
  | { t: 'chat'; cid: string; msg: ChatMessage }
  | { t: 'chat-del'; id: string }
  | { t: 'drop'; cid: string; drop: Drop }
  | { t: 'drop-del'; id: string }
  /** 방 주인이 한마디·꾸미기를 바꿨다 */
  | { t: 'room'; motto: string; decor: Decor }
  /** 턴테이블: 누가 곡을 틀었다 / 껐다 */
  | ({ t: 'song'; cid: string } & NowPlaying)
  | { t: 'song-stop'; cid: string }
  /** 달력 일정이 바뀌었다 (받으면 다시 불러온다) */
  | { t: 'cal'; cid: string }
  /** 방 주인이 내보냈다 */
  | { t: 'kick'; cid: string }

export interface RoomChannel {
  send(e: RoomEvent): void
  /** 같은 방 사람들이 바뀔 때마다 전체 명단 (나 포함) */
  onPeers(cb: (peers: Peer[]) => void): void
  onEvent(cb: (e: RoomEvent) => void): void
  leave(): void
}

export const newCid = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join('')

/** 한 방에 같이 있을 수 있는 사람 수 (방 주인 빼고) */
export const MAX_GUESTS = 20

// ─── 로컬 모드: 같은 브라우저의 다른 탭끼리 BroadcastChannel로 ───

const HEARTBEAT_MS = 2500
const EXPIRE_MS = 7000

type Wire = { k: 'ev'; e: RoomEvent } | { k: 'here'; peer: Peer; reply?: boolean } | { k: 'bye'; cid: string }

export function createLocalChannel(roomId: string, me: Peer): RoomChannel {
  const bc = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`bangdeuri:town:${roomId}`)
  const peers = new Map<string, { peer: Peer; seen: number }>([[me.cid, { peer: me, seen: Infinity }]])
  let peersCb: (p: Peer[]) => void = () => {}
  let eventCb: (e: RoomEvent) => void = () => {}
  const emitPeers = () => peersCb([...peers.values()].map((p) => p.peer))
  const post = (w: Wire) => bc?.postMessage(w)

  if (bc) {
    bc.onmessage = (m: MessageEvent<Wire>) => {
      const w = m.data
      if (w.k === 'ev') eventCb(w.e)
      else if (w.k === 'here') {
        const isNew = !peers.has(w.peer.cid)
        peers.set(w.peer.cid, { peer: w.peer, seen: Date.now() })
        if (isNew) {
          emitPeers()
          // 처음 본 사람에게는 나도 여기 있다고 바로 알려 준다
          if (!w.reply) post({ k: 'here', peer: me, reply: true })
        }
      } else if (w.k === 'bye') {
        if (peers.delete(w.cid)) emitPeers()
      }
    }
  }

  const beat = window.setInterval(() => {
    post({ k: 'here', peer: me })
    const now = Date.now()
    let changed = false
    for (const [cid, p] of peers) {
      if (now - p.seen > EXPIRE_MS) {
        peers.delete(cid)
        changed = true
      }
    }
    if (changed) emitPeers()
  }, HEARTBEAT_MS)

  let left = false
  const onUnload = () => post({ k: 'bye', cid: me.cid })
  window.addEventListener('pagehide', onUnload)

  queueMicrotask(() => {
    emitPeers()
    post({ k: 'here', peer: me })
  })

  return {
    send: (e) => post({ k: 'ev', e }),
    onPeers: (cb) => {
      peersCb = cb
    },
    onEvent: (cb) => {
      eventCb = cb
    },
    leave() {
      if (left) return
      left = true
      window.clearInterval(beat)
      window.removeEventListener('pagehide', onUnload)
      post({ k: 'bye', cid: me.cid })
      bc?.close()
    },
  }
}
