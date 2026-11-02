import { describe, expect, it } from 'vitest'
import { CHARACTERS } from '../art/characters'
import { ITEMS } from '../art/items'
import { BASE_PALETTE, type Sprite, toRuns } from '../art/sprite'
import { clampFloor, clampTilt, floorPoint, MAX_TILT, project, rubberTilt, toFloor, unproject, viewDepth } from './iso'
import { roomIdFrom, roomUrl } from './links'
import { PRESET_LOOKS } from '../art/avatar'
import { createLocalBackend } from './localBackend'
import { CHAT_KEEP, clip, inviteText, kstDate, MAX_DROPS, todayCount } from './rules'

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  }
}

const sprites: [string, Sprite][] = [
  ...CHARACTERS.map((c) => [`character:${c.id}`, c.sprite] as [string, Sprite]),
  ...ITEMS.map((i) => [`item:${i.id}`, i.sprite] as [string, Sprite]),
]

describe('스프라이트', () => {
  it.each(sprites)('%s: 모든 줄 길이가 같다', (_name, s) => {
    const widths = new Set(s.rows.map((r) => r.length))
    expect([...widths]).toHaveLength(1)
  })

  it.each(sprites)('%s: 팔레트에 없는 글자를 쓰지 않는다', (_name, s) => {
    const used = new Set(s.rows.join('').replace(/\./g, ''))
    for (const ch of used) expect(s.palette[ch] ?? BASE_PALETTE[ch], `'${ch}'`).toBeTruthy()
  })

  it('미니미는 20×28', () => {
    for (const c of CHARACTERS) {
      expect(c.sprite.rows).toHaveLength(28)
      expect(c.sprite.rows[0]).toHaveLength(20)
    }
  })

  it('아이템 id는 서버 규칙(소문자·숫자 24자 이하)을 지킨다', () => {
    for (const i of ITEMS) expect(i.id).toMatch(/^[a-z0-9_-]{1,24}$/)
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length)
  })

  it('가로로 이어진 같은 색은 rect 하나로 합친다', () => {
    const runs = toRuns({ palette: { a: '#f00' }, rows: ['aak.a'] })
    expect(runs).toEqual([
      { x: 0, y: 0, w: 2, color: '#f00' },
      { x: 2, y: 0, w: 1, color: BASE_PALETTE.k },
      { x: 4, y: 0, w: 1, color: '#f00' },
    ])
  })
})

describe('아이소메트릭 좌표', () => {
  it('바닥 좌표 → 화면 → 바닥 좌표가 원래대로 돌아온다', () => {
    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [0.3, 0.8],
      [0.5, 0.5],
    ]) {
      const p = floorPoint(u, v)
      const back = toFloor(p.x, p.y)
      expect(back.u).toBeCloseTo(u)
      expect(back.v).toBeCloseTo(v)
    }
  })

  it('바닥 꼭짓점', () => {
    expect(floorPoint(0, 0)).toEqual({ x: 330, y: 135 })
    expect(floorPoint(1, 1)).toEqual({ x: 330, y: 455 })
  })

  it('돌린 방에서도 화면 → 바닥 좌표가 원래대로 돌아온다', () => {
    for (const theta of [0, 0.4, Math.PI / 2, Math.PI, -2.1]) {
      const p = project({ u: 0.2, v: 0.7 }, theta)
      const back = unproject(p.x, p.y, theta)
      expect(back.u).toBeCloseTo(0.2)
      expect(back.v).toBeCloseTo(0.7)
    }
  })

  it('90° 돌리면 왼쪽 앞 모서리가 뒤 모서리 자리로 온다', () => {
    const p = project({ u: 0, v: 1 }, Math.PI / 2)
    expect(p.x).toBeCloseTo(330)
    expect(p.y).toBeCloseTo(135)
    expect(viewDepth({ u: 0, v: 1 }, Math.PI / 2)).toBeCloseTo(0)
  })

  it('회전은 ±30° 안에서만, 끌 때는 한도 밖으로 조금만 늘어난다', () => {
    expect(clampTilt(1)).toBeCloseTo(MAX_TILT)
    expect(clampTilt(-1)).toBeCloseTo(-MAX_TILT)
    expect(clampTilt(0.2)).toBeCloseTo(0.2)
    expect(rubberTilt(0.2)).toBeCloseTo(0.2)
    expect(rubberTilt(MAX_TILT + 0.5)).toBeCloseTo(MAX_TILT + 0.1)
  })

  it('한도 안에서는 처음의 두 벽만 뒤쪽에 있다', () => {
    for (const t of [-MAX_TILT, 0, MAX_TILT]) {
      expect(viewDepth({ u: 0, v: 0.5 }, t)).toBeLessThan(1)
      expect(viewDepth({ u: 0.5, v: 0 }, t)).toBeLessThan(1)
      expect(viewDepth({ u: 1, v: 0.5 }, t)).toBeGreaterThan(1)
      expect(viewDepth({ u: 0.5, v: 1 }, t)).toBeGreaterThan(1)
    }
  })

  it('바닥 밖은 안쪽으로 붙인다', () => {
    expect(clampFloor({ u: -1, v: 2 })).toEqual({ u: 0.04, v: 0.96 })
  })
})

