/**
 * 머리 위·가구 위로 떠오르는 효과 (하트·음표·Zzz·거품·김·반짝이·꽃가루 …).
 * 캔버스에 그린 작은 그림을 빌보드(늘 카메라를 보는 판)로 띄우고, 올라가며 사라지게 한다.
 */
import * as THREE from 'three'
import type { Fx } from '../lib/interactions'

type Glyph = { text: string; color: string; size?: number; font?: string }

const GLYPHS: Partial<Record<Fx, Glyph[]>> = {
  hearts: [{ text: '♥', color: '#ff5c8a' }, { text: '♥', color: '#ff8fb8' }],
  notes: [{ text: '♪', color: '#7a6cff' }, { text: '♫', color: '#ff7f2a' }],
  zzz: [{ text: 'Z', color: '#6c7bff', font: '700' }, { text: 'z', color: '#9fa9ff', font: '700' }],
  bubbles: [{ text: '○', color: '#7fc8ff' }, { text: '◦', color: '#bfe6ff' }],
  steam: [{ text: '∿', color: '#ffffff' }, { text: '~', color: '#f0f0f0' }],
  drops: [{ text: '💧', color: '#5aa9ff' }],
  flush: [{ text: '@', color: '#5aa9ff', font: '700' }],
  sparkle: [{ text: '✦', color: '#ffcf33' }, { text: '✧', color: '#ffe680' }],
  confetti: [{ text: '■', color: '#ff5c8a' }, { text: '■', color: '#ffd94a' }, { text: '■', color: '#59c26b' }, { text: '■', color: '#7fc8ff' }],
  shock: [{ text: '!', color: '#ff3b5c', font: '700' }],
  wind: [{ text: '≋', color: '#9fdcff' }],
  type: [{ text: '타', color: '#2b2233' }, { text: '닥', color: '#2b2233' }],
  stink: [{ text: '∿', color: '#8fbf3a' }, { text: '~', color: '#a5c94a' }],
  sweat: [{ text: '💦', color: '#5aa9ff' }],
  ring: [{ text: '♫', color: '#ff3b5c' }, { text: '!', color: '#ff7f2a', font: '700' }],
  game: [{ text: '★', color: '#ffcf33' }, { text: '♦', color: '#ff5c8a' }],
}

/** 머리 위에 띄우는 효과 (나머지는 가구 위) */
export const ON_HEAD: Fx[] = ['zzz', 'hearts', 'notes', 'sweat', 'shock', 'type', 'sparkle']

const texCache = new Map<string, THREE.Texture>()
function glyphTexture(g: Glyph) {
  const key = `${g.text}|${g.color}|${g.font ?? ''}`
  let t = texCache.get(key)
  if (!t) {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')!
    ctx.font = `${g.font ?? '400'} 46px Galmuri11, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.strokeText(g.text, 32, 34)
    ctx.fillStyle = g.color
    ctx.fillText(g.text, 32, 34)
    t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    texCache.set(key, t)
  }
  return t
}

let glowTex: THREE.Texture | null = null
/** 둥글게 번지는 빛 (스탠드·TV 불빛) */
export function glowTexture() {
  if (!glowTex) {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
    glowTex = new THREE.CanvasTexture(c)
  }
  return glowTex
}

interface Particle {
  sprite: THREE.Sprite
  born: number
  life: number
  vel: THREE.Vector3
  spin: number
  start: number
}

export class FxLayer {
  readonly group = new THREE.Group()
  private parts: Particle[] = []

  /** 효과 한 번 (작은 그림 몇 개가 올라가며 사라진다) */
  burst(fx: Fx, at: THREE.Vector3, now: number, count = 3) {
    const glyphs = GLYPHS[fx]
    if (!glyphs) return
    const n = fx === 'confetti' ? 12 : count
    for (let i = 0; i < n; i++) {
      const g = glyphs[i % glyphs.length]
      const m = new THREE.SpriteMaterial({ map: glyphTexture(g), transparent: true, depthWrite: false })
      const s = new THREE.Sprite(m)
      const size = fx === 'confetti' ? 0.12 : fx === 'zzz' ? 0.32 - i * 0.05 : 0.28
      s.scale.setScalar(size)
      s.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.35, Math.random() * 0.1, (Math.random() - 0.5) * 0.35))
      s.renderOrder = 10
      this.group.add(s)
      const up = fx === 'confetti' ? 1.6 + Math.random() : 0.5 + Math.random() * 0.25
      const side = fx === 'confetti' ? 1.2 : fx === 'wind' ? 0.9 : 0.2
      this.parts.push({
        sprite: s,
        born: now + (fx === 'confetti' ? 0 : i * 0.22),
        life: fx === 'confetti' ? 1.4 : 1.6,
        vel: new THREE.Vector3((Math.random() - 0.5) * side, up, (Math.random() - 0.5) * side + (fx === 'wind' ? 0.6 : 0)),
        spin: (Math.random() - 0.5) * 3,
        start: size,
      })
    }
  }

  update(now: number, dt: number) {
    const keep: Particle[] = []
    for (const p of this.parts) {
      const age = now - p.born
      if (age < 0) {
        p.sprite.visible = false
        keep.push(p)
        continue
      }
      p.sprite.visible = true
      const k = age / p.life
      if (k >= 1) {
        this.group.remove(p.sprite)
        p.sprite.material.dispose()
        continue
      }
      p.sprite.position.addScaledVector(p.vel, dt)
      p.vel.y -= p.vel.y > 0.2 ? dt * 0.3 : 0
      p.sprite.material.rotation += p.spin * dt
      p.sprite.material.opacity = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4)
      p.sprite.scale.setScalar(p.start * (0.8 + Math.min(1, age * 4) * 0.2))
      keep.push(p)
    }
    this.parts = keep
  }

  clear() {
    for (const p of this.parts) {
      this.group.remove(p.sprite)
      p.sprite.material.dispose()
    }
    this.parts = []
  }
}
