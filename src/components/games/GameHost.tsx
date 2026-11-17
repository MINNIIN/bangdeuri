/**
 * 미니게임 화면: 오락실·PC방 기계에 도착하면 화면 전체로 열린다.
 * 게임은 처음 열 때만 내려받는다 (lazy) — 동네 처음 열기는 가볍게.
 */
import { lazy, type LazyExoticComponent, type ComponentType, Suspense, useEffect, useState } from 'react'
import { bestScore, type GameId, type GameProps, type GameResult, isMuted, setMuted, useHoldBgm } from './kit'

const GAMES: Record<GameId, { title: string; load: LazyExoticComponent<ComponentType<GameProps>> }> = {
  claw: { title: '집게왕 인형뽑기', load: lazy(() => import('./ClawGame')) },
  punch: { title: '꽝꽝펀치', load: lazy(() => import('./PunchGame')) },
  race: { title: '붕붕레이서', load: lazy(() => import('./RaceGame')) },
  rhythm: { title: '둠칫스텝', load: lazy(() => import('./RhythmGame')) },
  space: { title: '우주 대결', load: lazy(() => import('./SpaceGame')) },
}

export const gameTitle = (id: GameId) => GAMES[id].title

export function GameHost({ game, onResult, onClose }: { game: GameId | null; onResult: (game: GameId, r: GameResult) => void; onClose: () => void }) {
  if (!game) return null
  return <GameScreen key={game} game={game} onResult={(r) => onResult(game, r)} onClose={onClose} />
}

function GameScreen({ game, onResult, onClose }: { game: GameId; onResult: (r: GameResult) => void; onClose: () => void }) {
  useHoldBgm()
  const [mute, setMute] = useState(isMuted)
  const [best, setBest] = useState(() => bestScore(game))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const G = GAMES[game].load
  return (
    <div className="game-screen" role="dialog" aria-modal aria-label={GAMES[game].title}>
      <div className="game-bar">
        <b className="game-title">{GAMES[game].title}</b>
        {best > 0 && <span className="game-best">최고 {best.toLocaleString()}</span>}
        <button
          className="game-btn"
          aria-label={mute ? '소리 켜기' : '소리 끄기'}
          onClick={() => {
            setMuted(!mute)
            setMute(!mute)
          }}
        >
          {mute ? '🔇' : '🔊'}
        </button>
        <button className="game-btn" aria-label="게임 닫기" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="game-stage">
        <Suspense fallback={<div className="game-loading">기계 켜는 중…</div>}>
          <G
            onResult={(r) => {
              setBest(bestScore(game))
              onResult(r)
            }}
            onClose={onClose}
          />
        </Suspense>
      </div>
    </div>
  )
}
