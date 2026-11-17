/**
 * 가게 목록: 골목에서 문을 누르면 들어가는 곳들 (편의점 · PC방 · 코인노래방 · 오락실 · 코인빨래방 · 카페).
 * 가게마다 안 크기 · 막힌 곳 · 누르는 자리 · 가게 사람을 정의(lib/shop/*)에 두고, 여기서 길찾기 지도와 찾기를 해 준다.
 */
import { SHOP_DEFS } from './shop'
import type { ShopDef, ShopSpot } from './shop/types'
import { type AreaId, isShopId, SHOP_IDS, type ShopId, type TownMap } from './town'

export type { ShopDef, ShopNpc, ShopSolid, ShopSpot } from './shop/types'

export const SHOPS: Record<ShopId, ShopDef> = SHOP_DEFS

const PAD = 0.3
const maps = new Map<ShopId, TownMap>()

/** 가게 안 길찾기용 지도 (골목 길찾기를 그대로 쓴다) */
export function shopMap(def: ShopDef): TownMap {
  let m = maps.get(def.id)
  if (!m) {
    m = {
      lots: [],
      props: [],
      bounds: { minX: -def.hw - 0.25, maxX: def.hw + 0.25, minZ: -def.hd - 0.25, maxZ: def.hd + 0.25 },
      blocked: (p) => {
        if (Math.abs(p.x) > def.hw - 0.25 || Math.abs(p.z) > def.hd - 0.25) return true
        return def.solids.some((s) => Math.abs(p.x - s.x) < s.hw + PAD && Math.abs(p.z - s.z) < s.hd + PAD)
      },
    }
    maps.set(def.id, m)
  }
  return m
}

/** 지금 있는 곳이 가게 안이면 그 가게 */
export const shopOfArea = (a: AreaId | string): ShopDef | null => (isShopId(a) ? SHOPS[a] : null)

/** 누름 이름(`<가게id>/…`)이 어느 가게 것인지 */
export function shopOfKey(key: string): ShopDef | null {
  const i = key.indexOf('/')
  if (i < 0) return null
  const id = key.slice(0, i)
  return isShopId(id) ? SHOPS[id] : null
}

/** 누름 이름 → 자리 */
export const shopSpot = (key: string): ShopSpot | null => shopOfKey(key)?.spots.find((s) => s.key === key) ?? null

/** 같은 이름 앞머리를 쓰는 자리들 (cvs/drink → cvs/drink:0, cvs/drink:1) */
export const shopGroup = (base: string): ShopSpot[] =>
  shopOfKey(base)?.spots.filter((s) => s.key === base || s.key.startsWith(base + ':')) ?? []

export { SHOP_IDS }
