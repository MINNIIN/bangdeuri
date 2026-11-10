/**
 * 턴테이블 노래: iTunes 검색 → 30초 미리듣기.
 * Apple 규칙대로 앨범 아트와 "Apple Music에서 듣기" 링크를 같이 보여 주고, 미리듣기 파일은 저장하지 않는다.
 * 브라우저에서 바로 부르고, 막히면 서버(Supabase 함수 → Cloudflare /api/music)를 거친다 (musicUrls 참고).
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

/** 미국 스토어 (한국 스토어는 검색 API에서 노래를 하나도 안 돌려준다). functions/api/music.ts와 같은 조건 */
const ITUNES_QUERY = 'country=US&entity=song&media=music&limit=20'

/**
 * 검색을 시도할 주소들 (앞에서부터).
 * 1. 브라우저에서 iTunes를 바로 (CORS 허용). PC·안드로이드는 이걸로 끝난다.
 * 2. Supabase 함수 music: 아이폰 브라우저는 iTunes가 음악 앱 주소(musics://)로 넘겨 버려서 서버가 대신 받아 온다.
 * 3. /api/music (Cloudflare): 공용 IP라 iTunes 요청 제한(429)에 자주 걸려서 마지막에.
 */
export function musicUrls(term: string, supabaseUrl?: string): string[] {
  const t = encodeURIComponent(term)
  return [
    `https://itunes.apple.com/search?term=${t}&${ITUNES_QUERY}`,
    ...(supabaseUrl ? [`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/music?term=${t}`] : []),
    `/api/music?term=${t}`,
  ]
}

export async function searchSongs(
  term: string,
  signal?: AbortSignal,
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined,
): Promise<Song[]> {
  const q = term.trim().slice(0, 60)
  if (!q) return []
  for (const url of musicUrls(q, supabaseUrl)) {
    try {
      const res = await fetch(url, { signal })
      if (res.ok) return parseItunes(await res.json())
    } catch (e) {
      if (signal?.aborted) throw e
    }
  }
  throw new Error('music_failed')
}

/** 같이 듣기: 시작 시각(at)에서 지금까지 지난 초. 미리듣기가 끝났으면 null */
export function songOffset(at: number, now: number): number | null {
  const sec = Math.max(0, (now - at) / 1000)
  return sec >= PREVIEW_SEC ? null : sec
}

const host = (url: string, ok: (h: string) => boolean) => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && ok(u.hostname)
  } catch {
    return false
  }
}
const under = (h: string, domain: string) => h === domain || h.endsWith(`.${domain}`)
const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max

/**
 * 다른 사람이 실시간으로 보낸 곡은 그대로 믿지 않는다:
 * 아무 주소나 틀게 하면 같은 방 사람들 IP가 새거나 이상한 소리가 날 수 있다. Apple 주소만 받는다.
 */
export function isSafeSong(s: unknown): s is Song {
  const x = s as Partial<Song> | null
  if (!x || typeof x !== 'object') return false
  if (typeof x.id !== 'number' || !Number.isFinite(x.id)) return false
  if (!text(x.title, 200) || !text(x.artist, 200) || !text(x.preview, 500) || !text(x.art, 500) || !text(x.link, 500)) return false
  if (!host(x.preview!, (h) => under(h, 'itunes.apple.com') || under(h, 'mzstatic.com'))) return false
  if (x.art && !host(x.art, (h) => under(h, 'mzstatic.com'))) return false
  if (x.link && !host(x.link, (h) => under(h, 'apple.com'))) return false
  return true
}
