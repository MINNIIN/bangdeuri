/**
 * 카페 음료 컵: 아이스는 투명 컵 + 얼음 + 빨대, 따뜻한 건 머그 + 라떼 아트 · 크림 · 거품.
 * 채운 양 · 색 · 시럽 · 얼음 · 위 장식을 바꿀 수 있다 (바리스타가 만드는 동안 조금씩 차오른다).
 */
import * as THREE from 'three'
import { canvasTexture, cyl, mat, part, sphere, torus } from './kit'

export const CUP_H = 0.17

export interface CupLook {
  fill: number
  color: string
  syrup: number
  syrupColor: string
  ice: boolean
  top?: 'art' | 'cream' | 'foam'
}

export interface Cup3D {
  group: THREE.Group
  set(l: CupLook): void
  dispose(): void
}

let artTex: THREE.Texture | null = null
/** 라떼 아트 하트 (모든 컵이 같이 쓴다) */
function latteArt() {
  if (artTex) return artTex
  artTex = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#c89a6c'
    ctx.fillRect(0, 0, 128, 128)
    const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64)
    g.addColorStop(0, 'rgba(160,110,70,0)')
    g.addColorStop(1, 'rgba(120,70,40,0.6)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
    // 하트 (우유 거품)
    ctx.fillStyle = '#fff6ea'
    ctx.beginPath()
    ctx.moveTo(64, 98)
    ctx.bezierCurveTo(20, 70, 26, 34, 50, 36)
    ctx.bezierCurveTo(58, 37, 63, 44, 64, 50)
    ctx.bezierCurveTo(65, 44, 70, 37, 78, 36)
    ctx.bezierCurveTo(102, 34, 108, 70, 64, 98)
    ctx.fill()
    ctx.strokeStyle = '#d9b08a'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(64, 30)
    ctx.lineTo(64, 100)
    ctx.stroke()
  })
  return artTex
}

