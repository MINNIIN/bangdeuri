/** 가게 정의 모음 (값은 이 폴더 파일들 · 편의점은 lib/cvs.ts) */
import { CVS_SHOP } from '../cvs'
import type { ShopId } from '../town'
import { ARCADE_SHOP } from './arcade'
import { CAFE_SHOP } from './cafe'
import { LAUNDRY_SHOP } from './laundry'
import { PC_SHOP } from './pc'
import { SING_SHOP } from './sing'
import type { ShopDef } from './types'

export const SHOP_DEFS: Record<ShopId, ShopDef> = {
  cvs: CVS_SHOP,
  pc: PC_SHOP,
  sing: SING_SHOP,
  arcade: ARCADE_SHOP,
  laundry: LAUNDRY_SHOP,
  cafe: CAFE_SHOP,
}
