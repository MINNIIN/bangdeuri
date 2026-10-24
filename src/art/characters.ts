import type { CharacterId } from '../lib/types'
import type { Sprite } from './sprite'

export interface CharacterDef {
  id: CharacterId
  name: string
  desc: string
  sprite: Sprite
}

const FACE = { s: '#ffe0cc', b: '#ffa3b1', m: '#d0546f' }

// 얼굴 12칸 × 6줄: 하이라이트 들어간 큰 눈(2×3), 볼터치, 작은 입. 양옆 머리카락/후드는 미니미마다 다르다
const FACE_ROWS = [
  'ssssssssssss',
  'sskwsssskwss',
  'sskksssskkss',
  'sskksssskkss',
  'sbbssmmssbbs',
  'ssssssssssss',
]
const framed = (left: string, right: string) => FACE_ROWS.map((f) => left + f + right)

/** 20×28 미니미 3종 */
export const CHARACTERS: CharacterDef[] = [
  {
    id: 'bob',
    name: '단발 미니미',
    desc: '별 핀 꽂은 단발머리',
    sprite: {
      palette: {
        ...FACE,
        h: '#3b2b3f',
        H: '#6b5470',
        y: '#ffd94a',
        p: '#ff8fb8',
        P: '#e66a98',
        j: '#6a8cff',
        o: '#5a3d5c',
      },
      rows: [
        '.......kkkkkk.......',
        '.....kkhhhhhhkk.....',
        '....khhhhhhhhhhk....',
        '...khhhHHhhhhhhhk...',
        '..khhhHHhhhhhhyyhk..',
        '..khhHHhhhhhhhyyhk..',
        '.khhhhhhhhhhhhhhhhk.',
        '.khhhhhhhhhhhhhhhhk.',
        ...framed('.khh', 'hhk.'),
        '..khh' + 'ssssssssss' + 'hhk..',
        '..khhkkkkkkkkkkhhk..',
        '......kwwwwwwk......',
        '.....kpPpwwpPpk.....',
        '....kppppppppppk....',
        '...kpPppppppppPpk...',
        '...kpPppppppppPpk...',
        '...kskppppppppksk...',
        '....kjjjjjjjjjjk....',
        '...kjjjjjjjjjjjjk...',
        '...kkkkkkkkkkkkkk...',
        '......ksk..ksk......',
        '.....kook..kook.....',
        '.....kkkk..kkkk.....',
      ],
    },
  },
  {
    id: 'cap',
    name: '캡모자 미니미',
    desc: '파란 캡모자에 민트 후드',
    sprite: {
      palette: {
        ...FACE,
        h: '#7a4b2e',
        c: '#4d7dff',
        C: '#2f56c9',
        L: '#8fb0ff',
        g: '#6fd6b8',
        G: '#45b394',
        n: '#3a3f6b',
      },
      rows: [
        '.......kkkkkk.......',
        '.....kk' + 'cccccc' + 'kk.....',
        '....k' + 'ccccccLLcc' + 'k....',
        '...k' + 'ccccwwccLLcc' + 'k...',
        '..k' + 'cccccwwccLLccc' + 'k..',
        '..k' + 'cccccccccccccc' + 'k..',
        '.k' + 'cccccccccccccccc' + 'k.',
        '.k' + 'CCCCCCCCCCCCCCCC' + 'k.',
        ...framed('..kh', 'hk..'),
        '...kssssssssssssk...',
        '....kkkkkkkkkkkk....',
        '......kGGGGGGk......',
        '.....kgGgwwgGgk.....',
        '....kggggggggggk....',
        '...kgGggGGGGggGgk...',
        '...kgGggGGGGggGgk...',
        '...kskggggggggksk...',
        '....knnnnnnnnnnk....',
        '....knnnnkknnnnk....',
        '....knnnk..knnnk....',
        '.....knnk..knnk.....',
        '....kwwwk..kwwwk....',
        '....kkkkk..kkkkk....',
      ],
    },
  },
  {
    id: 'bear',
    name: '곰돌이 미니미',
    desc: '곰돌이 잠옷 입은 집순이',
    sprite: {
      palette: { ...FACE, r: '#b07a4f', R: '#8a5a38', e: '#ffb3c1', t: '#f3d2a8', T: '#e3b987' },
      rows: [
        '..kkkk........kkkk..',
        '.krrrrk......krrrrk.',
        '.kreerkkkkkkkkreerk.',
        '..krrrrrrrrrrrrrrk..',
        '.krrrrrrrrrrrrrrrrk.',
        '.krrrrrrrrrrrrrrrrk.',
        '.krrrrrrrrrrrrrrrrk.',
        '.krrrssssssssssrrrk.',
        ...framed('.krr', 'rrk.'),
        '.krrrssssssssssrrrk.',
        '..krrrrrrrrrrrrrrk..',
        '...krrrrrrrrrrrrk...',
        '..krrrrttttttrrrrk..',
        '.krrrrttttttttrrrrk.',
        '.kRrrttttttttttrrRk.',
        '.kRrrtttttTttttrrRk.',
        '..krrrttttttttrrrk..',
        '..krrrrrrrrrrrrrrk..',
        '..krrrrrrrrrrrrrrk..',
        '..krrrrrrkkrrrrrrk..',
        '..krrrrrk..krrrrrk..',
        '..kRRRRRk..kRRRRRk..',
        '...kkkkk....kkkkk...',
      ],
    },
  },
]

export const characterById = (id: string) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]
