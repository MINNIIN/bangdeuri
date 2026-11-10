// 턴테이블 노래 검색 대신 받아 오기: 아이폰 브라우저는 iTunes 검색이 음악 앱 주소(musics://)로 넘어가 버려서
// 서버가 대신 불러 준다. Cloudflare 함수(/api/music)는 공용 IP라 iTunes 요청 제한(429)에 자주 걸려서 여기를 먼저 쓴다.
// 배포: npx supabase functions deploy music --no-verify-jwt
const ITUNES_QUERY = 'country=US&entity=song&media=music&limit=20'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const term = new URL(req.url).searchParams.get('term')?.trim() ?? ''
  if (term.length < 1 || term.length > 60) {
    return new Response('{"error":"bad_term"}', { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
  const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&${ITUNES_QUERY}`, {
    headers: { 'User-Agent': 'bangdeuri-music/1.0' },
  })
  return new Response(res.body, {
    status: res.status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
})
