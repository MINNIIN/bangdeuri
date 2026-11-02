import { useState } from 'react'
import type { AppContext } from '../App'
import { RETURN_KEY } from '../lib/links'
import { ANON_LOOK, type AvatarLook, buildAvatar, randomLook } from '../art/avatar'
import { charLength, clip, NICK_MAX } from '../lib/rules'
import { anonName, store } from '../lib/storage'
import type { Room } from '../lib/types'
import { Icon, SpriteIcon } from './PixelSprite'

export interface Entry {
  name: string
  look: AvatarLook
  /** 회원이 정체를 숨기고 들어왔는지 */
  anon: boolean
}

/** 남의 방에 들어가기 전: 회원은 내 닉네임/익명 고르기, 손님은 닉네임 치기 */
export function EnterSheet({ ctx, room, onEnter }: { ctx: AppContext; room: Room; onEnter: (e: Entry) => void }) {
  const profile = ctx.profile
  const saved = store.guest()
  const [mode, setMode] = useState<'me' | 'anon'>('me')
  const [anon, setAnon] = useState(() => anonName())
  const [nickname, setNickname] = useState(saved?.nickname ?? '')
  const [look, setLook] = useState<AvatarLook>(() => saved?.look ?? randomLook())

  const enter = () => {
    if (profile) {
      onEnter(mode === 'me' ? { name: profile.nickname, look: profile.look, anon: false } : { name: anon, look: ANON_LOOK, anon: true })
      return
    }
    const name = nickname.trim()
    if (!name) return
    store.setGuest(name, look)
    onEnter({ name, look, anon: false })
  }

  return (
    <div className="enter">
      <h2 className="enter-title">{room.owner.nickname}의 방에 놀러 왔어요</h2>

      {profile ? (
        <div className="enter-choices" role="radiogroup" aria-label="어떻게 들어갈까요">
          <button role="radio" aria-checked={mode === 'me'} className={`choice ${mode === 'me' ? 'is-on' : ''}`} onClick={() => setMode('me')}>
            <SpriteIcon sprite={buildAvatar(profile.look)} size={64} />
            <b>{profile.nickname}</b>
            <span className="muted">내 닉네임으로</span>
          </button>
          <button role="radio" aria-checked={mode === 'anon'} className={`choice ${mode === 'anon' ? 'is-on' : ''}`} onClick={() => setMode('anon')}>
            <SpriteIcon sprite={buildAvatar(ANON_LOOK)} size={64} />
            <b>{anon}</b>
            <span className="muted">익명으로 (정체 숨기기)</span>
          </button>
          {mode === 'anon' && (
            <button className="link center-link enter-reroll" onClick={() => setAnon(anonName())}>
              다른 이름 뽑기
            </button>
          )}
        </div>
      ) : (
        <form
          className="form enter-guest"
          onSubmit={(e) => {
            e.preventDefault()
            enter()
          }}
        >
          <div className="enter-look">
            <SpriteIcon sprite={buildAvatar(look)} size={72} />
            <button type="button" className="btn btn-small" onClick={() => setLook(randomLook())}>
              <Icon id="dice" size={14} /> 다른 모습
            </button>
          </div>
          <label className="field">
            <span>
              내 닉네임 <em>{charLength(nickname)}/{NICK_MAX}</em>
            </span>
            <input
              value={nickname}
              onChange={(e) => setNickname(clip(e.target.value, NICK_MAX))}
              placeholder={`${room.owner.nickname}이(가) 알아볼 이름`}
              autoFocus
              required
            />
          </label>
        </form>
      )}

      <button className="btn btn-primary btn-big" onClick={enter} disabled={!profile && !nickname.trim()}>
        들어가기
      </button>
      {!profile && (
        <button
          className="link center-link"
          onClick={() => {
            try {
              sessionStorage.setItem(RETURN_KEY, room.slug)
            } catch {
              // 못 기억하면 로그인 뒤 첫 화면으로
            }
            ctx.go({ kind: 'login' })
          }}
        >
          회원이면 로그인하고 내 미니미로 들어가기
        </button>
      )}
    </div>
  )
}
