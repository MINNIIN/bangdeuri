import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthScreen } from './components/AuthScreen'
import { CreateScreen } from './components/CreateScreen'
import { Gallery } from './components/Gallery'
import { Home } from './components/Home'
import { ProfileScreen } from './components/ProfileScreen'
import { RoomScreen } from './components/RoomScreen'
import { TimerDock } from './components/TimerDock'
import { backend } from './lib/backend'
import { RETURN_KEY, roomIdFrom, roomUrl } from './lib/links'
import type { AuthUser, Profile } from './lib/types'

export type Route =
  | { kind: 'home' }
  | { kind: 'create' }
  | { kind: 'login' }
  | { kind: 'me' }
  | { kind: 'room'; slug: string }

export interface AppContext {
  go: (route: Route) => void
  /** 주소만 바꾼다 (방 링크를 새로 만들었을 때) */
  replace: (route: Route) => void
  toast: (text: string) => void
  user: AuthUser | null
  profile: Profile | null
  setProfile: (p: Profile) => void
}

const QUERY_ROUTES = ['new', 'login', 'me'] as const

const routeFromUrl = (): Route => {
  const slug = roomIdFrom(window.location.href)
  if (slug) return { kind: 'room', slug }
  const q = new URL(window.location.href).searchParams
  if (q.has('new')) return { kind: 'create' }
  if (q.has('login')) return { kind: 'login' }
  if (q.has('me')) return { kind: 'me' }
  return { kind: 'home' }
}

function urlFor(route: Route) {
  if (route.kind === 'room') return roomUrl(window.location.href, route.slug)
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  const q = route.kind === 'create' ? 'new' : route.kind === 'home' ? null : route.kind
  if (q && (QUERY_ROUTES as readonly string[]).includes(q)) url.search = `?${q}`
  return url.toString()
}

const showGallery = import.meta.env.DEV && new URL(window.location.href).searchParams.has('gallery')

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromUrl)
  const [toastText, setToastText] = useState<string | null>(null)
  const toastTimer = useRef<number>(undefined)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    const onPop = () => setRoute(routeFromUrl())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // 로그인 상태와 내 프로필
  useEffect(() => {
    let alive = true
    const load = async (u: AuthUser | null) => {
      const p = u ? await backend.getProfile().catch(() => null) : null
      if (!alive) return
      setUser(u)
      setProfile(p)
      setAuthReady(true)
    }
    backend.getUser().then(load)
    const off = backend.onAuthChange((u) => {
      // 토큰만 새로 받은 경우(같은 사람)는 다시 부르지 않는다
      setUser((prev) => {
        if (prev?.id !== u?.id) void load(u)
        return u
      })
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  const go = useCallback((next: Route) => {
    window.history.pushState(null, '', urlFor(next))
    setRoute(next)
    window.scrollTo(0, 0)
  }, [])

  const replace = useCallback((next: Route) => {
    window.history.replaceState(null, '', urlFor(next))
    setRoute(next)
  }, [])

  const toast = useCallback((text: string) => {
    setToastText(text)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastText(null), 2400)
  }, [])

  // 로그인 화면에서 로그인하면 (소셜 로그인에서 돌아와도) 첫 화면으로
  useEffect(() => {
    if (!authReady || !user || route.kind !== 'login') return
    // 남의 방에서 로그인하러 왔으면 그 방으로 돌아간다
    let back: string | null = null
    try {
      back = sessionStorage.getItem(RETURN_KEY)
      sessionStorage.removeItem(RETURN_KEY)
    } catch {
      // 저장소를 못 쓰면 첫 화면으로
    }
    replace(back ? { kind: 'room', slug: back } : { kind: 'home' })
  }, [authReady, user, route.kind, replace])

  const ctx: AppContext = { go, replace, toast, user, profile, setProfile }

  if (showGallery) return <Gallery />

  let screen
  if (!authReady) screen = <main className="screen center muted">문 여는 중…</main>
  // 처음 가입하면 닉네임과 내 미니미부터 만든다 (방 링크로 왔어도 만들고 나면 그 방으로)
  else if (user && !profile && route.kind !== 'login') screen = <ProfileScreen ctx={ctx} first />
  else if (route.kind === 'login') screen = <AuthScreen ctx={ctx} />
  else if (route.kind === 'me') screen = user ? <ProfileScreen ctx={ctx} /> : <AuthScreen ctx={ctx} />
  else if (route.kind === 'create') screen = user ? <CreateScreen ctx={ctx} /> : <AuthScreen ctx={ctx} reason="방을 만들려면 로그인해 주세요" />
  else if (route.kind === 'room') screen = <RoomScreen key={route.slug} ctx={ctx} slug={route.slug} />
  else screen = <Home ctx={ctx} />

  return (
    <div className="app">
      {screen}
      <TimerDock />
      <div className={`toast ${toastText ? 'is-on' : ''}`} role="status" aria-live="polite">
        {toastText}
      </div>
    </div>
  )
}
