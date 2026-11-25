/** Rounded architecture for the live neighbourhood. */
import * as THREE from 'three'
import { HOUSE_D, HOUSE_W } from '../lib/town'
import { cyl, group, mat, part, roundBox as roundedBox, sphere, tint } from './kit'

// Repeated architectural pieces use fewer bevel rings; the outline and smooth shading stay rounded.
const roundBox = (w: number, h: number, d: number, radius = 0.06) => roundedBox(w, h, d, radius, 1)

export interface ToyHouseStyle { wall: string; roof: string; trim: string; door: string }
/** Mounted on the front gable, above the porch and outside the roof's front bevel. */
export const TOY_HOUSE_NAMEPLATE = { width: 2.6, height: 0.65, y: 3.58, frontOffset: 0.47 }
export const TOY_HOUSES: Record<string, ToyHouseStyle> = {
  pink: { wall: '#f6d9df', roof: '#e98f89', trim: '#fff6e9', door: '#b98461' },
  studio: { wall: '#f0e1cc', roof: '#bb8068', trim: '#fff6e9', door: '#986e53' },
  night: { wall: '#dce1f2', roof: '#8a8fbe', trim: '#fff6ed', door: '#707894' },
}

export function toyPlant(color = '#83ae72', flowers = true) {
  const plant = new THREE.Group()
  for (const [x, y, z, r] of [[0, 0.16, 0, 0.18], [-0.15, 0.11, 0.02, 0.13], [0.13, 0.12, -0.02, 0.14]])
    plant.add(part(sphere(r, 12, 8), mat(color), [x, y, z], { scale: [1, 0.85, 0.85] }))
  if (flowers) {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.13
      const y = 0.23 + (i % 2) * 0.07
      for (let k = 0; k < 5; k++) {
        const a = k * Math.PI * 2 / 5
        plant.add(part(sphere(0.035, 6, 4), mat(i % 2 ? '#f4cf83' : '#edb2c5'), [x + Math.cos(a) * 0.04, y + Math.sin(a) * 0.04, 0.12], { shadow: false }))
      }
      plant.add(part(sphere(0.022, 6, 4), mat('#fff1bd'), [x, y, 0.14], { shadow: false }))
    }
  }
  return plant
}

/** A solid gable with broad bevels and rounded tile courses. Ridge runs front to back. */
export function toyRoof(w: number, d: number, h: number, color: string) {
  const root = new THREE.Group()
  const section = new THREE.Shape()
  section.moveTo(-w / 2, 0); section.lineTo(w / 2, 0); section.lineTo(0, h); section.closePath()
  const geo = new THREE.ExtrudeGeometry(section, { depth: d, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.06, bevelSegments: 3, steps: 1 })
  geo.translate(0, 0, -d / 2)
  root.add(part(geo, mat(color)))
  const slope = Math.atan2(h, w / 2)
  const run = Math.hypot(w / 2, h)
  const columns = Math.max(3, Math.round(d / 0.85))
  for (const side of [-1, 1]) {
    for (let row = 0; row < 4; row++) {
      const u = (row + 0.5) / 4
      for (let column = 0; column < columns; column++) {
        root.add(part(roundBox(run / 4 + 0.07, 0.12, d / columns - 0.025, 0.055), mat(tint(color, (row + column) % 3 === 0 ? 0.025 : 0)),
          [side * (1 - u) * w / 2, h * u + 0.075, -d / 2 + (column + 0.5) * d / columns], { rot: [0, 0, -side * slope] }))
      }
    }
  }
  for (let i = 0; i < columns; i++) root.add(part(cyl(0.16, 0.16, d / columns + 0.035, 14), mat(tint(color, 0.035)), [0, h + 0.06, -d / 2 + (i + 0.5) * d / columns], { rot: [Math.PI / 2, 0, 0] }))
  for (const z of [-d / 2 - 0.06, d / 2 + 0.06])
    for (const side of [-1, 1]) root.add(part(roundBox(run + 0.1, 0.16, 0.16, 0.06), mat(tint(color, -0.075)), [side * w / 4, h / 2, z], { rot: [0, 0, -side * slope] }))
  return root
}

