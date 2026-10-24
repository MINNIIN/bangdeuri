import { CHARACTERS } from '../art/characters'
import { ITEMS } from '../art/items'
import { THEMES } from '../art/themes'
import { SpriteIcon } from './PixelSprite'
import { RoomScene } from './RoomScene'

/** 개발용: 미니미·아이템·방을 한눈에 보는 화면 (?gallery, dev 서버에서만) */
export function Gallery() {
  const drops = ITEMS.map((it, i) => ({
    id: it.id,
    roomId: 'g',
    item: it.id,
    u: 0.1 + (i % 6) * 0.16,
    v: 0.1 + Math.floor(i / 6) * 0.3,
    nickname: '',
    message: '',
    createdAt: '',
  }))
  return (
    <main className="screen gallery">
      <div className="gallery-row">
        {CHARACTERS.map((c) => (
          <div key={c.id} className="gallery-cell">
            <SpriteIcon sprite={c.sprite} size={120} />
            <span>{c.name}</span>
          </div>
        ))}
      </div>
      <div className="gallery-row">
        {ITEMS.map((it) => (
          <div key={it.id} className="gallery-cell">
            <SpriteIcon sprite={it.sprite} size={72} />
            <span>{it.name}</span>
          </div>
        ))}
      </div>
      {THEMES.map((t) => (
        <section key={t.id} className="window">
          <RoomScene theme={t.id} character={CHARACTERS[THEMES.indexOf(t)].id} drops={drops} className="room" />
        </section>
      ))}
    </main>
  )
}
