import { useCallback, useEffect, useRef, useState } from 'react'
import { CreateScreen } from './components/CreateScreen'
import { Gallery } from './components/Gallery'
import { Home } from './components/Home'
import { RoomScreen } from './components/RoomScreen'
import { backend } from './lib/backend'
import { roomIdFrom, roomUrl } from './lib/links'

type Route = { kind: 'home' } | { kind: 'create' } | { kind: 'room'; id: string }

export interface AppContext {
  go: (route: Route) => void
  toast: (text: string) => void
}

const routeFromUrl = (): Route => {
  const id = roomIdFrom(window.location.href)
  if (id) return { kind: 'room', id }
  return new URL(window.location.href).searchParams.has('new') ? { kind: 'create' } : { kind: 'home' }
}

function urlFor(route: Route) {
  if (route.kind === 'room') return roomUrl(window.location.href, route.id)
  const url = new URL(window.location.href)
  url.search = route.kind === 'create' ? '?new' : ''
  url.hash = ''
  return url.toString()
}

const showGallery = import.meta.env.DEV && new URL(window.location.href).searchParams.has('gallery')

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromUrl)
  const [toastText, setToastText] = useState<string | null>(null)
  const toastTimer = useRef<number>(undefined)

  useEffect(() => {
    const onPop = () => setRoute(routeFromUrl())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = useCallback((next: Route) => {
    window.history.pushState(null, '', urlFor(next))
    setRoute(next)
    window.scrollTo(0, 0)
  }, [])

  const toast = useCallback((text: string) => {
    setToastText(text)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastText(null), 2400)
  }, [])

  const ctx: AppContext = { go, toast }

  if (showGallery) return <Gallery />

  return (
    <div className="app">
      {route.kind === 'home' && <Home ctx={ctx} />}
      {route.kind === 'create' && <CreateScreen ctx={ctx} />}
      {route.kind === 'room' && <RoomScreen key={route.id} ctx={ctx} roomId={route.id} />}

      {backend.local && (
        <p className="local-badge" title="Supabase 키를 넣으면 친구들과 실제로 공유할 수 있어요">
          로컬 모드 · 이 브라우저에만 저장돼요
        </p>
      )}
      <div className={`toast ${toastText ? 'is-on' : ''}`} role="status" aria-live="polite">
        {toastText}
      </div>
    </div>
  )
}
