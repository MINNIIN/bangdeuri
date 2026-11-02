import { type AvatarLook, buildAvatar, PRESET_LOOKS } from './avatar'
import type { Sprite } from './sprite'

export interface CharacterDef {
  id: string
  name: string
  look: AvatarLook
  sprite: Sprite
}

/** 예시 미니미 (첫 화면 예시 방, 개발용 갤러리, 미니미 만들기 시작점) */
export const CHARACTERS: CharacterDef[] = PRESET_LOOKS.map((p) => ({ ...p, sprite: buildAvatar(p.look) }))

export const characterById = (id: string) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]
