import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSafeSong, musicUrls, parseItunes, PREVIEW_SEC, searchSongs, songOffset } from './songs'

const song = (over: Record<string, unknown> = {}) => ({
  kind: 'song',
  trackId: 1,
  trackName: '좋은 날',
  artistName: '아이유',
  artworkUrl100: 'https://is1.mzstatic.com/a/100x100bb.jpg',
  previewUrl: 'https://audio.example/p.m4a',
  trackViewUrl: 'https://music.apple.com/kr/album/1',
  ...over,
})

describe('노래 검색 결과', () => {
  it('미리듣기 있는 곡만 남기고 필드를 옮긴다', () => {
    const list = parseItunes({
      results: [song(), song({ trackId: 2, previewUrl: undefined }), song({ trackId: 3, kind: 'music-video' })],
    })
    expect(list).toEqual([
      {
        id: 1,
        title: '좋은 날',
        artist: '아이유',
        art: 'https://is1.mzstatic.com/a/200x200bb.jpg',
        preview: 'https://audio.example/p.m4a',
        link: 'https://music.apple.com/kr/album/1',
      },
    ])
  })

  it('이상한 응답이면 빈 목록', () => {
    expect(parseItunes(null)).toEqual([])
    expect(parseItunes({})).toEqual([])
    expect(parseItunes({ results: 'x' })).toEqual([])
  })
})

describe('같이 듣기 위치', () => {
  it('시작 시각부터 지난 초', () => {
    expect(songOffset(1000, 1000)).toBe(0)
    expect(songOffset(1000, 11_000)).toBe(10)
  })

  it('미리듣기가 끝났으면 틀지 않는다', () => {
    expect(songOffset(1000, 1000 + PREVIEW_SEC * 1000)).toBeNull()
  })

  it('보낸 사람 시계가 조금 빠르면 처음부터', () => {
    expect(songOffset(5000, 1000)).toBe(0)
  })
})

describe('받은 노래 확인', () => {
  const ok = {
    id: 1,
    title: 'Ditto',
    artist: 'NewJeans',
    art: 'https://is1-ssl.mzstatic.com/image/thumb/a/200x200bb.jpg',
    preview: 'https://audio-ssl.itunes.apple.com/itunes-assets/x.m4a',
    link: 'https://music.apple.com/us/album/ditto/1',
  }

  it('Apple 주소에서 온 곡만 믿는다', () => {
    expect(isSafeSong(ok)).toBe(true)
    expect(isSafeSong({ ...ok, preview: 'https://tracker.example/p.m4a' })).toBe(false)
    expect(isSafeSong({ ...ok, preview: 'http://audio-ssl.itunes.apple.com/x.m4a' })).toBe(false)
    expect(isSafeSong({ ...ok, art: 'https://evil.example/a.jpg' })).toBe(false)
    expect(isSafeSong({ ...ok, link: 'javascript:alert(1)' })).toBe(false)
    expect(isSafeSong({ ...ok, preview: 'https://itunes.apple.com.evil.example/x.m4a' })).toBe(false)
  })

  it('이상한 모양이면 버린다', () => {
    expect(isSafeSong(null)).toBe(false)
    expect(isSafeSong({ ...ok, title: 'x'.repeat(500) })).toBe(false)
    expect(isSafeSong({ ...ok, id: 'x' })).toBe(false)
  })

  it('앨범 아트·링크가 비어 있어도 된다', () => {
    expect(isSafeSong({ ...ok, art: '', link: '' })).toBe(true)
  })
})

describe('노래 검색 (searchSongs)', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
  const one = { results: [{ kind: 'song', trackId: 1, trackName: 'Ditto', artistName: 'NewJeans', previewUrl: 'https://audio-ssl.itunes.apple.com/p.m4a', artworkUrl100: 'https://is1-ssl.mzstatic.com/a.jpg', trackViewUrl: 'https://music.apple.com/x' }] }
  afterEach(() => vi.unstubAllGlobals())

  it('브라우저에서 iTunes를 바로 부른다 (Cloudflare 공용 IP가 iTunes 요청 제한에 걸려서)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(one))
    vi.stubGlobal('fetch', fetchMock)
    const songs = await searchSongs(' 뉴진스 ')
    expect(songs).toHaveLength(1)
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.origin + url.pathname).toBe('https://itunes.apple.com/search')
    expect(url.searchParams.get('term')).toBe('뉴진스')
    expect(url.searchParams.get('country')).toBe('US')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('바로 부르기가 실패하면 우리 서버(/api/music)로 한 번 더', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 429 })).mockResolvedValueOnce(ok(one))
    vi.stubGlobal('fetch', fetchMock)
    expect(await searchSongs('ditto', undefined, '')).toHaveLength(1)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/music?term=ditto')
  })

  it('아이폰처럼 바로 부르기가 막히면 Supabase 함수 → Cloudflare 순서로', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce(ok(one))
    vi.stubGlobal('fetch', fetchMock)
    expect(await searchSongs('ditto', undefined, 'https://x.supabase.co/')).toHaveLength(1)
    expect(fetchMock.mock.calls[1][0]).toBe('https://x.supabase.co/functions/v1/music?term=ditto')
    expect(musicUrls('ditto', 'https://x.supabase.co').at(-1)).toBe('/api/music?term=ditto')
  })

  it('모두 실패하면 music_failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('net'))
        .mockResolvedValueOnce(new Response('', { status: 500 }))
        .mockResolvedValueOnce(new Response('', { status: 429 })),
    )
    await expect(searchSongs('ditto', undefined, 'https://x.supabase.co')).rejects.toThrow('music_failed')
  })
})
