/**
 * 게임 캐릭터 미니미를 사진처럼 찍어 그림 주소(data URL)로 돌려준다 — 목록·채팅·프로필의 작은 미니미 얼굴.
 *
 * - 렌더러 하나를 같이 쓰고, 같은 겉모습·크기는 한 번만 찍는다.
 * - 찍을 수 없으면(WebGL 없음, 모델 못 불러옴) null → 부르는 쪽이 예전 도트 미니미를 그린다.
 */
import * as THREE from 'three'
import type { AvatarLook } from '../art/avatar'
import { buildKenneyAvatar, preloadAvatars } from './kenneyAvatar'

export type PortraitFrame = 'full' | 'bust'

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let broken = false
const cache = new Map<string, string>()
let queue: Promise<unknown> = Promise.resolve()

export const portraitKey = (look: AvatarLook, px: number, frame: PortraitFrame) => `${JSON.stringify(look)}|${px}|${frame}`

/** 이미 찍어 둔 그림 (없으면 undefined) */
export const cachedPortrait = (key: string) => cache.get(key)

function setup() {
  if (renderer || broken) return !broken
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  } catch {
    broken = true
    return false
  }
  renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.setClearColor(0x000000, 0)
  scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#f2f8ff', '#e8c9b0', 1.7))
  const sun = new THREE.DirectionalLight('#fff1dc', 2.2)
  sun.position.set(2, 4, 3)
  scene.add(sun)
  camera = new THREE.PerspectiveCamera(22, 1, 0.1, 50)
  return true
}

function shoot(look: AvatarLook, px: number, frame: PortraitFrame) {
  const a = buildKenneyAvatar(look, 0)
  if (!a || !renderer || !scene || !camera) return null
  a.animate({ walking: false, pose: null, t: 0 })
  scene.add(a.root)
  // 살짝 오른쪽 위에서. 전신은 모자까지, 상반신은 머리·어깨만
  const h = a.height
  const look0 = frame === 'bust' ? h * 0.74 : h * 0.47
  const span = frame === 'bust' ? h * 0.42 : h * 0.6
  const dist = span / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const az = 0.38
  camera.position.set(Math.sin(az) * dist, look0 + dist * 0.18, Math.cos(az) * dist)
  camera.lookAt(0, look0, 0)
  renderer.setSize(px, px, false)
  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL('image/png')
  scene.remove(a.root)
  a.dispose()
  return url
}

/** 미니미 그림 주소. 차례로 하나씩 찍는다 (목록에 미니미가 많아도 렌더러 하나로) */
export function avatarPortrait(look: AvatarLook, px: number, frame: PortraitFrame = 'full'): Promise<string | null> {
  const key = portraitKey(look, px, frame)
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  const job = queue.then(async () => {
    const again = cache.get(key)
    if (again) return again
    if (!setup()) return null
    await preloadAvatars()
    try {
      const url = shoot(look, px, frame)
      if (url) cache.set(key, url)
      return url
    } catch {
      return null
    }
  })
  queue = job.catch(() => null)
  return job
}
