import { itemById } from './items'
import type { Sprite } from './sprite'

const r = (s: string, n: number) => s.repeat(n)

/** 집에 처음부터 붙어 있는 설비 (친구가 놓는 아이템 목록에는 없다) */
export const FIXTURE_SPRITES: Record<string, { name: string; sprite: Sprite }> = {
  toilet: {
    name: '변기',
    sprite: {
      palette: { W: '#d6e2ee', h: '#9a9ab4' },
      rows: [
        '..kkkkkkkkkk..',
        '..kwwwwwwwwk..',
        '..kwwwwwwhhk..',
        '..kwwwwwwwwk..',
        '..kwwwwwwwwk..',
        '..kWWWWWWWWk..',
        '..kkkkkkkkkk..',
        '...kwwwwwwk...',
        '.kkkkkkkkkkkk.',
        'kwwwwwwwwwwwwk',
        'kWWWWWWWWWWWWk',
        '.kwwwwwwwwwwk.',
        '..kwwwwwwwwk..',
        '..kWwwwwwwWk..',
        '...kWwwwwWk...',
        '...kwwwwwwk...',
        '..kkkkkkkkkk..',
      ],
    },
  },
  basin: {
    name: '세면대',
    sprite: {
      palette: { W: '#d6e2ee', h: '#9a9ab4', B: '#9fdcff' },
      rows: [
        '....kkkk....',
        '....khhk....',
        '.....khk....',
        'kkkkkkkkkkkk',
        'kwwwwwwwwwwk',
        'kwBBBBBBBBwk',
        'kwwwwwwwwwwk',
        '.kWWWWWWWWk.',
        '..kkkkkkkk..',
        '....kwWk....',
        '....kwWk....',
        '....kwWk....',
        '....kwWk....',
        '...kkkkkk...',
        '...kWWWWk...',
        '...kkkkkk...',
      ],
    },
  },
  bathtub: {
    name: '욕조',
    sprite: {
      palette: { W: '#d6e2ee', B: '#9fdcff', b: '#7ac6f0', f: '#ffffff', h: '#ffcf4a' },
      rows: [
        'k' + r('k', 24) + 'k',
        'kw' + 'fBBffBBBBBBBBBBffBBBBf' + 'wk',
        'kw' + r('b', 22) + 'wk',
        r('k', 26),
        'k' + r('w', 24) + 'k',
        'k' + r('w', 24) + 'k',
        'k' + r('w', 10) + 'hhhh' + r('w', 10) + 'k',
        'k' + r('w', 24) + 'k',
        'k' + r('W', 24) + 'k',
        '.k' + r('W', 22) + 'k.',
        '..kkkk' + r('.', 14) + 'kkkk..',
      ],
    },
  },
  counter: {
    name: '싱크대',
    sprite: {
      palette: { g: '#f2ece2', G: '#d9cfbf', h: '#9a9ab4', B: '#9fdcff', f: '#dcaa72', F: '#a87445', d: '#3a3a4a', R: '#ff5c3a', y: '#ffcf4a' },
      rows: [
        '....kkkk......................',
        '....khhk......................',
        '.....khk......................',
        r('k', 30),
        'k' + 'g' + r('B', 8) + r('g', 5) + 'dddd' + 'gg' + 'dddd' + r('g', 4) + 'k',
        'k' + r('G', 28) + 'k',
        r('k', 30),
        'k' + 'ffffff' + 'k' + 'fffffff' + 'k' + 'fffff' + 'k' + 'fffffff' + 'k',
        'k' + 'ffffyf' + 'k' + 'fyfffff' + 'k' + 'fffyf' + 'k' + 'fRfRfRf' + 'k',
        'k' + 'ffffff' + 'k' + 'fffffff' + 'k' + 'fffff' + 'k' + 'kkkkkkk' + 'k',
        'k' + 'ffffff' + 'k' + 'fffffff' + 'k' + 'fffff' + 'k' + 'kdddddk' + 'k',
        'k' + 'ffffff' + 'k' + 'fffffff' + 'k' + 'fffff' + 'k' + 'kdddddk' + 'k',
        'k' + 'ffffff' + 'k' + 'fffffff' + 'k' + 'fffff' + 'k' + 'kkkkkkk' + 'k',
        'k' + r('F', 28) + 'k',
        r('k', 30),
      ],
    },
  },
}

/** 아이템이든 설비든 id로 그림을 찾는다 */
export function artById(id: string): { name: string; sprite: Sprite } | undefined {
  return itemById(id) ?? FIXTURE_SPRITES[id]
}
