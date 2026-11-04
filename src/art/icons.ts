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
  /** 아이폰 공유 버튼 */
  share: icon(['....k....', '...kkk...', '..k.k.k..', '....k....', 'kk..k..kk', 'k.......k', 'k.......k', 'k.......k', 'kkkkkkkkk']),
  /** 홈 화면에 추가 */
  addbox: icon(['kkkkkkkkk', 'k.......k', 'k...k...k', 'k...k...k', 'k.kkkkk.k', 'k...k...k', 'k...k...k', 'k.......k', 'kkkkkkkkk']),
  mask: icon(
    ['..kkkkk..', '.kgggggk.', 'kgggggggk', 'kkkkkkkkk', 'kkwkkkwkk', 'kgggggggk', '.kgggggk.', '..kkkkk..', '.........'],
    { g: '#4b4458' },
  ),
  menu: icon(['.........', 'kkkkkkkkk', 'kkkkkkkkk', '.........', 'kkkkkkkkk', 'kkkkkkkkk', '.........', 'kkkkkkkkk', 'kkkkkkkkk']),
  /** 방명록 */
  book: icon(['.kkk.kkk.', 'kwwwkwwwk', 'kwkkkkkwk', 'kwwwkwwwk', 'kwkkkkkwk', 'kwwwkwwwk', 'kkkkkkkkk', '....k....', '.........']),
  /** 스토리 이미지 */
  camera: icon(['..kkk....', 'kkkkkkkkk', 'kwwkkkwwk', 'kwkwwwkwk', 'kwkwwwkwk', 'kwwkkkwwk', 'kwwwwwwwk', 'kkkkkkkkk', '.........']),
  /** 오늘의 한마디 */
  note: icon(['kkkkkkkk.', 'kwwwwwwk.', 'kwkkkkwk.', 'kwwwwwwk.', 'kwkkkwwk.', 'kwwwwwwk.', 'kwkkkkwk.', 'kwwwwwwk.', 'kkkkkkkk.']),
  /** 친구 눈으로 보기 */
  eye: icon(['.........', '..kkkkk..', '.kwwwwwk.', 'kwwkkkwwk', 'kwwkkkwwk', 'kwwkkkwwk', '.kwwwwwk.', '..kkkkk..', '.........']),
  /** 새 링크 */
  refresh: icon(['..kkkk.k.', '.k....kk.', 'k....kkk.', 'k........', 'k.......k', '........k', '.kkk....k', '.kk....k.', '.k.kkkk..']),
  /** 방 삭제 (빨간색) */
  trash: icon(['...kkk...', 'kkkkkkkkk', '.........', '.kkkkkkk.', '.kwkwkwk.', '.kwkwkwk.', '.kwkwkwk.', '.kwkwkwk.', '..kkkkk..'], { k: '#e8384f' }),
  home: icon(['....k....', '...kkk...', '..kwwwk..', '.kwwwwwk.', 'kkwwwwwkk', '.kwwwwwk.', '.kwkkkwk.', '.kwkwkwk.', '.kkkkkkk.']),
  /** 타이머·알람 */
  clock: icon(['..kkkkk..', '.kwwwwwk.', 'kwwwkwwwk', 'kwwwkwwwk', 'kwwwkkkwk', 'kwwwwwwwk', 'kwwwwwwwk', '.kwwwwwk.', '..kkkkk..']),
  /** 배경음악 켜짐 */
  music: icon(['...kkkkkk', '...kkkkkk', '...k....k', '...k....k', '...k....k', '.kkk..kkk', 'kkkk.kkkk', 'kkkk.kkkk', '.kk...kk.']),
  /** 배경음악 꺼짐 */
  mute: icon(
    ['...kkkkkr', '...kkkkr.', '...k..r.k', '...k.r..k', '...kr...k', '.kkr..kkk', 'kkrk.kkkk', 'krkk.kkkk', 'r.k...kk.'],
    { r: '#e8384f' },
  ),
} satisfies Record<string, Sprite>

export type IconId = keyof typeof ICONS
