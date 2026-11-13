import { useState } from 'react'
import type { AppContext } from '../App'
import { defaultDecor } from '../art/decor'
import { THEMES } from '../art/themes'
import { backend } from '../lib/backend'
import { charLength, clip, errorText, MOTTO_MAX, NAME_MAX } from '../lib/rules'
import { store } from '../lib/storage'
import type { ThemeId } from '../lib/types'
import { Icon } from './PixelSprite'
import { RoomScene } from './RoomScene'

const STEPS = ['방 고르기', '이름 정하기']

export function CreateScreen({ ctx }: { ctx: AppContext }) {
  const [step, setStep] = useState(0)
  const look = ctx.profile!.look
  const [theme, setTheme] = useState<ThemeId>('pink')
  const [name, setName] = useState(ctx.profile?.nickname ?? '')
  const [motto, setMotto] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const room = await backend.createRoom({ name: name.trim(), theme, motto: motto.trim() })
      // 방이 없을 때 이름을 밝히고 놀러 갔던 친구 방들과 이웃이 된다 (서로의 골목에 집이 생긴다)
      const named = store.visits().filter((v) => v.named && v.ownerId !== ctx.user?.id)
      await Promise.allSettled(named.slice(0, 16).map((v) => backend.becomeNeighbor(v.id)))
      ctx.go({ kind: 'room', slug: room.slug })
      ctx.toast('방이 생겼어요! 이제 친구들에게 링크를 보내 볼까요')
    } catch (e) {
      ctx.toast(errorText(e))
      setBusy(false)
    }
  }

  const back = () => (step === 0 ? ctx.go({ kind: 'home' }) : setStep(step - 1))

  return (
    <main className="screen create">
      <nav className="topbar">
        <button className="btn-ghost" onClick={back} aria-label="뒤로">
          <Icon id="back" />
        </button>
        <span className="topbar-title">
          {step + 1}/{STEPS.length} {STEPS[step]}
        </span>
        <span className="topbar-spacer" />
      </nav>

      <section className="window">
        <div className="window-bar">
          <span>{name.trim() || '나'}의 미니룸</span>
          <span className="counter">TODAY 0 | TOTAL 0</span>
        </div>
        <RoomScene decor={defaultDecor(theme)} look={look} drops={[]} className="room" />
      </section>

      {step === 0 && (
        <div className="choices" role="radiogroup" aria-label="방">
          {THEMES.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={theme === t.id}
              className={`choice ${theme === t.id ? 'is-on' : ''}`}
              onClick={() => setTheme(t.id)}
            >
              <RoomScene decor={defaultDecor(t.id)} look={look} drops={[]} className="choice-room" />
              <b>{t.name}</b>
              <span className="muted">{t.desc}</span>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <label className="field">
            <span>
              내 이름 <em>{charLength(name)}/{NAME_MAX}</em>
            </span>
            <input
              value={name}
              onChange={(e) => setName(clip(e.target.value, NAME_MAX))}
              placeholder="친구들이 아는 이름"
              autoFocus
              required
            />
          </label>
          <label className="field">
            <span>
              오늘의 한마디 <em>{charLength(motto)}/{MOTTO_MAX}</em>
            </span>
            <input
              value={motto}
              onChange={(e) => setMotto(clip(e.target.value, MOTTO_MAX))}
              placeholder="내 방에 뭐 하나 놓고 가 줘"
            />
          </label>
        </form>
      )}

      <div className="actions sticky">
        {step < 1 ? (
          <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
            다음
          </button>
        ) : (
          <button className="btn btn-primary" onClick={submit} disabled={!name.trim() || busy}>
            {busy ? '방 만드는 중…' : '방 만들기'}
          </button>
        )}
      </div>
    </main>
  )
}
