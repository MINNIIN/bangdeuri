import type { Sprite } from './sprite'

/** 화면 곳곳에 쓰는 작은 도트 아이콘 (이모지 대신). 9×9, k = 글자색 */
const icon = (rows: string[], palette: Record<string, string> = {}): Sprite => ({ rows, palette })

export const ICONS = {
  back: icon(['...k.....', '..kk.....', '.kkkkkkk.', 'kkkkkkkk.', '.kkkkkkk.', '..kk.....', '...k.....', '.........', '.........']),
  close: icon(['kk.....kk', 'kkk...kkk', '.kkk.kkk.', '..kkkkk..', '...kkk...', '..kkkkk..', '.kkk.kkk.', 'kkk...kkk', 'kk.....kk']),
  chat: icon(
    ['.kkkkkkk.', 'kwwwwwwwk', 'kwkwkwkwk', 'kwwwwwwwk', 'kwwwwwwwk', '.kkkwkkk.', '...kwk...', '...kk....', '.........'],
  ),
  bell: icon(
    ['....k....', '...kyk...', '..kyyyk..', '..kyyyk..', '.kyyyyyk.', '.kyyyyyk.', 'kkkkkkkkk', '...kyk...', '....k....'],
    { y: '#ffd94a' },
  ),
  crown: icon(
    ['.........', 'k...k...k', 'kk.kyk.kk', 'kykyyykyk', 'kyyyyyyyk', 'kyryyyryk', 'kyyyyyyyk', 'kkkkkkkkk', '.........'],
    { y: '#ffd94a', r: '#e8553a' },
  ),
  people: icon(
    ['.kk...kk.', 'kssk.kssk', 'kssk.kssk', '.kk...kk.', 'kppk.kbbk', 'kppk.kbbk', 'kppk.kbbk', 'kkkk.kkkk', '.........'],
    { s: '#ffe0cc', p: '#ff8fb8', b: '#6a8cff' },
  ),
  paint: icon(
    ['......kk.', '.....kyyk', '....kyyk.', '...kyyk..', '..kbbk...', '.kbbbk...', 'kbbbk....', 'kkkk.....', '.........'],
    { y: '#c98a4b', b: '#ff8fb8' },
  ),
  link: icon(
    ['.........', '.kkk.....', 'k...k....', 'k..kkkk..', 'k..k..k..', '.kkkk..k.', '....k...k', '.....kkk.', '.........'],
  ),
  dice: icon(
    ['kkkkkkkkk', 'kwwwwwwwk', 'kwkwwwwwk', 'kwwwwwwwk', 'kwwwkwwwk', 'kwwwwwwwk', 'kwwwwwkwk', 'kwwwwwwwk', 'kkkkkkkkk'],
  ),
  send: icon(
    ['k........', 'kkk......', 'kwwkk....', 'kwwwwkk..', 'kwwwwwwkk', 'kwwwwkk..', 'kwwkk....', 'kkk......', 'k........'],
  ),
  undo: icon(
    ['...k.....', '..kk.....', '.kkkkkk..', '..kk...k.', '...k....k', '........k', '.......k.', '..kkkkk..', '.........'],
  ),
  mask: icon(
    ['..kkkkk..', '.kgggggk.', 'kgggggggk', 'kkkkkkkkk', 'kkwkkkwkk', 'kgggggggk', '.kgggggk.', '..kkkkk..', '.........'],
    { g: '#4b4458' },
  ),
} satisfies Record<string, Sprite>

export type IconId = keyof typeof ICONS
