import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { HOUSE_D, HOUSE_W } from '../lib/town'
import { bakeStatic, disposeTree } from './kit'
import { buildToyHouseExterior, TOY_HOUSES, TOY_HOUSE_NAMEPLATE } from './toyHouse'

describe('toy house integration', () => {
  it('keeps the gable nameplate in front of the roof and porch at the supported viewing angles', () => {
    const glass = new THREE.MeshStandardMaterial()
    const house = buildToyHouseExterior(TOY_HOUSES.pink, glass)
    const plate = TOY_HOUSE_NAMEPLATE
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(plate.width, plate.height), new THREE.MeshBasicMaterial())
    sign.name = 'houseNameplate'
    sign.position.set(0, plate.y, HOUSE_D / 2 + plate.frontOffset)
    house.add(sign)
    bakeStatic(house);house.updateMatrixWorld(true)
    for (const yaw of [-Math.PI / 6, 0, Math.PI / 6]) {
      for (const pitch of [0.55, 0.9, 1.15]) {
        for (const x of [-plate.width * 0.4, 0, plate.width * 0.4]) {
          const target = sign.position.clone().add(new THREE.Vector3(x, -plate.height * 0.3, 0))
          const offset = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(12)
          const ray = new THREE.Raycaster(target.clone().add(offset), offset.clone().negate().normalize())
          expect(ray.intersectObject(house, true)[0]?.object).toBe(sign)
        }
      }
    }
    disposeTree(house);glass.dispose()
  })
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
