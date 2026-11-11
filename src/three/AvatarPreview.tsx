/**
 * 미니미 만들기 미리보기: 3D 미니미가 작은 받침 위에서 천천히 돌아간다. 끌면 직접 돌려 볼 수 있다.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { AvatarLook } from '../art/avatar'
import { type Avatar3D, buildAvatar3D } from './avatar3d'
import { cyl, mat, part } from './kit'

export default function AvatarPreview({ look, size = 170 }: { look: AvatarLook; size?: number }) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ setLook: (l: AvatarLook) => void } | null>(null)

  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(size, size)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.shadowMap.enabled = true
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
    camera.position.set(0, 1.25, 3.6)
    camera.lookAt(0, 0.62, 0)
    scene.add(new THREE.HemisphereLight('#f2f8ff', '#e8c9b0', 1.6))
    const sun = new THREE.DirectionalLight('#fff1dc', 2.2)
    sun.position.set(2, 4, 3)
    sun.castShadow = true
    sun.shadow.mapSize.set(512, 512)
    scene.add(sun)
    const base = part(cyl(0.62, 0.66, 0.08, 40), mat('#fff3b0', { rough: 0.6 }), [0, -0.04, 0])
    base.castShadow = false
    scene.add(base)

    let avatar: Avatar3D | null = null
    let spin = 0
    let drag: { x: number; spin: number } | null = null
    const setLook = (l: AvatarLook) => {
      if (avatar) {
        scene.remove(avatar.root)
        avatar.dispose()
      }
      avatar = buildAvatar3D(l)
      scene.add(avatar.root)
    }
    api.current = { setLook }
    setLook(look)

    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, spin }
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (drag) spin = drag.spin + (e.clientX - drag.x) * 0.02
    }
    const up = () => (drag = null)
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)

    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = performance.now()
    const t0 = last
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!drag && !still) spin += dt * 0.45
      if (avatar) {
        avatar.root.rotation.y = spin
        avatar.animate({ walking: false, pose: null, t: (now - t0) / 1000 })
      }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      avatar?.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      api.current = null
    }
    // 겉모습이 바뀌면 아래에서 미니미만 바꾼다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  useEffect(() => {
    api.current?.setLook(look)
  }, [look])

  return <div ref={host} className="avatar-3d" style={{ width: size, height: size }} aria-label="내 미니미 3D 미리보기" role="img" />
}
