import { shade } from './decor'
import type { Sprite } from './sprite'

/**
 * 직접 만드는 미니미. 20×28 도트를 머리·얼굴·상의·하의·모자 조각을 겹쳐 만든다.
 *
 *  0~7줄  머리 위 (머리 모양 또는 모자)
 *  8~13줄 얼굴 (양옆 4칸은 머리카락 테두리)
 *  14줄 턱, 15줄 머리 아래 외곽선
 *  16~21줄 상의, 22~27줄 하의와 다리
 *
 * 글자: s 피부 b 볼터치 m 입 h 머리 H 머리 하이라이트 t 상의 T 상의 그늘
 *       j 하의 J 하의 그늘 o 신발 c 모자 C 모자 그늘 L 모자 밝은 곳 e 귀 안쪽 y 장식
 */

export type HairId = 'bob' | 'short' | 'long' | 'bun' | 'curly'
export type EyesId = 'round' | 'smile' | 'dot' | 'wink' | 'shades'
export type TopId = 'tee' | 'hoodie' | 'stripe'
export type BottomId = 'skirt' | 'pants' | 'shorts' | 'dress'
export type HatId = 'none' | 'cap' | 'beanie' | 'bear' | 'pin' | 'ribbon'

export interface AvatarLook {
  hair: HairId
  hairColor: string
  skin: string
  eyes: EyesId
  top: TopId
  topColor: string
  bottom: BottomId
  bottomColor: string
  hat: HatId
  hatColor: string
}

interface Head {
  top: string[]
  frame: [string, string]
  chin: string
  outline: string
  /** 몸 위로 내려오는 머리카락 (16줄부터, '.'은 그대로 둔다) */
  over?: string[]
}

const BOB_TOP = [
  '.......kkkkkk.......',
  '.....kkhhhhhhkk.....',
  '....khhhhhhhhhhk....',
  '...khhhHHhhhhhhhk...',
  '..khhhHHhhhhhhhhhk..',
  '..khhHHhhhhhhhhhhk..',
  '.khhhhhhhhhhhhhhhhk.',
  '.khhhhhhhhhhhhhhhhk.',
]
const BOB_CHIN = '..khh' + 'ssssssssss' + 'hhk..'
const BOB_OUTLINE = '..khhkkkkkkkkkkhhk..'
const LONG_CHIN = '.khhh' + 'ssssssssss' + 'hhhk.'
const LONG_OUTLINE = '.khhhkkkkkkkkkkhhhk.'

const HAIRS: Record<HairId, Head> = {
  bob: { top: BOB_TOP, frame: ['.khh', 'hhk.'], chin: BOB_CHIN, outline: BOB_OUTLINE },
  short: {
    top: [
      '....................',
      '......kkkkkkkk......',
      '....kkhhhhhhhhkk....',
      '...khhhhHHhhhhhhk...',
      '..khhhhHHhhhhhhhhk..',
      '..khhhhhhhhhhhhhhk..',
      '..khhhhhhhhhhhhhhk..',
      '..khhhhhhhhhhhhhhk..',
    ],
    frame: ['..kh', 'hk..'],
    chin: '...kssssssssssssk...',
    outline: '....kkkkkkkkkkkk....',
  },
  long: {
    top: BOB_TOP,
    frame: ['.khh', 'hhk.'],
    chin: LONG_CHIN,
    outline: LONG_OUTLINE,
    over: ['.khk............khk.', '.khk............khk.', '..k..............k..'],
  },
  bun: {
    top: [
      '........kkkk........',
      '.......khHhhk.......',
      '......kkkhhkkk......',
      '....kkhhhhhhhhkk....',
      '...khhhHHhhhhhhhk...',
      '..khhhHHhhhhhhhhhk..',
      '.khhhhhhhhhhhhhhhhk.',
      '.khhhhhhhhhhhhhhhhk.',
    ],
    frame: ['.khh', 'hhk.'],
    chin: BOB_CHIN,
    outline: BOB_OUTLINE,
  },
  curly: {
    top: [
      '.....kk.kkkk.kk.....',
      '....khhkhhhhkhhk....',
      '...khhhhhhhhhhhhk...',
      '..khhHhhhhhhhHhhhk..',
      '.khhhhhhhhhhhhhhhhk.',
      '.khhhHhhhhhhHhhhhhk.',
      '.khhhhhhhhhhhhhhhhk.',
      'khhhhhhhhhhhhhhhhhhk',
    ],
    frame: ['khhh', 'hhhk'],
    chin: LONG_CHIN,
    outline: BOB_OUTLINE,
  },
}

