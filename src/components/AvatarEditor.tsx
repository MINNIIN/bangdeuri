import { useState } from 'react'
import {
  type AvatarLook,
  buildAvatar,
  CLOTH_COLORS,
  HAIR_COLORS,
  HAT_COLORS,
  LOOK_PARTS,
  PRESET_LOOKS,
  randomLook,
  SKIN_COLORS,
} from '../art/avatar'
import { SpriteIcon } from './PixelSprite'

type Tab = 'hair' | 'face' | 'top' | 'bottom' | 'hat'

const TABS: { id: Tab; name: string }[] = [
  { id: 'hair', name: '머리' },
  { id: 'face', name: '얼굴' },
  { id: 'top', name: '상의' },
  { id: 'bottom', name: '하의' },
  { id: 'hat', name: '모자' },
]

/** 탭마다 고르는 모양과 색 */
const PARTS: Record<Tab, { shape: keyof typeof LOOK_PARTS; color: keyof AvatarLook; colors: string[]; colorName: string }> = {
  hair: { shape: 'hair', color: 'hairColor', colors: HAIR_COLORS, colorName: '머리색' },
  face: { shape: 'eyes', color: 'skin', colors: SKIN_COLORS, colorName: '피부색' },
  top: { shape: 'top', color: 'topColor', colors: CLOTH_COLORS, colorName: '옷 색' },
  bottom: { shape: 'bottom', color: 'bottomColor', colors: CLOTH_COLORS, colorName: '옷 색' },
  hat: { shape: 'hat', color: 'hatColor', colors: HAT_COLORS, colorName: '모자 색' },
}

/** 내 미니미 만들기: 큰 미리보기 + 부위 탭 + 모양·색 고르기 */
export function AvatarEditor({ look, onChange }: { look: AvatarLook; onChange: (l: AvatarLook) => void }) {
  const [tab, setTab] = useState<Tab>('hair')
  const part = PARTS[tab]
  const options = LOOK_PARTS[part.shape] as readonly { id: string; name: string }[]
  const set = (patch: Partial<AvatarLook>) => onChange({ ...look, ...patch })

  return (
    <section className="avatar-editor">
      <div className="avatar-stage">
        <SpriteIcon sprite={buildAvatar(look)} size={150} className="avatar-big" />
        <div className="avatar-quick">
          <button type="button" className="btn btn-small" onClick={() => onChange(randomLook())}>
            아무렇게나
          </button>
          {PRESET_LOOKS.map((p) => (
            <button key={p.id} type="button" className="avatar-preset" onClick={() => onChange(p.look)} aria-label={`${p.name}에서 시작`}>
              <SpriteIcon sprite={buildAvatar(p.look)} size={34} />
            </button>
          ))}
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'is-on' : ''}`} onClick={() => setTab(t.id)}>
            {t.name}
          </button>
        ))}
      </div>

      <div className="panel">
        <p className="panel-label">{tab === 'face' ? '눈' : '모양'}</p>
        <div className="part-grid" role="radiogroup">
          {options.map((o) => {
            const next = { ...look, [part.shape]: o.id } as AvatarLook
            const on = look[part.shape] === o.id
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                className={`part-cell ${on ? 'is-on' : ''}`}
                onClick={() => set({ [part.shape]: o.id } as Partial<AvatarLook>)}
              >
                <SpriteIcon sprite={buildAvatar(next)} size={46} />
                <span>{o.name}</span>
              </button>
            )
          })}
        </div>

        {!(tab === 'hat' && look.hat === 'none') && (
          <>
            <p className="panel-label">{part.colorName}</p>
            <div className="colors" role="radiogroup">
              {part.colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={look[part.color] === c}
                  aria-label={c}
                  className={`color ${look[part.color] === c ? 'is-on' : ''}`}
                  style={{ background: c }}
                  onClick={() => set({ [part.color]: c } as Partial<AvatarLook>)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
