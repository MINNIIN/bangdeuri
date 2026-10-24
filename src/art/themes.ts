import type { ThemeId } from '../lib/types'

export interface ThemeDef {
  id: ThemeId
  name: string
  desc: string
  wallL: string
  wallR: string
  wallMark: string
  floorA: string
  floorB: string
  slab: string
  slabDark: string
  wallPattern: 'hearts' | 'stripes' | 'stars'
  floorPattern: 'checker' | 'planks' | 'rug'
  /** 공유 이미지·화면 바탕색 */
  sky: string
}

export const THEMES: ThemeDef[] = [
  {
    id: 'pink',
    name: '핑크 하트방',
    desc: '하트 벽지에 체크 타일',
    wallL: '#ffd6e6',
    wallR: '#ffc2da',
    wallMark: '#ff9cc0',
    floorA: '#fff3f8',
    floorB: '#ffd9e8',
    slab: '#f2a7c3',
    slabDark: '#d9809f',
    wallPattern: 'hearts',
    floorPattern: 'checker',
    sky: '#ffe8f1',
  },
  {
    id: 'studio',
    name: '원룸 자취방',
    desc: '줄무늬 벽지에 나무 바닥',
    wallL: '#f6eedd',
    wallR: '#ece0c8',
    wallMark: '#e3d3b2',
    floorA: '#dcaa72',
    floorB: '#c9935b',
    slab: '#a87445',
    slabDark: '#8a5d36',
    wallPattern: 'stripes',
    floorPattern: 'planks',
    sky: '#fbf3e4',
  },
  {
    id: 'night',
    name: '밤하늘 다락방',
    desc: '별 벽지에 폭신한 러그',
    wallL: '#3a4178',
    wallR: '#2f3566',
    wallMark: '#fff3b0',
    floorA: '#4a4f8c',
    floorB: '#9d8cff',
    slab: '#2a2e5c',
    slabDark: '#1e2147',
    wallPattern: 'stars',
    floorPattern: 'rug',
    sky: '#e3e4ff',
  },
]

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0]