function toyWindow(style: ToyHouseStyle, glass: THREE.Material, flowerBox = true) {
  const trim = mat(style.trim)
  const frame = group(
    part(roundBox(1.28, 1.2, 0.2, 0.11), trim),
    part(roundBox(1.04, 0.96, 0.13, 0.065), glass, [0, 0, 0.12]),
    part(roundBox(0.065, 1.0, 0.1, 0.027), trim, [0, 0, 0.21]),
    part(roundBox(1.08, 0.065, 0.1, 0.027), trim, [0, 0, 0.21]),
    part(roundBox(1.48, 0.14, 0.38, 0.06), trim, [0, -0.65, 0.1]),
  )
  if (flowerBox) {
    frame.add(part(roundBox(1.02, 0.19, 0.26, 0.065), mat(tint(style.door, 0.12)), [0, -0.76, 0.12]))
    for (const x of [-0.32, 0, 0.32]) { const plant = toyPlant(); plant.position.set(x, -0.67, 0.19); plant.scale.setScalar(0.75); frame.add(plant) }
  }
  return frame
}

/** Dimensions and doorway stay compatible with the existing navigation footprint. */
export function buildToyHouseExterior(style: ToyHouseStyle, glass: THREE.Material, roomId = 'studio') {
  const house = new THREE.Group()
  // Leave static group names empty so the neighbourhood batcher can merge them.
  house.userData.artStyle = 'rounded-toy-v1'
  const wallH = 2.9, front = HOUSE_D / 2
  house.add(part(roundBox(HOUSE_W, wallH, HOUSE_D, 0.17), mat(style.wall), [0, wallH / 2, 0]))
  house.add(part(roundBox(HOUSE_W + 0.12, 0.28, HOUSE_D + 0.12, 0.09), mat(tint(style.wall, -0.12)), [0, 0.14, 0]))
  const roof = toyRoof(HOUSE_W + 0.62, HOUSE_D + 0.68, 1.88, style.roof)
  roof.position.y = wallH; house.add(roof)
  for (const x of [-HOUSE_W / 2 + 0.1, HOUSE_W / 2 - 0.1])
    house.add(part(roundBox(0.18, wallH - 0.1, 0.18, 0.055), mat(style.trim), [x, wallH / 2, front + 0.015]))
  const chimney = group(
    part(roundBox(0.62, 1.03, 0.62, 0.07), mat(tint(style.wall, -0.06)), [0, 0.5, 0]),
    part(roundBox(0.78, 0.16, 0.78, 0.06), mat(style.trim), [0, 1.0, 0]),
    part(roundBox(0.38, 0.025, 0.38, 0.04), mat('#84796d'), [0, 1.09, 0]),
  )
  chimney.position.set(-2.0, 3.55, -1.5); house.add(chimney)
  const door = group(
    part(roundBox(1.48, 2.24, 0.22, 0.14), mat(style.trim), [0, 1.15, 0]),
    part(roundBox(1.18, 2.02, 0.16, 0.13), mat(style.door), [0, 1.08, 0.13]),
    part(roundBox(0.82, 0.64, 0.06, 0.06), mat(tint(style.door, -0.07)), [0, 0.64, 0.24]),
    part(roundBox(0.58, 0.58, 0.07, 0.06), glass, [0, 1.6, 0.24]),
    part(roundBox(0.045, 0.62, 0.08, 0.018), mat(style.trim), [0, 1.6, 0.29]),
    part(roundBox(0.61, 0.045, 0.08, 0.018), mat(style.trim), [0, 1.6, 0.29]),
    part(sphere(0.06, 12, 10), mat('#d8b36c', { metal: 0.35, rough: 0.36 }), [0.4, 1.05, 0.27]),
    part(roundBox(1.95, 0.16, 0.85, 0.07), mat('#d9bca2'), [0, 0.08, 0.4]),
    part(roundBox(1.0, 0.025, 0.4, 0.06), mat('#b7c7a6'), [0, 0.17, 0.44]),
  )
  door.position.z = front + 0.06
  door.traverse(n => { n.userData.door = roomId }); house.add(door)
  const porchRoof = toyRoof(2.2, 1.1, 0.56, style.roof)
  porchRoof.position.set(0, 2.45, front + 0.36); house.add(porchRoof)
  for (const x of [-2.3, 2.3]) {
    const win = toyWindow(style, glass);win.position.set(x, 1.65, front + 0.05);house.add(win)
  }
  for (const side of [-1, 1]) {
    const win = toyWindow(style, glass, false)
    win.rotation.y = side * Math.PI / 2;win.position.set(side * (HOUSE_W / 2 + 0.04), 1.7, -0.35);house.add(win)
  }
  house.traverse(n => { if (!n.userData.door) n.userData.house = roomId })
  return house
}
