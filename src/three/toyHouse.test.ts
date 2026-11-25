import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { HOUSE_D, HOUSE_W } from '../lib/town'
import { bakeStatic, disposeTree } from './kit'
import { buildToyHouseExterior, TOY_HOUSES } from './toyHouse'

describe('toy house integration', () => {
  it('keeps the navigation footprint and a front-facing, clickable door in every theme', () => {
    for (const style of Object.values(TOY_HOUSES)) {
      const glass = new THREE.MeshStandardMaterial()
      const house = buildToyHouseExterior(style, glass, 'home')
      house.updateMatrixWorld(true)
      const wall = new THREE.Box3().setFromObject(house.children[0])
      const size = wall.getSize(new THREE.Vector3())
      expect(size.x).toBeCloseTo(HOUSE_W, 4)
      expect(size.z).toBeCloseTo(HOUSE_D, 4)
      const ray = new THREE.Raycaster(new THREE.Vector3(0, 1.6, 7), new THREE.Vector3(0, 0, -1))
      expect(ray.intersectObject(house, true)[0]?.object.userData.door).toBe('home')
      // Actual World batching must retain picking metadata and substantially reduce draws.
      let before = 0
      house.traverse(n => { if ((n as THREE.Mesh).isMesh) before++ })
      bakeStatic(house);house.updateMatrixWorld(true)
      let after = 0
      house.traverse(n => { if ((n as THREE.Mesh).isMesh) after++ })
      expect(after).toBeLessThan(before / 5)
      expect(ray.intersectObject(house, true)[0]?.object.userData.door).toBe('home')
      const side = new THREE.Raycaster(new THREE.Vector3(7, 1.2, 0), new THREE.Vector3(-1, 0, 0))
      expect(side.intersectObject(house, true)[0]?.object.userData.house).toBe('home')
      disposeTree(house);glass.dispose()
    }
  })
})