export function buildCup(iced: boolean): Cup3D {
  const g = new THREE.Group()
  const owned: { dispose(): void }[] = []
  const H = CUP_H
  const rTop = iced ? 0.07 : 0.068
  const rBot = iced ? 0.052 : 0.06
  // 음료 (바닥이 0인 원기둥을 높이로 늘인다)
  const liquidMat = new THREE.MeshStandardMaterial({ color: '#5a3320', roughness: 0.25 })
  const syrupMat = new THREE.MeshStandardMaterial({ color: '#ff4f6d', roughness: 0.3 })
  owned.push(liquidMat, syrupMat)
  const unit = new THREE.CylinderGeometry(rTop * 0.92, rBot * 0.92, 1, 20)
  unit.translate(0, 0.5, 0)
  owned.push(unit)
  const liquid = new THREE.Mesh(unit, liquidMat)
  liquid.position.y = 0.008
  const syrup = new THREE.Mesh(unit, syrupMat)
  syrup.position.y = 0.007
  g.add(liquid, syrup)
  // 위 장식
  const topY = new THREE.Group()
  g.add(topY)
  const artMat = new THREE.MeshStandardMaterial({ map: latteArt(), roughness: 0.6 })
  owned.push(artMat)
  const art = new THREE.Mesh(new THREE.CircleGeometry(rTop * 0.9, 24), artMat)
  art.rotation.x = -Math.PI / 2
  owned.push(art.geometry)
  const foam = new THREE.Mesh(new THREE.CircleGeometry(rTop * 0.9, 24), mat('#d9b08a', { rough: 0.8 }))
  foam.rotation.x = -Math.PI / 2
  owned.push(foam.geometry)
  const cream = new THREE.Group()
  const creamMat = mat('#fffaf2', { rough: 0.7 })
  for (let i = 0; i < 3; i++) cream.add(part(sphere(0.055 - i * 0.015, 14, 10), creamMat, [0, 0.015 + i * 0.03, 0], { scale: [1, 0.7, 1], shadow: false }))
  topY.add(art, foam, cream)
  // 얼음 (위쪽에 동동)
  const ice = new THREE.Group()
  const iceMat = new THREE.MeshStandardMaterial({ color: '#eaf8ff', roughness: 0.1, transparent: true, opacity: 0.75 })
  owned.push(iceMat)
  for (const [x, z, r] of [
    [0.025, 0.012, 0.3],
    [-0.022, 0.02, 1.1],
    [0.0, -0.028, 0.7],
    [-0.02, -0.01, 2.0],
  ] as const) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.03, 0.034), iceMat)
    owned.push(c.geometry)
    c.position.set(x, 0, z)
    c.rotation.set(r, r * 0.7, 0)
    ice.add(c)
  }
  g.add(ice)

  if (iced) {
    // 투명 플라스틱 컵 · 뚜껑 · 빨대
    const cupMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    owned.push(cupMat)
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, H, 24, 1, true), cupMat)
    owned.push(shell.geometry)
    shell.position.y = H / 2
    shell.renderOrder = 2
    g.add(shell)
    g.add(part(cyl(rBot, rBot, 0.006, 20), cupMat, [0, 0.003, 0], { shadow: false }))
    g.add(part(cyl(rTop + 0.006, rTop + 0.006, 0.012, 24), mat('#ffffff', { opacity: 0.55 }), [0, H + 0.004, 0], { shadow: false }))
    g.add(part(cyl(0.008, 0.008, 0.2, 8), mat('#ff5fa2'), [0.018, H + 0.02, 0], { rot: [0, 0, -0.18] }))
  } else {
    // 하얀 머그 + 손잡이 + 받침 줄
    const mug = mat('#fffaf2', { rough: 0.35 })
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, H, 24, 1, true), mug)
    owned.push(shell.geometry)
    shell.position.y = H / 2
    g.add(shell)
    g.add(part(cyl(rBot, rBot, 0.01, 20), mug, [0, 0.005, 0]))
    g.add(part(torus(0.04, 0.011), mug, [rTop + 0.02, H * 0.55, 0], { rot: [0, 0, Math.PI / 2], scale: [1, 1.15, 1] }))
    g.add(part(cyl(rTop * 1.004, rTop * 1.004, 0.02, 24), mat('#c98f5a', { rough: 0.5 }), [0, H * 0.78, 0], { shadow: false }))
  }

  const set = (l: CupLook) => {
    const f = Math.max(0, Math.min(1, l.fill))
    const sy = Math.min(f, Math.max(0, l.syrup))
    liquid.visible = f > 0.01
    liquid.scale.y = Math.max(0.001, f * (H - 0.012))
    liquidMat.color.set(l.color)
    syrup.visible = sy > 0.01
    syrup.scale.set(1.01, Math.max(0.001, sy * (H - 0.012)), 1.01)
    syrupMat.color.set(l.syrupColor)
    const y = 0.008 + f * (H - 0.012)
    topY.position.y = y + 0.002
    // 차오르는 동안 위 지름은 컵 모양을 따라 넓어진다
    const r = (rBot + (rTop - rBot) * f) / rTop
    topY.scale.set(r, 1, r)
    art.visible = l.top === 'art' && f > 0.5
    foam.visible = l.top === 'foam' && f > 0.5
    cream.visible = l.top === 'cream' && f > 0.5
    ice.visible = l.ice
    ice.position.y = Math.max(0.03, y - 0.02)
  }
  set({ fill: 0, color: '#5a3320', syrup: 0, syrupColor: '#ff4f6d', ice: false })
  g.traverse((n) => {
    if ((n as THREE.Mesh).isMesh) n.castShadow = false
  })
  return {
    group: g,
    set,
    // kit의 모양·재질(cyl · mat …)은 여럿이 같이 쓰므로 버리지 않는다 — 이 컵만의 것만
    dispose: () => owned.forEach((o) => o.dispose()),
  }
}