describe('규칙', () => {
  it('한국 날짜는 UTC+9 기준', () => {
    expect(kstDate(new Date('2026-10-24T15:30:00Z'))).toBe('2026-10-25')
    expect(kstDate(new Date('2026-10-24T14:59:00Z'))).toBe('2026-10-24')
  })

  it('오늘 날짜가 아니면 Today는 0', () => {
    const room = { todayVisits: 5, todayDate: '2026-10-23' } as Parameters<typeof todayCount>[0]
    expect(todayCount(room, new Date('2026-10-24T03:00:00Z'))).toBe(0)
    expect(todayCount({ ...room, todayDate: '2026-10-24' }, new Date('2026-10-24T03:00:00Z'))).toBe(5)
  })

  it('초대 문구는 이름 받침에 맞춰 이가/가', () => {
    expect(inviteText('민수')).toBe('민수가 집들이에 초대했어요! 선물 하나 두고, 한마디 남겨 주세요!')
    expect(inviteText('지민').startsWith('지민이가 ')).toBe(true)
    expect(inviteText('Tom').startsWith('Tom가 ')).toBe(true)
  })

  it('글자 자르기는 이모지를 한 글자로 센다', () => {
    expect(clip('안녕🐻하세요', 3)).toBe('안녕🐻')
  })

  it('방 링크', () => {
    const url = roomUrl('https://x.app/?foo=1#a', 'ab12cd34')
    expect(url).toBe('https://x.app/?r=ab12cd34')
    expect(roomIdFrom(url)).toBe('ab12cd34')
    expect(roomIdFrom('https://x.app/?r=<script>')).toBeNull()
  })
})

