// 아이템 품질 점검: 아이템마다 여러 각도에서 한 화면에 (배포 안 됨)
import * as THREE from 'three'
import { buildItem3D } from '../src/three/furniture3d'

const q = new URLSearchParams(location.search)
const ITEMS = (q.get('items') ?? 'roach').split(',')
const DIST = Number(q.get('dist') ?? 1.4)
const LOOK_Y = Number(q.get('y') ?? 0.06)
const VIEWS: [number, number][] = [
  [0.6, 0.35],
  [Math.PI / 2, 0.15],
  [Math.PI, 0.45],
  [0.785, 1.1],
]
const CELL = Number(q.get('cell') ?? 300)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(1)
renderer.setSize(CELL * VIEWS.length, CELL * ITEMS.length)
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
const floor = new THREE.Mesh(new THREE.CircleGeometry(2, 32), new THREE.MeshStandardMaterial({ color: '#f3ead8' }))
floor.rotation.x = -Math.PI / 2
scene.add(floor)
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50)
const H = CELL * ITEMS.length
ITEMS.forEach((id, r) => {
  const o = buildItem3D(id)
  if (!o) return
  scene.add(o)
  VIEWS.forEach(([az, el], c) => {
    camera.position.set(Math.sin(az) * Math.cos(el) * DIST, LOOK_Y + Math.sin(el) * DIST, Math.cos(az) * Math.cos(el) * DIST)
    camera.lookAt(0, LOOK_Y, 0)
    renderer.setViewport(c * CELL, H - (r + 1) * CELL, CELL, CELL)
    renderer.setScissor(c * CELL, H - (r + 1) * CELL, CELL, CELL)
    renderer.render(scene, camera)
  })
  scene.remove(o)
})
;(window as unknown as { done: boolean }).done = true
