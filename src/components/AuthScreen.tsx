import { useState } from 'react'
import type { AppContext } from '../App'
import { backend, type SocialProvider } from '../lib/backend'
import { inKakaoTalk, openOutsideKakao } from '../lib/install'
import { RETURN_KEY, roomUrl } from '../lib/links'
import { errorText, PASSWORD_MIN } from '../lib/rules'
import { GoogleLogo, KakaoSymbol } from './BrandLogos'

/** 로그인·가입: 카카오, 구글, 이메일 */
export function AuthScreen({ ctx, reason }: { ctx: AppContext; reason?: string }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const kakaoApp = inKakaoTalk()
  /** 카톡 밖(기본 브라우저)에서 열기: 친구 방에서 왔으면 그 방 주소로 */
  const openOutside = () => {
    let back: string | null = null
    try {
      back = sessionStorage.getItem(RETURN_KEY)
    } catch {
      // 못 읽으면 지금 주소로
    }
    openOutsideKakao(back ? roomUrl(window.location.href, back) : window.location.href)
  }

  const social = async (p: SocialProvider) => {
    if (busy) return
    // 구글은 카톡 안 브라우저에서 로그인을 막는다 → 기본 브라우저로 열어서 하게
    if (p === 'google' && kakaoApp) {
      ctx.toast('구글 로그인은 카카오톡 안에서 안 돼요. 다른 브라우저로 열게요')
      return openOutside()
    }
    setBusy(true)
    try {
      await backend.signInWith(p)
    } catch (e) {
      ctx.toast(errorText(e))
      setBusy(false)
    }
  }

  const submit = async () => {
    if (busy || !email.trim() || !password) return
    setBusy(true)
    setNote(null)
    try {
      if (mode === 'signup') await backend.signUpEmail(email, password)
      else await backend.signInEmail(email, password)
    } catch (e) {
      if (e instanceof Error && e.message === 'confirm_email') setNote('가입 확인 메일을 보냈어요. 메일의 링크를 누르면 로그인돼요')
      else ctx.toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    if (!email.trim()) return ctx.toast('이메일을 먼저 적어 주세요')
    try {
      await backend.resetPassword(email)
      setNote('비밀번호를 바꾸는 링크를 메일로 보냈어요')
    } catch (e) {
      ctx.toast(errorText(e))
    }
  }

  return (
    <main className="screen auth">
      <nav className="topbar">
        <button className="btn-ghost" onClick={() => ctx.go({ kind: 'home' })} aria-label="처음으로">
          ←
        </button>
        <span className="topbar-title">시작하기</span>
        <span className="topbar-spacer" />
      </nav>

      <header className="auth-head">
        <h1 className="logo">방들이</h1>
        <p className="lead">{reason ?? '내 방을 만들고 친구들을 불러 봐요'}</p>
      </header>

      {kakaoApp && (
        <div className="owner-tip">
          <p>
            카카오톡 안에서 열었어요. 여기 로그인은 크롬·사파리 같은 다른 브라우저와 따로라서, 다른 브라우저에서 만든 방도 여기서 한 번 더 로그인해야 보여요.
          </p>
          <button type="button" className="btn btn-small" onClick={openOutside}>
            다른 브라우저로 열기
          </button>
        </div>
      )}

      {backend.local && (
        <p className="owner-tip">테스트 모드예요. 로그인은 이 탭에서만 유지되고, 저장은 이 브라우저에만 돼요.</p>
      )}

      <div className="actions">
        <button className="btn btn-social btn-kakao" onClick={() => social('kakao')} disabled={busy}>
          <KakaoSymbol />
          카카오로 시작하기
        </button>
        <button className="btn btn-social" onClick={() => social('google')} disabled={busy}>
          <GoogleLogo />
          구글로 시작하기
        </button>
      </div>

      <p className="divider">
        <span>또는 이메일로</span>
      </p>

      <div className="seg-tabs" role="tablist">
        {(['login', 'signup'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={`seg ${mode === m ? 'is-on' : ''}`} onClick={() => setMode(m)}>
            {m === 'login' ? '로그인' : '가입하기'}
          </button>
        ))}
      </div>

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label className="field">
          <span>이메일</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>
            비밀번호 {mode === 'signup' && <em>{PASSWORD_MIN}자 이상</em>}
          </span>
          <input
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={mode === 'signup' ? PASSWORD_MIN : undefined}
            required
          />
        </label>
        <button className="btn btn-primary" disabled={busy || !email.trim() || !password}>
          {busy ? '잠깐만요…' : mode === 'login' ? '로그인' : '가입하고 시작하기'}
        </button>
        {mode === 'login' && !backend.local && (
          <button type="button" className="link center-link" onClick={reset}>
            비밀번호를 잊었어요
          </button>
        )}
      </form>

      {note && <p className="owner-tip">{note}</p>}
    </main>
  )
}
