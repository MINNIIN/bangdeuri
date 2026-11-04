import { describe, expect, it } from 'vitest'
import { parseItunes, PREVIEW_SEC, songOffset } from './songs'

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
