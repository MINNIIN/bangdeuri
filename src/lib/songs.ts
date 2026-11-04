/**
 * 턴테이블 노래: iTunes 검색 → 30초 미리듣기.
 * Apple 규칙대로 앨범 아트와 "Apple Music에서 듣기" 링크를 같이 보여 주고, 미리듣기 파일은 저장하지 않는다.
 * 브라우저에서 직접 부르지 않고 /api/music(배포: Cloudflare Pages 함수, 개발: Vite 프록시)을 거친다.
 */
export interface Song {
  id: number
  title: string
  artist: string
  art: string
  preview: string
  link: string
}

/** 미리듣기 길이 (초) */
export const PREVIEW_SEC = 30

interface ItunesRow {
  kind?: string
  trackId?: number
  trackName?: string
  artistName?: string
  artworkUrl100?: string
  previewUrl?: string
  trackViewUrl?: string
}

export function parseItunes(json: unknown): Song[] {
  const rows = (json as { results?: unknown } | null)?.results
  if (!Array.isArray(rows)) return []
  return (rows as ItunesRow[]).flatMap((r) =>
    r.kind === 'song' && r.previewUrl && r.trackId && r.trackName
      ? [
          {
            id: r.trackId,
            title: r.trackName,
            artist: r.artistName ?? '',
            art: (r.artworkUrl100 ?? '').replace('100x100', '200x200'),
            preview: r.previewUrl,
            link: r.trackViewUrl ?? '',
          },
        ]
      : [],
  )
}

export async function searchSongs(term: string, signal?: AbortSignal): Promise<Song[]> {
  const q = term.trim().slice(0, 60)
  if (!q) return []
  const res = await fetch(`/api/music?term=${encodeURIComponent(q)}`, { signal })
  if (!res.ok) throw new Error('music_failed')
  return parseItunes(await res.json())
}

/** 같이 듣기: 시작 시각(at)에서 지금까지 지난 초. 미리듣기가 끝났으면 null */
export function songOffset(at: number, now: number): number | null {
  const sec = Math.max(0, (now - at) / 1000)
  return sec >= PREVIEW_SEC ? null : sec
}
