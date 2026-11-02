/**
 * 방 링크(/?r=주소) 미리보기: 카톡·SNS가 링크를 읽어 갈 때 제목을 "OO의 미니룸에 놀러 와!"로 바꿔 준다.
 * Cloudflare Pages Functions에서 돈다 (이 폴더는 Vite 빌드와 상관없이 Cloudflare가 따로 올린다).
 * 방을 못 찾거나 Supabase가 느리면 원래 페이지를 그대로 보낸다.
 */

interface Env {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_KEY?: string
}

interface Ctx {
  request: Request
  env: Env
  next: () => Promise<Response>
}

interface RoomRow {
  name: string
  motto: string
  owner: { nickname: string } | null
}

interface Element {
  setAttribute(name: string, value: string): void
  setInnerContent(content: string): void
}

declare const HTMLRewriter: {
  new (): {
    on(selector: string, handlers: { element(el: Element): void }): InstanceType<typeof HTMLRewriter>
    transform(res: Response): Response
  }
}

const SLUG = /^[a-z0-9]{4,16}$/

/** 부르는 말 + 가: 민수 → 민수가, 지민 → 지민이가 (src/lib/rules.ts와 같은 규칙) */
const subject = (name: string) => {
  const last = name.charCodeAt(name.length - 1)
  const batchim = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0
  return batchim ? `${name}이가` : `${name}가`
}

/** 방 주인이 한마디를 안 썼을 때의 미리보기 설명 */
const inviteText = (owner: string) => `${subject(owner)} 집들이에 초대했어요! 선물 하나 두고, 한마디 남겨 주세요!`

async function findRoom(env: Env, slug: string): Promise<RoomRow | null> {
  const base = env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  const key = env.VITE_SUPABASE_KEY
  if (!base || !key) return null
  const url = `${base}/rest/v1/rooms?slug=eq.${slug}&select=name,motto,owner:profiles(nickname)&limit=1`
  const res = await fetch(url, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(1500),
  })
  if (!res.ok) return null
  const rows = (await res.json()) as RoomRow[]
  return rows[0] ?? null
}

export const onRequest = async ({ request, env, next }: Ctx) => {
  const url = new URL(request.url)
  const slug = url.searchParams.get('r')
  if (url.pathname !== '/' || !slug || !SLUG.test(slug) || request.method !== 'GET') return next()

  const [page, room] = await Promise.all([next(), findRoom(env, slug).catch(() => null)])
  if (!room || !(page.headers.get('content-type') ?? '').includes('text/html')) return page

  const owner = room.owner?.nickname || room.name
  const title = `${room.name}의 미니룸에 놀러 와!`
  const desc = room.motto ? `${owner}: "${room.motto}"` : inviteText(owner)
  const link = `${url.origin}/?r=${slug}`

  const set = (value: string) => ({ element: (el: Element) => el.setAttribute('content', value) })
  const res = new HTMLRewriter()
    .on('title', { element: (el) => el.setInnerContent(`${title} | 방들이`) })
    .on('meta[property="og:title"]', set(title))
    .on('meta[name="twitter:title"]', set(title))
    .on('meta[property="og:description"]', set(desc))
    .on('meta[name="twitter:description"]', set(desc))
    .on('meta[name="description"]', set(desc))
    .on('meta[property="og:url"]', set(link))
    .transform(page)
  // 방 이름·한마디가 바뀔 수 있어서 오래 캐시하지 않는다
  const out = new Response(res.body, res)
  out.headers.set('Cache-Control', 'public, max-age=60')
  return out
}
