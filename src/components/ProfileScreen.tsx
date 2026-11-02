import { useState } from 'react'
import type { AppContext } from '../App'
import { type AvatarLook, randomLook } from '../art/avatar'
import { backend } from '../lib/backend'
import { charLength, clip, errorText, NICK_MAX } from '../lib/rules'
import { AvatarEditor } from './AvatarEditor'
import { Icon } from './PixelSprite'

/** 닉네임과 내 미니미 만들기 (처음 가입했을 때 + 대시보드에서 다시 꾸밀 때) */
export function ProfileScreen({ ctx, first = false }: { ctx: AppContext; first?: boolean }) {
  const [nickname, setNickname] = useState(ctx.profile?.nickname ?? '')
  const [look, setLook] = useState<AvatarLook>(() => ctx.profile?.look ?? randomLook())
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!nickname.trim() || busy) return
    setBusy(true)
    try {
      const p = await backend.saveProfile({ nickname, look })
      ctx.setProfile(p)
      ctx.toast(first ? `반가워요, ${p.nickname}!` : '내 미니미를 새로 꾸몄어요')
      if (!first) ctx.go({ kind: 'home' })
    } catch (e) {
      ctx.toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen profile">
      <nav className="topbar">
        {first ? (
          <span className="topbar-spacer" />
        ) : (
          <button className="btn-ghost" onClick={() => ctx.go({ kind: 'home' })} aria-label="뒤로">
            <Icon id="back" />
          </button>
        )}
        <span className="topbar-title">{first ? '내 미니미 만들기' : '내 미니미 꾸미기'}</span>
        <span className="topbar-spacer" />
      </nav>

      {first && <p className="lead center">친구들 방에 놀러 갈 때도 이 모습으로 가요</p>}

      <label className="field">
        <span>
          닉네임 <em>{charLength(nickname)}/{NICK_MAX}</em>
        </span>
        <input
          value={nickname}
          onChange={(e) => setNickname(clip(e.target.value, NICK_MAX))}
          placeholder="친구들이 알아볼 이름"
          autoFocus={first}
          required
        />
      </label>

      <AvatarEditor look={look} onChange={setLook} />

      <div className="actions sticky">
        <button className="btn btn-primary" onClick={save} disabled={!nickname.trim() || busy}>
          {busy ? '저장하는 중…' : first ? '이 모습으로 시작하기' : '저장하기'}
        </button>
        {first && (
          <button className="link center-link" onClick={() => backend.signOut()}>
            다른 계정으로 로그인
          </button>
        )}
      </div>
    </main>
  )
}