/** 머리 위를 통째로 덮는 모자. head가 있으면 얼굴 테두리까지 바꾼다 (후드) */
const HATS: Partial<Record<HatId, { top: string[]; head?: Omit<Head, 'top'> }>> = {
  cap: {
    top: [
      '.......kkkkkk.......',
      '.....kkcccccckk.....',
      '....kccccccLLcck....',
      '...kccccwwccLLcck...',
      '..kcccccwwccLLccck..',
      '..kcccccccccccccck..',
      '.kcccccccccccccccck.',
      '.kCCCCCCCCCCCCCCCCk.',
    ],
  },
  beanie: {
    top: [
      '.........yy.........',
      '........yyyy........',
      '......kkkyykkk......',
      '....kkccCccCcckk....',
      '...kcCccCccCccCck...',
      '..kcCccCccCccCccck..',
      '.kLLLLLLLLLLLLLLLLk.',
      '.kCCCCCCCCCCCCCCCCk.',
    ],
  },
  bear: {
    top: [
      '..kkkk........kkkk..',
      '.kcccck......kcccck.',
      '.kceeckkkkkkkkceeck.',
      '..kcccccccccccccck..',
      '.kcccccccccccccccck.',
      '.kcccccccccccccccck.',
      '.kcccccccccccccccck.',
      '.kccchhhhhhhhhhccck.',
    ],
    head: {
      frame: ['.kcc', 'cck.'],
      chin: '.kccc' + 'ssssssssss' + 'ccck.',
      outline: '..kcccccccccccccck..',
    },
  },
}

/** 머리카락 위에 얹는 작은 장식 (줄 번호 → 겹칠 줄) */
const ACCESSORIES: Partial<Record<HatId, Record<number, string>>> = {
  pin: { 4: '..............yy....', 5: '..............yy....' },
  ribbon: { 1: '............kyk.kyk.', 2: '.............kyyyk..', 3: '............kyk.kyk.' },
}

const EYES: Record<EyesId, string[]> = {
  round: ['ssssssssssss', 'sskwsssskwss', 'sskksssskkss', 'sskksssskkss', 'sbbssmmssbbs', 'ssssssssssss'],
  smile: ['ssssssssssss', 'ssssssssssss', 'ssskssssksss', 'ssksksskskss', 'sbbssmmssbbs', 'ssssssssssss'],
  dot: ['ssssssssssss', 'ssssssssssss', 'ssskssssksss', 'ssskssssksss', 'sbbssmmssbbs', 'ssssssssssss'],
  wink: ['ssssssssssss', 'sskwssssssss', 'sskkssssssss', 'sskkssskkkss', 'sbbssmmssbbs', 'ssssssssssss'],
  shades: ['ssssssssssss', 'ssssssssssss', 'skkkkkkkkkks', 'skkkksskkkks', 'sbbssmmssbbs', 'ssssssssssss'],
}

const TOPS: Record<TopId, string[]> = {
  tee: [
    '......kwwwwwwk......',
    '.....ktTtwwtTtk.....',
    '....kttttttttttk....',
    '...ktTttttttttTtk...',
    '...ktTttttttttTtk...',
    '...kskttttttttksk...',
  ],
  hoodie: [
    '......kTTTTTTk......',
    '.....ktTtwwtTtk.....',
    '....kttttttttttk....',
    '...ktTttTTTTttTtk...',
    '...ktTttTTTTttTtk...',
    '...kskttttttttksk...',
  ],
  stripe: [
    '......kwwwwwwk......',
    '.....kttttttttk.....',
    '....kwwwwwwwwwwk....',
    '...kttttttttttttk...',
    '...kTwwwwwwwwwwTk...',
    '...kskttttttttksk...',
  ],
}

const BOTTOMS: Record<BottomId, string[]> = {
  skirt: [
    '....kjjjjjjjjjjk....',
    '...kjjjjjjjjjjjjk...',
    '...kkkkkkkkkkkkkk...',
    '......ksk..ksk......',
    '.....kook..kook.....',
    '.....kkkk..kkkk.....',
  ],
  pants: [
    '....kjjjjjjjjjjk....',
    '....kjjjjkkjjjjk....',
    '....kjjjk..kjjjk....',
    '.....kjjk..kjjk.....',
    '....koook..koook....',
    '....kkkkk..kkkkk....',
  ],
  shorts: [
    '....kjjjjjjjjjjk....',
    '....kjjjjjjjjjjk....',
    '....kjjjk..kjjjk....',
    '.....kssk..kssk.....',
    '.....kook..kook.....',
    '.....kkkk..kkkk.....',
  ],
  dress: [
    '....kjjjjjjjjjjk....',
    '...kjJjjjjjjjjJjk...',
    '..kjJjjjjjjjjjjJjk..',
    '..kkkkkkkkkkkkkkkk..',
    '......ksk..ksk......',
    '.....kook..kook.....',
  ],
}

