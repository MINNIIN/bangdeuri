/**
 * 홍보 영상용 단톡방 연출.
 * 개발 서버에서 /promo/chat.html?scene=open (또는 end) 를 열고, 녹화를 시작한 뒤 window.play()를 부른다.
 * ?slow=1.5 처럼 주면 전체 타이밍이 그만큼 느려진다 (편집에서 빠르게 돌리기 좋게).
 */
import { buildAvatar } from '../src/art/avatar'
import { toRuns, spriteWidth, type Sprite } from '../src/art/sprite'
import { FRIENDS, OWNER, type CastMember } from './cast'

const params = new URLSearchParams(location.search)
const scene = params.get('scene') ?? 'open'
const slow = Number(params.get('slow') ?? 1) || 1
const log = document.getElementById('log')!
const byName = new Map(FRIENDS.map((f) => [f.name, f]))

const ROOM_LINK = {
  img: '/og.png',
  title: `${OWNER.name}의 미니룸에 놀러 와!`,
  desc: `${OWNER.name}: “내 방에 뭐 하나 놓고 가 줘”`,
  host: 'bangdeuri.com',
}
const HOME_LINK = {
  img: '/og.png',
  title: '방들이 - 친구들이 놀러 오는 미니룸',
  desc: '내 방에 놀러 와! 같이 돌아다니고, 수다 떨고, 선물 하나 놓고 가 줘',
  host: 'bangdeuri.com',
}

