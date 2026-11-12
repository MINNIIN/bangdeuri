// 미니미 품질 점검: 옷·머리 조합을 여러 각도에서 한 화면에 그린다 (배포 안 됨)
import * as THREE from 'three'
import { type AvatarLook, PRESET_LOOKS } from '../src/art/avatar'
import { buildAvatar3D } from '../src/three/avatar3d'

const base = PRESET_LOOKS[0].look
const L = (o: Partial<AvatarLook>): AvatarLook => ({ ...base, ...o })
const q = new URLSearchParams(location.search)
const ALL: AvatarLook[] = [
  L({ hair: 'long', bottom: 'skirt', top: 'tee', bottomColor: '#ff8fb8', hat: 'none' }),
  L({ hair: 'bob', bottom: 'dress', top: 'tee', bottomColor: '#9d8cff', hat: 'none' }),
  L({ hair: 'curly', bottom: 'skirt', top: 'hoodie', bottomColor: '#4a4f8c', hairColor: '#ff8fb8', hat: 'none' }),
  L({ hair: 'bun', bottom: 'dress', top: 'stripe', bottomColor: '#f3e6d6', hairColor: '#f2d16b', hat: 'none' }),
  L({ hair: 'short', bottom: 'pants', top: 'hoodie', hat: 'none' }),
  L({ hair: 'long', bottom: 'skirt', hat: 'cap', hatColor: '#e8553a' }),
  L({ hair: 'bun', bottom: 'dress', hat: 'beanie', hatColor: '#59c26b', hairColor: '#7a4b2e' }),
  L({ hair: 'curly', bottom: 'shorts', hat: 'bear', hatColor: '#b07a4f' }),
  L({ hair: 'short', bottom: 'skirt', hat: 'ribbon', hatColor: '#e8553a' }),
]
// ?grid=hats : 머리 5종 × 모자(cap·beanie·bear) 전부
const HAIRS: AvatarLook['hair'][] = ['bob', 'short', 'long', 'bun', 'curly']
const HATS: AvatarLook['hat'][] = ['cap', 'beanie', 'bear']
const GRID = HATS.flatMap((hat) => HAIRS.map((hair) => L({ hair, hat, hatColor: '#f2d16b', bottom: 'pants' })))
const LOOKS = q.get('grid') === 'hats' ? GRID.filter((_, i) => !q.has('hat') || HATS[Math.floor(i / 5)] === q.get('hat')) : q.has('rows') ? q.get('rows')!.split(',').map((i) => ALL[Number(i)]) : ALL
// 각도: [이름, 방위각, 높이]
const ALLV: [string, number, number][] = [
  ['앞', 0, 0.75],
  ['비스듬', 0.8, 0.75],
  ['옆', Math.PI / 2, 0.75],
  ['뒤', Math.PI, 0.75],
  ['아래서', 0.4, 0.15],
  ['게임 시점', 0.785, 2.6],
]
const VIEWS = q.has('views') ? q.get('views')!.split(',').map((i) => ALLV[Number(i)]) : ALLV
const CELL = Number(q.get('cell') ?? 220)
const W = CELL * VIEWS.length
const H = CELL * LOOKS.length
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(1)
renderer.setSize(W, H)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.setScissorTest(true)
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color('#e9eef6')
scene.add(new THREE.HemisphereLight('#f2f8ff', '#e8c9b0', 1.6))
const sun = new THREE.DirectionalLight('#fff1dc', 2.2)
sun.position.set(2, 4, 3)
scene.add(sun)
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50)
const walk = q.has('walk')

LOOKS.forEach((look, r) => {
  const a = buildAvatar3D(look)
  a.animate({ walking: walk, pose: null, t: Number(q.get("t") ?? 1.7) })
  scene.add(a.root)
  // ?nohat : 모자만 숨겨서 그 아래 머리카락이 어떻게 눌려 있는지 본다
  if (q.has('nohat'))
    a.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (m?.color && '#' + m.color.getHexString() === new THREE.Color(look.hatColor).getHexString().replace(/^/, '#')) o.visible = false
    })
  VIEWS.forEach(([, az, h], c) => {
    const d = 3.2
    camera.position.set(Math.sin(az) * d, h + 0.6, Math.cos(az) * d)
    camera.lookAt(0, 0.6, 0)
    const x = c * CELL
    const y = H - (r + 1) * CELL
    renderer.setViewport(x, y, CELL, CELL)
    renderer.setScissor(x, y, CELL, CELL)
    renderer.render(scene, camera)
  })
  scene.remove(a.root)
  a.dispose()
})
;(window as unknown as { done: boolean }).done = true
