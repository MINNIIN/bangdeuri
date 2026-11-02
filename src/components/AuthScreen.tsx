import { useState } from 'react'
import type { AppContext } from '../App'
import { backend, type SocialProvider } from '../lib/backend'
import { errorText, PASSWORD_MIN } from '../lib/rules'

/** 로그인·가입: 카카오, 구글, 이메일 */
export function AuthScreen({ ctx, reason }: { ctx: AppContext; reason?: string }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const social = async (p: SocialProvider) => {
    if (busy) return
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

      {backend.local && (
        <p className="owner-tip">테스트 모드예요. 로그인은 이 탭에서만 유지되고, 저장은 이 브라우저에만 돼요.</p>
      )}

      <div className="actions">
        <button className="btn btn-kakao" onClick={() => social('kakao')} disabled={busy}>
          카카오로 시작하기
        </button>
        <button className="btn" onClick={() => social('google')} disabled={busy}>
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
