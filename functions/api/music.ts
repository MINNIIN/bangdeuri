/**
 * 턴테이블 노래 검색: iTunes Search API를 대신 불러 준다 (브라우저 CORS·국가 고정·캐시).
 * 한국 스토어(country=KR)는 검색 API에서 노래를 하나도 안 돌려줘서(뮤직비디오만) 미국 스토어를 쓴다. K-pop도 다 있다.
 * Cloudflare Pages Functions에서 /api/music?term=검색어 로 돈다. 개발 중에는 vite.config.ts 프록시가 같은 일을 한다.
 */
export const ITUNES_QUERY = 'country=US&entity=song&media=music&limit=20'

export const onRequestGet = async ({ request }: { request: Request }) => {
  const term = new URL(request.url).searchParams.get('term')?.trim() ?? ''
  if (term.length < 1 || term.length > 60) return new Response('{"error":"bad_term"}', { status: 400 })
  const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&${ITUNES_QUERY}`)
  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}
