import { useEffect, useState } from 'react'
import { type AvatarLook, buildAvatar } from '../art/avatar'
import { SpriteIcon } from './PixelSprite'

type Frame = 'full' | 'bust'
/** 찍어 둔 미니미 그림 (three.js를 불러오기 전에도 바로 그리려고 여기에도 둔다) */
const shots = new Map<string, string | null>()
const keyOf = (look: AvatarLook, px: number, frame: Frame) => `${JSON.stringify(look)}|${px}|${frame}`

/**
 * 게임 캐릭터 미니미 그림 (방 안의 3D 미니미와 같은 모습).
 * 처음엔 three.js를 따로 불러와 찍으므로 잠깐 빈칸이고, 찍을 수 없는 환경이면 예전 도트 미니미를 그린다.
 */
export function AvatarIcon({ look, size = 40, frame = 'full', className }: { look: AvatarLook; size?: number; frame?: Frame; className?: string }) {
  // 화면 밀도에 맞춰 찍되, 크기를 몇 단계로 묶어 같은 그림을 재사용한다
  const dpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2)
  const want = size * dpr
  const px = want <= 64 ? 64 : want <= 128 ? 128 : want <= 192 ? 192 : 320
  const key = keyOf(look, px, frame)
  const [shot, setShot] = useState<{ key: string; url: string | null } | null>(() => (shots.has(key) ? { key, url: shots.get(key)! } : null))

  useEffect(() => {
    if (shots.has(key)) {
      setShot({ key, url: shots.get(key)! })
      return
    }
    let alive = true
    import('../three/avatarPortrait')
      .then((m) => m.avatarPortrait(look, px, frame))
      .catch(() => null)
      .then((url) => {
        shots.set(key, url)
        if (alive) setShot({ key, url })
      })
    return () => {
      alive = false
    }
    // look은 key에 들어 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // 새 모습을 찍는 동안엔 바로 전 그림을 그대로 둔다 (색을 바꿀 때 깜빡이지 않게)
  if (shot && !shot.url) return <SpriteIcon sprite={buildAvatar(look)} size={size} className={className} />
  if (!shot) return <span className={`avatar-icon is-loading ${className ?? ''}`} style={{ width: size, height: size }} aria-hidden />
  return <img src={shot.url!} width={size} height={size} className={`avatar-icon ${className ?? ''}`} alt="" aria-hidden draggable={false} />
}
