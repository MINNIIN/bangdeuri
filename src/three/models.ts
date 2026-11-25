/**
 * Blender로 만든 모델(public/models/*.glb)을 미리 불러 두고, 빌더가 동기로 복제해 쓴다.
 *
 * - 앱이 뜰 때 preloadModels()를 한 번 부른다. 다 불러오기 전에 지은 장면은 예전 코드 도형을 쓴다 (model()이 null).
 * - GLB 단색 재질은 kit.mat()의 공용 재질로 바꾼다 → bakeStatic이 다른 도형과 한 덩어리로 합칠 수 있다.
 * - 재질 이름 = tools/blender/lib.py의 팔레트 이름. recolor로 이름별 색·재질을 바꿔 끼운다 (예: 의자 강조색, 화면 그림).
 * - 앱에서 따로 움직이거나 바꾸는 메시(KEEP_NAMES)만 이름을 남기고, 나머지 이름은 지운다 (bakeStatic은 이름 있는 메시를 안 합친다).
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mat } from './kit'

/** PC room equipment still uses GLB; home furniture now shares the rounded toy builders. */
export const MODEL_NAMES = ['pc/chair', 'pc/monitor', 'pc/tower', 'pc/keyboard'] as const
export type ModelName = (typeof MODEL_NAMES)[number]

/** 앱에서 이름으로 찾아 재질을 바꾸는 메시 */
const KEEP_NAMES = new Set(['screen', 'rgb'])

const templates = new Map<ModelName, THREE.Object3D>()
let loading: Promise<void> | null = null

function prepare(root: THREE.Object3D) {
  root.traverse((n) => {
    const mesh = n as THREE.Mesh
    if (mesh.isMesh) {
      // 재질 이름(팔레트 이름)은 메시에 적어 둔다.
      // 단색 재질은 같은 색의 공용 재질로 (bakeStatic이 다른 도형과 합칠 수 있게), 팔레트 그림이 붙은 재질(KayKit)은 그대로
      const src = mesh.material as THREE.MeshStandardMaterial
      mesh.userData.paint = src.name
      if (src.map) {
        src.roughness = 0.8
        src.metalness = 0
      } else mesh.material = mat(`#${src.color.getHexString()}`)
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
    // 재질이 하나뿐인 glTF 노드는 이름 붙은 Mesh 하나로 들어온다 → 그 이름만 남긴다
    if (!(mesh.isMesh && KEEP_NAMES.has(n.name))) n.name = ''
  })
  return root
}

/** 모든 모델을 한 번만 불러온다 (실패한 모델은 건너뛰고 예전 도형을 쓴다) */
export function preloadModels(base: string = import.meta.env.BASE_URL ?? '/'): Promise<void> {
  if (loading) return loading
  const loader = new GLTFLoader()
  loading = Promise.all(
    MODEL_NAMES.map((name) =>
      loader
        .loadAsync(`${base}models/${name}.glb`)
        .then((g) => {
          templates.set(name, prepare(g.scene))
        })
        .catch((e) => {
          console.warn('[models] 불러오지 못함', name, e)
        }),
    ),
  ).then(() => undefined)
  return loading
}

export const modelsReady = () => templates.size > 0

export interface ModelOpts {
  /** 팔레트 이름 → 바꿔 낄 재질 (예: { accent: mat('#3fb6ff') }) */
  paint?: Record<string, THREE.Material>
  /** 메시 이름(KEEP_NAMES) → 바꿔 낄 재질 (예: { screen: 화면 그림 재질 }) */
  named?: Record<string, THREE.Material>
  at?: [number, number, number]
  yaw?: number
  shadow?: boolean
}

/** 모델 하나 복제 (아직 못 불러왔으면 null → 호출한 쪽이 예전 도형을 그린다) */
export function model(name: ModelName, o: ModelOpts = {}): THREE.Object3D | null {
  const t = templates.get(name)
  if (!t) return null
  const c = t.clone(true)
  c.traverse((n) => {
    const mesh = n as THREE.Mesh
    if (!mesh.isMesh) return
    const byName = o.named?.[mesh.name]
    const byPaint = o.paint?.[mesh.userData.paint as string]
    if (byName) mesh.material = byName
    else if (byPaint) mesh.material = byPaint
    if (o.shadow === false) mesh.castShadow = false
    // 재질을 다 바꿨으면 이름은 필요 없다 → bakeStatic이 다른 도형과 합칠 수 있게 지운다
    mesh.name = ''
  })
  if (o.at) c.position.set(...o.at)
  if (o.yaw) c.rotation.y = o.yaw
  return c
}
