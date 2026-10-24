import { useEffect, useState } from 'react'
import type { AppContext } from '../App'
import { characterById } from '../art/characters'
import { ITEMS } from '../art/items'
import { themeById } from '../art/themes'
import { backend } from '../lib/backend'
import { store } from '../lib/storage'
import type { Drop, Room } from '../lib/types'
import { SpriteIcon } from './PixelSprite'
import { RoomScene } from './RoomScene'

// 첫 화면 예시 방: 친구들이 놓고 간 것처럼 몇 개 깔아 둔다
const demo = (item: string, u: number, v: number): Drop => ({
  id: `demo-${item}`,
  roomId: 'demo',
  item,
  u,
  v,
  nickname: '',
  message: '',
  createdAt: '',
})
const DEMO_DROPS = [
  demo('plant', 0.12, 0.2),
  demo('ramen', 0.72, 0.36),
  demo('teddy', 0.3, 0.72),
  demo('balloon', 0.2, 0.45),
  demo('poop', 0.82, 0.74),
  demo('coffee', 0.55, 0.82),
  demo('lamp', 0.08, 0.86),
]

const DEMO_NOTES = [
  { who: '지윤', item: 'ramen', text: '맨날 라면만 먹는 너에게' },
  { who: '태오', item: 'poop', text: '그냥 놓고 감 ㅋ' },
  { who: '하린', item: 'teddy', text: '안고 자라고 놓고 감' },
]

export function Home({ ctx }: { ctx: AppContext }) {
  const [myRooms, setMyRooms] = useState<Room[]>([])

  // 이 브라우저에서 만든 방들 (최근 것 먼저). 지워졌거나 못 불러온 방은 빼고 보여준다
  useEffect(() => {
    let alive = true
    Promise.all(store.myRooms().map((id) => backend.getRoom(id).catch(() => null))).then((rooms) => {
      if (alive) setMyRooms(rooms.filter((r): r is Room => r !== null))
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <main className="screen home">
      <header className="home-head">
        <p className="eyebrow">친구들이 채워주는 미니룸</p>
        <h1 className="logo">방문록</h1>
        <p className="lead">
          빈 방 링크를 스토리에 올리면
          <br />
          친구들이 아이템을 하나씩 놓고 가요
        </p>
      </header>

      <section className="window">
        <div className="window-bar">
          <span>내친구의 미니룸</span>
          <span className="counter">TODAY 12 | TOTAL 128</span>
        </div>
        <RoomScene theme="pink" character="bob" drops={DEMO_DROPS} className="room" />
        <ul className="demo-notes">
          {DEMO_NOTES.map((n) => (
            <li key={n.who}>
              <b>{n.who}</b>
              <span className="muted">{ITEMS.find((i) => i.id === n.item)?.name}</span>
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {myRooms.length > 0 && (
        <section className="my-rooms">
          <h2>
            내 방 <span className="muted">{myRooms.length}</span>
          </h2>
          <ul>
            {myRooms.map((r) => (
              <li key={r.id}>
                <button className="my-room" onClick={() => ctx.go({ kind: 'room', id: r.id })}>
                  <SpriteIcon sprite={characterById(r.character).sprite} size={40} />
                  <span className="my-room-body">
                    <b>{r.name}의 미니룸</b>
                    <span className="muted">
                      {themeById(r.theme).name} · TOTAL {r.totalVisits}
                    </span>
                  </span>
                  <span className="my-room-go" aria-hidden>
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="actions">
        <button
          className={`btn ${myRooms.length ? '' : 'btn-primary'}`}
          onClick={() => ctx.go({ kind: 'create' })}
        >
          {myRooms.length ? '방 하나 더 만들기' : '내 방 만들기'}
        </button>
      </div>

      <ol className="steps">
        <li>
          <b>1</b>미니미랑 방 고르기
        </li>
        <li>
          <b>2</b>스토리에 링크 올리기
        </li>
        <li>
          <b>3</b>친구들이 채워주는 방 구경하기
        </li>
      </ol>
    </main>
  )
}