// ─── 고를 수 있는 것들 ───

export const HAIR_OPTIONS: { id: HairId; name: string }[] = [
  { id: 'bob', name: '단발' },
  { id: 'short', name: '짧은 머리' },
  { id: 'long', name: '긴 머리' },
  { id: 'bun', name: '똥머리' },
  { id: 'curly', name: '뽀글' },
]
export const EYES_OPTIONS: { id: EyesId; name: string }[] = [
  { id: 'round', name: '똘망' },
  { id: 'smile', name: '웃는 눈' },
  { id: 'dot', name: '점 눈' },
  { id: 'wink', name: '윙크' },
  { id: 'shades', name: '선글라스' },
]
export const TOP_OPTIONS: { id: TopId; name: string }[] = [
  { id: 'tee', name: '티셔츠' },
  { id: 'hoodie', name: '후드' },
  { id: 'stripe', name: '줄무늬' },
]
export const BOTTOM_OPTIONS: { id: BottomId; name: string }[] = [
  { id: 'skirt', name: '치마' },
  { id: 'pants', name: '바지' },
  { id: 'shorts', name: '반바지' },
  { id: 'dress', name: '긴 치마' },
]
export const HAT_OPTIONS: { id: HatId; name: string }[] = [
  { id: 'none', name: '없음' },
  { id: 'cap', name: '캡모자' },
  { id: 'beanie', name: '비니' },
  { id: 'bear', name: '곰 후드' },
  { id: 'pin', name: '머리핀' },
  { id: 'ribbon', name: '리본' },
]

export const SKIN_COLORS = ['#ffe0cc', '#f6cfae', '#e0a983', '#a8704f']
export const HAIR_COLORS = ['#3b2b3f', '#7a4b2e', '#c98a4b', '#f2d16b', '#e8553a', '#ff8fb8', '#6a8cff', '#59c26b', '#e9e4ef']
export const CLOTH_COLORS = ['#ff8fb8', '#6fd6b8', '#ffd94a', '#6a8cff', '#e8553a', '#9d8cff', '#4a4f8c', '#59c26b', '#f3e6d6', '#4b4458']
export const HAT_COLORS = ['#4d7dff', '#e8553a', '#ffd94a', '#b07a4f', '#ff8fb8', '#59c26b', '#f3e6d6', '#4b4458']

export const LOOK_PARTS = {
  hair: HAIR_OPTIONS,
  eyes: EYES_OPTIONS,
  top: TOP_OPTIONS,
  bottom: BOTTOM_OPTIONS,
  hat: HAT_OPTIONS,
} as const

// ─── 만들기 ───

const overlay = (row: string, over: string) => [...row].map((ch, i) => (over[i] && over[i] !== '.' ? over[i] : ch)).join('')

const cache = new Map<string, Sprite>()

export const lookKey = (l: AvatarLook) =>
  [l.hair, l.hairColor, l.skin, l.eyes, l.top, l.topColor, l.bottom, l.bottomColor, l.hat, l.hatColor].join('|')

export function buildAvatar(look: AvatarLook): Sprite {
  const key = lookKey(look)
  const hit = cache.get(key)
  if (hit) return hit

  const hair = HAIRS[look.hair] ?? HAIRS.bob
  const hat = HATS[look.hat]
  const head = { ...hair, ...hat?.head }
  const top = (hat?.top ?? hair.top).map((row, y) => {
    const acc = ACCESSORIES[look.hat]?.[y]
    return acc ? overlay(row, acc) : row
  })
  const face = (EYES[look.eyes] ?? EYES.round).map((f) => head.frame[0] + f + head.frame[1])
  const body = [...(TOPS[look.top] ?? TOPS.tee), ...(BOTTOMS[look.bottom] ?? BOTTOMS.skirt)]
  const over = hat?.head ? undefined : hair.over
  const bodyRows = body.map((row, i) => (over?.[i] ? overlay(row, over[i]) : row))

  const accent = look.hat === 'pin' || look.hat === 'ribbon' ? look.hatColor : shade(look.hatColor, 0.7)
  const sprite: Sprite = {
    rows: [...top, ...face, head.chin, head.outline, ...bodyRows],
    palette: {
      s: look.skin,
      b: '#ffa3b1',
      m: '#d0546f',
      h: look.hairColor,
      H: shade(look.hairColor, 0.28),
      t: look.topColor,
      T: shade(look.topColor, -0.16),
      j: look.bottomColor,
      J: shade(look.bottomColor, -0.18),
      o: '#5a3d5c',
      c: look.hatColor,
      C: shade(look.hatColor, -0.22),
      L: shade(look.hatColor, 0.4),
      e: '#ffb3c1',
      y: accent,
    },
    back: look.hat === 'bear' ? 'c' : 'h',
  }
  cache.set(key, sprite)
  return sprite
}

