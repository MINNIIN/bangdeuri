/**
 * 가게 3D 모음: 가게 id → 안 · 골목 건물 · 가게 사람 생김새.
 * 새 가게는 three/shop/<id>3d.ts를 만들고 여기 한 줄 더한다.
 */
import type * as THREE from 'three'
import type { AvatarLook } from '../art/avatar'
import type { ShopId } from '../lib/town'
import { buildCvs3D, CLERK_LOOK } from './cvs3d'
import { type PlaceAnims, storeBuilding } from './places3d'
import { ARCADE_ART } from './shop/arcade3d'
import { CAFE_ART } from './shop/cafe3d'
import type { Shop3D, ShopArt } from './shop/common'
import { LAUNDRY_ART } from './shop/laundry3d'
import { PC_ART } from './shop/pc3d'
import { SING_ART } from './shop/sing3d'

export type { Shop3D } from './shop/common'

const ART: Record<ShopId, ShopArt> = {
  cvs: {
    interior: buildCvs3D,
    exterior: storeBuilding,
    npcLook: { ...CLERK_LOOK },
  },
  pc: PC_ART,
  sing: SING_ART,
  arcade: ARCADE_ART,
  laundry: LAUNDRY_ART,
  cafe: CAFE_ART,
}

export const buildShop3D = (id: ShopId): Shop3D => ART[id].interior()
/** 골목 가게 건물 (가운데 x=0, 줄0 자리 기준 · 문을 누르면 들어간다) */
export const shopExterior = (id: ShopId, a: PlaceAnims): THREE.Object3D => ART[id].exterior(a)
export const shopNpcLook = (id: ShopId): AvatarLook | undefined => ART[id].npcLook
