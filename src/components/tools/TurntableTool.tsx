import { useEffect, useReducer, useRef, useState } from 'react'
import { PREVIEW_SEC, searchSongs, type Song, songOffset } from '../../lib/songs'
import { turntable } from '../../lib/turntable'

/** 턴테이블: 노래 검색해서 30초 미리듣기를 방 사람들과 같이 듣는다 */
export function TurntableTool({ onPlay, onStop }: { onPlay: (song: Song) => void; onStop: () => void }) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<Song[] | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [, tick] = useReducer((n: number) => n + 1, 0)
  const req = useRef<AbortController | null>(null)

  useEffect(() => {
    const off = turntable.subscribe(tick)
    const id = window.setInterval(tick, 1000)
    return () => {
      off()
      window.clearInterval(id)
    }
  }, [])

  // 입력을 멈추고 조금 뒤에 검색 (앞 요청은 취소)
  useEffect(() => {
    const q = term.trim()
    if (!q) {
      setResults(null)
      setState('idle')
      return
    }
    const t = window.setTimeout(() => {
      req.current?.abort()
      const ctl = new AbortController()
      req.current = ctl
      setState('loading')
      searchSongs(q, ctl.signal)
        .then((list) => {
          setResults(list)
          setState('idle')
        })
        .catch((e) => {
          if ((e as Error).name !== 'AbortError') setState('error')
        })
    }, 400)
    return () => window.clearTimeout(t)
  }, [term])

  useEffect(() => () => req.current?.abort(), [])

  const now = turntable.current()
  const left = now ? songOffset(now.at, Date.now()) : null

  return (
    <div className="tool-body turntable-tool">
      {now && left !== null && (
        <div className="now-playing">
          {now.song.art && <img src={now.song.art} alt="" width={56} height={56} />}
          <div className="now-body">
            <b>{now.song.title}</b>
            <span className="muted">
              {now.song.artist} · {now.by}님이 틀었어요 · {Math.max(0, Math.ceil(PREVIEW_SEC - left))}초
            </span>
            <div className="row">
              <button className="btn btn-small" onClick={() => turntable.setMuted(!turntable.muted())} aria-pressed={turntable.muted()}>
                {turntable.muted() ? '내 화면 소리 켜기' : '내 화면만 음소거'}
              </button>
              <button className="btn btn-small" onClick={onStop}>
                멈추기
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        className="input"
        type="search"
        inputMode="search"
        placeholder="노래나 가수 검색"
        value={term}
        maxLength={60}
        onChange={(e) => setTerm(e.target.value)}
        aria-label="노래 검색"
      />

      {state === 'loading' && <p className="tool-empty">찾는 중…</p>}
      {state === 'error' && <p className="tool-empty">노래를 못 불러왔어요. 잠시 뒤 다시 해 봐요</p>}
      {state === 'idle' && results?.length === 0 && <p className="tool-empty">찾는 노래가 없어요</p>}
      {state === 'idle' && !results && <p className="tool-empty">틀면 방에 있는 사람 모두 30초 미리듣기를 같이 들어요</p>}

      {results && results.length > 0 && (
        <ul className="song-list">
          {results.map((s) => (
            <li key={s.id} className="song-row">
              {s.art && <img src={s.art} alt="" width={40} height={40} loading="lazy" />}
              <span className="song-body">
                <b>{s.title}</b>
                <span className="muted">{s.artist}</span>
                {s.link && (
                  <a className="song-link" href={s.link} target="_blank" rel="noopener noreferrer">
                    Apple Music에서 듣기
                  </a>
                )}
              </span>
              <button className="btn btn-small btn-primary" onClick={() => onPlay(s)} aria-label={`${s.title} 틀기`}>
                ▶
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="panel-tip">미리듣기 제공: Apple Music</p>
    </div>
  )
}
