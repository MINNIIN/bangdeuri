/**
 * 홍보 영상 출연진: 단톡방 프사와 방 안 미니미가 같은 모습이어야 한다 ("단톡 친구 = 방에 들어온 미니미").
 * 방 장면을 찍을 때도 이 이름·모습으로 들어간다. 전부 가상 인물.
 */
import type { AvatarLook } from '../src/art/avatar'

export interface CastMember {
  name: string
  look: AvatarLook
}

const look = (l: Partial<AvatarLook>): AvatarLook => ({
  hair: 'bob',
  hairColor: '#3b2b3f',
  skin: '#ffe0cc',
  eyes: 'round',
  top: 'tee',
  topColor: '#ff8fb8',
  bottom: 'skirt',
  bottomColor: '#6a8cff',
  hat: 'none',
  hatColor: '#ffd94a',
  ...l,
})

/** 방 주인 (영상 속 '나') */
export const OWNER: CastMember = {
  name: '민트',
  look: look({ hair: 'bob', hairColor: '#3b2b3f', eyes: 'smile', top: 'tee', topColor: '#6fd6b8', bottom: 'skirt', bottomColor: '#4a4f8c', hat: 'pin', hatColor: '#ff8fb8' }),
}

export const FRIENDS: CastMember[] = [
  { name: '지윤', look: look({ hair: 'long', hairColor: '#7a4b2e', eyes: 'round', top: 'stripe', topColor: '#ff8fb8', bottom: 'dress', bottomColor: '#f3e6d6', hat: 'ribbon', hatColor: '#e8553a' }) },
  { name: '하린', look: look({ hair: 'bun', hairColor: '#f2d16b', eyes: 'wink', top: 'hoodie', topColor: '#ffd94a', bottom: 'shorts', bottomColor: '#6a8cff', hat: 'none' }) },
  { name: '도윤', look: look({ hair: 'short', hairColor: '#3b2b3f', eyes: 'dot', top: 'hoodie', topColor: '#6a8cff', bottom: 'pants', bottomColor: '#4b4458', hat: 'cap', hatColor: '#e8553a' }) },
  { name: '서아', look: look({ hair: 'curly', hairColor: '#ff8fb8', eyes: 'smile', top: 'tee', topColor: '#9d8cff', bottom: 'skirt', bottomColor: '#4a4f8c', hat: 'none' }) },
  { name: '준', look: look({ hair: 'short', hairColor: '#7a4b2e', eyes: 'shades', top: 'tee', topColor: '#4b4458', bottom: 'pants', bottomColor: '#4a4f8c', hat: 'beanie', hatColor: '#59c26b' }) },
  { name: '나은', look: look({ hair: 'short', hairColor: '#7a4b2e', eyes: 'smile', top: 'hoodie', topColor: '#f3e6d6', bottom: 'pants', bottomColor: '#b07a4f', hat: 'bear', hatColor: '#b07a4f' }) },
]