/** 미니미 얼굴만 잘라서 프사로 (머리 위쪽 18줄) */
function face(sprite: Sprite) {
  const w = spriteWidth(sprite)
  const rows = 18
  const runs = toRuns(sprite).filter((r) => r.y < rows)
  const rects = runs.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="1" fill="${r.color}"/>`).join('')
  const side = Math.max(w, rows) + 4
  return `<svg viewBox="${(w - side) / 2} ${rows - side + 1} ${side} ${side}" shape-rendering="crispEdges">${rects}</svg>`
}

const pfp = (m: CastMember) => `<div class="pfp">${face(buildAvatar(m.look))}</div>`
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

let last = ''
let clock = 12
const time = () => {
  const t = `오후 8:${String(clock).padStart(2, '0')}`
  document.getElementById('clock')!.textContent = t
  return t
}

function card(link: typeof ROOM_LINK) {
  return `<div class="card"><img src="${link.img}" alt=""><div class="txt"><b>${esc(link.title)}</b><p>${esc(link.desc)}</p><small>${link.host}</small></div></div>`
}

/** 메시지 한 줄 추가. who가 없으면 나 */
function say(body: string, who?: string, opts: { html?: boolean; unread?: number } = {}) {
  const m = who ? byName.get(who) : undefined
  const mine = !who
  const cont = last === (who ?? '@me')
  last = who ?? '@me'
  const row = document.createElement('div')
  row.className = `row ${mine ? 'mine' : ''} ${cont ? 'cont' : ''}`
  const content = opts.html ? body : `<div class="bubble">${esc(body)}</div>`
  const meta = `<span class="meta">${opts.unread ? `<b>${opts.unread}</b>` : ''}${time()}</span>`
  row.innerHTML = mine
    ? `<div class="line">${content}${meta}</div>`
    : `${pfp(m!)}<div>${cont ? '' : `<div class="who">${who}</div>`}<div class="line">${content}${meta}</div></div>`
  log.querySelector('.typing-row')?.remove()
  log.appendChild(row)
  return row
}

function typing(who: string) {
  log.querySelector('.typing-row')?.remove()
  const row = document.createElement('div')
  row.className = 'row typing-row'
  row.innerHTML = `${pfp(byName.get(who)!)}<div><div class="who">${who}</div><div class="bubble typing"><i></i><i></i><i></i></div></div>`
  log.appendChild(row)
  last = ''
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * slow))

/** 손가락으로 누르는 표시 */
async function tap(el: Element) {
  const t = document.getElementById('tap')!
  const r = el.getBoundingClientRect()
  t.style.left = `${r.left + r.width / 2}px`
  t.style.top = `${r.top + r.height * 0.45}px`
  t.classList.add('on')
  el.classList.add('pressed')
  await wait(260)
  t.classList.remove('on')
}

/** 입력창에 글자가 써지고 → 전송 */
async function typeAndSend(text: string) {
  const field = document.getElementById('field')!
  for (const ch of [...text]) {
    field.textContent += ch
    await wait(45)
  }
  await wait(120)
  field.textContent = ''
  say(text)
}

// 시작 화면: 평소 대화 몇 줄
function setup() {
  log.innerHTML = '<div class="day">2026년 11월 7일 금요일</div>'
  if (scene === 'open') {
    clock = 9
    say('이번 주말 뭐 함', '하린')
    say('집콕 ㅋ', '도윤')
    say('나도 할 거 없음…', '서아')
  } else {
    clock = 31
    say('ㅋㅋㅋㅋㅋㅋ 바선생 누구야', '지윤')
    say('ㄴ ㅏ', '준')
    say('님 방 내가 제일 많이 놓고 감', '나은')
  }
}

async function playOpen() {
  clock = 12
  await wait(300)
  await typeAndSend('얘들아 내 방 놀러 와 🏠')
  await wait(250)
  const link = say(card(ROOM_LINK), undefined, { html: true, unread: 6 })
  await wait(500)
  const replies: [string, string][] = [
    ['지윤', '뭐야 귀여워'],
    ['하린', '싸이월드냐 ㅋㅋㅋㅋ'],
    ['도윤', '들어감'],
    ['서아', '헐 나 미니미 만듦'],
    ['준', '바선생 놓고 옴 ㅋ'],
  ]
  for (const [who, text] of replies) {
    typing(who)
    await wait(260)
    clock = 13
    say(text, who)
    await wait(240)
  }
  await wait(250)
  await tap(link.querySelector('.card')!)
  await wait(120)
  // 카드를 맨 위 레이어로 복제해서 화면 가득 키운다 (다른 말풍선에 가리지 않게)
  const c = link.querySelector<HTMLElement>('.card')!
  const r = c.getBoundingClientRect()
  const top = c.cloneNode(true) as HTMLElement
  top.classList.remove('pressed')
  Object.assign(top.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, margin: '0', zIndex: '50' })
  document.querySelector('.phone')!.appendChild(top)
  c.style.visibility = 'hidden'
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)))
  const scale = Math.max(innerWidth / r.width, innerHeight / r.height) * 1.15
  top.style.transform = `translate(${innerWidth / 2 - (r.left + r.width / 2)}px, ${innerHeight / 2 - (r.top + r.height / 2)}px) scale(${scale})`
  await wait(300)
  document.getElementById('flash')!.classList.add('on')
  await wait(500)
}

async function playEnd() {
  clock = 32
  await wait(300)
  await typeAndSend('ㅋㅋㅋ 너네도 만들어 봐')
  await wait(250)
  say(card(HOME_LINK), undefined, { html: true, unread: 6 })
  await wait(500)
  typing('지윤')
  await wait(300)
  say('만드는 중', '지윤')
  await wait(250)
  say('내 방 오면 똥 놓고 간다', '하린')
  await wait(900)
}

setup()
declare global {
  interface Window {
    play: () => Promise<void>
    reset: () => void
    done?: boolean
  }
}
window.reset = () => {
  window.done = false
  document.getElementById('flash')!.classList.remove('on')
  setup()
}
window.play = async () => {
  window.done = false
  await (scene === 'open' ? playOpen() : playEnd())
  window.done = true
}
// ?auto 로 열면 바로 재생 (미리보기 확인용)
if (params.has('auto')) setTimeout(() => void window.play(), 600)