// ─── 기본 모습들 ───

export const PRESET_LOOKS: { id: string; name: string; look: AvatarLook }[] = [
  {
    id: 'bob',
    name: '단발 미니미',
    look: {
      hair: 'bob',
      hairColor: '#3b2b3f',
      skin: '#ffe0cc',
      eyes: 'round',
      top: 'tee',
      topColor: '#ff8fb8',
      bottom: 'skirt',
      bottomColor: '#6a8cff',
      hat: 'pin',
      hatColor: '#ffd94a',
    },
  },
  {
    id: 'cap',
    name: '캡모자 미니미',
    look: {
      hair: 'short',
      hairColor: '#7a4b2e',
      skin: '#ffe0cc',
      eyes: 'round',
      top: 'hoodie',
      topColor: '#6fd6b8',
      bottom: 'pants',
      bottomColor: '#4a4f8c',
      hat: 'cap',
      hatColor: '#4d7dff',
    },
  },
  {
    id: 'bear',
    name: '곰돌이 미니미',
    look: {
      hair: 'short',
      hairColor: '#7a4b2e',
      skin: '#ffe0cc',
      eyes: 'smile',
      top: 'hoodie',
      topColor: '#f3e6d6',
      bottom: 'pants',
      bottomColor: '#b07a4f',
      hat: 'bear',
      hatColor: '#b07a4f',
    },
  },
]

export const DEFAULT_LOOK = PRESET_LOOKS[0].look

/** 정체를 숨긴 익명 미니미: 검은 비니에 선글라스, 후드 */
export const ANON_LOOK: AvatarLook = {
  hair: 'short',
  hairColor: '#3b2b3f',
  skin: '#f6cfae',
  eyes: 'shades',
  top: 'hoodie',
  topColor: '#4b4458',
  bottom: 'pants',
  bottomColor: '#4b4458',
  hat: 'beanie',
  hatColor: '#4b4458',
}

const pick = <T,>(list: readonly T[], r: () => number) => list[Math.floor(r() * list.length) % list.length]

/** 가입 안 한 손님의 미니미: 아무렇게나 섞는다 */
export function randomLook(r: () => number = Math.random): AvatarLook {
  return {
    hair: pick(HAIR_OPTIONS, r).id,
    hairColor: pick(HAIR_COLORS, r),
    skin: pick(SKIN_COLORS, r),
    eyes: pick(EYES_OPTIONS.filter((e) => e.id !== 'shades'), r).id,
    top: pick(TOP_OPTIONS, r).id,
    topColor: pick(CLOTH_COLORS, r),
    bottom: pick(BOTTOM_OPTIONS, r).id,
    bottomColor: pick(CLOTH_COLORS, r),
    hat: pick(HAT_OPTIONS, r).id,
    hatColor: pick(HAT_COLORS, r),
  }
}

const HEX = /^#[0-9a-f]{6}$/i

/** 서버나 다른 사람에게서 받은 모습은 고를 수 있는 값만 남긴다 */
export function normalizeLook(raw: unknown): AvatarLook {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const oneOf = <T extends string>(v: unknown, list: { id: T }[], fallback: T): T =>
    list.some((o) => o.id === v) ? (v as T) : fallback
  const color = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback)
  const d = DEFAULT_LOOK
  return {
    hair: oneOf(r.hair, HAIR_OPTIONS, d.hair),
    hairColor: color(r.hairColor, d.hairColor),
    skin: color(r.skin, d.skin),
    eyes: oneOf(r.eyes, EYES_OPTIONS, d.eyes),
    top: oneOf(r.top, TOP_OPTIONS, d.top),
    topColor: color(r.topColor, d.topColor),
    bottom: oneOf(r.bottom, BOTTOM_OPTIONS, d.bottom),
    bottomColor: color(r.bottomColor, d.bottomColor),
    hat: oneOf(r.hat, HAT_OPTIONS, d.hat),
    hatColor: color(r.hatColor, d.hatColor),
  }
}