describe('로컬 모드 저장소', () => {
  const newRoom = { name: '민수', theme: 'pink', motto: '하이' } as const
  const drop = { item: 'ramen', u: 0.3, v: 0.4, nickname: '친구', message: '라면 그만' }

  /** 같은 DB를 쓰는 두 탭: 방 주인 탭, 손님 탭 */
  async function twoTabs() {
    const db = memoryStorage()
    const owner = createLocalBackend(db, memoryStorage())
    const guest = createLocalBackend(db, memoryStorage())
    await owner.signUpEmail('me@test.kr', 'secret1')
    await owner.saveProfile({ nickname: '민수', look: PRESET_LOOKS[1].look })
    return { owner, guest }
  }

  it('가입 → 프로필 → 방 만들기, 방에는 주인 닉네임·미니미가 붙는다', async () => {
    const { owner, guest } = await twoTabs()
    const room = await owner.createRoom(newRoom)
    const seen = await guest.getRoom(room.slug)
    expect(seen?.owner).toEqual({ nickname: '민수', look: PRESET_LOOKS[1].look })
    expect(await owner.myRooms()).toHaveLength(1)
    expect(await guest.myRooms()).toHaveLength(0)
  })

  it('로그인 안 하면 방을 못 만들고, 프로필이 없어도 못 만든다', async () => {
    const be = createLocalBackend(memoryStorage(), memoryStorage())
    await expect(be.createRoom(newRoom)).rejects.toThrow('login_required')
    await be.signUpEmail('a@test.kr', 'secret1')
    await expect(be.createRoom(newRoom)).rejects.toThrow('profile_required')
  })

  it('이메일 가입: 같은 이메일은 한 번, 비밀번호가 틀리면 로그인 안 됨', async () => {
    const db = memoryStorage()
    const a = createLocalBackend(db, memoryStorage())
    await a.signUpEmail('A@test.kr', 'secret1')
    await expect(a.signUpEmail('a@test.kr', 'secret2')).rejects.toThrow('email_taken')
    const b = createLocalBackend(db, memoryStorage())
    await expect(b.signInEmail('a@test.kr', 'nope')).rejects.toThrow('bad_login')
    await b.signInEmail('a@test.kr', 'secret1')
    expect((await b.getUser())?.id).toBe((await a.getUser())?.id)
  })

  it('아이템은 손님도 놓고, 치우기는 방 주인만', async () => {
    const { owner, guest } = await twoTabs()
    const room = await owner.createRoom(newRoom)
    const d = await guest.addDrop(room.id, drop)
    await expect(guest.deleteDrop(room.id, d.id)).rejects.toThrow('forbidden')
    await owner.deleteDrop(room.id, d.id)
    expect(await guest.listDrops(room.id)).toHaveLength(0)
  })

  it(`아이템은 방마다 ${MAX_DROPS}개까지`, async () => {
    const { owner, guest } = await twoTabs()
    const room = await owner.createRoom(newRoom)
    for (let i = 0; i < MAX_DROPS; i++) await guest.addDrop(room.id, drop)
    await expect(guest.addDrop(room.id, drop)).rejects.toThrow('room_full')
  })

  it('채팅: 주인 말에는 주인 표시, 지우기는 주인만, 없는 동안 온 말 세기', async () => {
    const { owner, guest } = await twoTabs()
    const room = await owner.createRoom(newRoom)
    const before = new Date(Date.now() - 1000).toISOString()
    const g = await guest.postMessage(room.id, { name: '수상한 고구마', body: '나 누구게' })
    const o = await owner.postMessage(room.id, { name: '민수', body: '누구야?' })
    expect(g.owner).toBe(false)
    expect(o.owner).toBe(true)
    expect(await owner.countMessagesSince(room.id, before)).toBe(1)
    await expect(guest.deleteMessage(room.id, g.id)).rejects.toThrow('forbidden')
    await owner.deleteMessage(room.id, g.id)
    expect((await guest.listMessages(room.id)).map((m) => m.body)).toEqual(['누구야?'])
  })

  it(`채팅은 방마다 최근 ${CHAT_KEEP}개만 남긴다`, async () => {
    const { owner, guest } = await twoTabs()
    const room = await owner.createRoom(newRoom)
    for (let i = 0; i < CHAT_KEEP + 3; i++) await guest.postMessage(room.id, { name: '친구', body: `${i}` })
    const list = await guest.listMessages(room.id)
    expect(list).toHaveLength(CHAT_KEEP)
    expect(list[0].body).toBe('3')
  })

  it('링크를 새로 만들면 예전 링크로는 못 찾는다', async () => {
    const { owner, guest } = await twoTabs()
    const room = await owner.createRoom(newRoom)
    await expect(guest.resetLink(room.id)).rejects.toThrow('forbidden')
    const next = await owner.resetLink(room.id)
    expect(next).not.toBe(room.slug)
    expect(await guest.getRoom(room.slug)).toBeNull()
    expect((await guest.getRoom(next))?.id).toBe(room.id)
  })

  it('방 삭제는 방 주인만, 지우면 아이템·채팅도 같이 사라진다', async () => {
    const { owner, guest } = await twoTabs()
    const room = await owner.createRoom(newRoom)
    const other = await owner.createRoom({ ...newRoom, name: '다른방' })
    await guest.addDrop(room.id, drop)
    await guest.addDrop(other.id, drop)
    await guest.postMessage(room.id, { name: '친구', body: '안녕' })

    await expect(guest.deleteRoom(room.id)).rejects.toThrow('forbidden')
    await owner.deleteRoom(room.id)
    expect(await guest.getRoom(room.slug)).toBeNull()
    expect(await guest.listDrops(room.id)).toHaveLength(0)
    expect(await guest.listMessages(room.id)).toHaveLength(0)
    expect(await guest.listDrops(other.id)).toHaveLength(1)
  })

  it('방문자 수', async () => {
    const { owner, guest } = await twoTabs()
    const room = await owner.createRoom(newRoom)
    await guest.visit(room.id)
    expect(await guest.visit(room.id)).toEqual({ today: 2, total: 2 })
  })
})
