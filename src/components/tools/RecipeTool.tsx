import { useState } from 'react'
import { PANTRY, RECIPE_TAGS, RECIPES, type Recipe, recipesWith } from '../../lib/recipes'

/** 조리대: 레시피 목록, 냉장고: 있는 재료로 되는 레시피 (냉장고 털기) */
export function RecipeTool({
  mode,
  onTimer,
}: {
  mode: 'list' | 'pantry'
  onTimer?: (label: string, seconds: number) => void
}) {
  const [tag, setTag] = useState<string | null>(null)
  const [have, setHave] = useState<string[]>([])
  const [open, setOpen] = useState<string | null>(null)

  const list =
    mode === 'pantry' ? recipesWith(have) : tag ? RECIPES.filter((r) => r.tags.includes(tag)) : RECIPES

  const toggle = (i: string) => setHave(have.includes(i) ? have.filter((x) => x !== i) : [...have, i])

  return (
    <div className="tool-body">
      {mode === 'pantry' ? (
        <>
          <p className="panel-tip">냉장고에 있는 걸 골라 봐요. 소금·간장 같은 기본양념은 있다고 칠게요</p>
          <div className="chips">
            {PANTRY.map((i) => (
              <button key={i} className={`chip ${have.includes(i) ? 'is-on' : ''}`} aria-pressed={have.includes(i)} onClick={() => toggle(i)}>
                {i}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="chips" role="tablist">
          <button role="tab" aria-selected={tag === null} className={`chip ${tag === null ? 'is-on' : ''}`} onClick={() => setTag(null)}>
            전체
          </button>
          {RECIPE_TAGS.map((t) => (
            <button key={t} role="tab" aria-selected={tag === t} className={`chip ${tag === t ? 'is-on' : ''}`} onClick={() => setTag(t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <p className="tool-empty">{mode === 'pantry' ? '재료를 더 골라 봐요' : '레시피가 없어요'}</p>
      ) : (
        list.map((r) => <RecipeCard key={r.id} recipe={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} onTimer={onTimer} />)
      )}
    </div>
  )
}

function RecipeCard({
  recipe: r,
  open,
  onToggle,
  onTimer,
}: {
  recipe: Recipe
  open: boolean
  onToggle: () => void
  onTimer?: (label: string, seconds: number) => void
}) {
  return (
    <div className="recipe-card">
      <button className="recipe-head" onClick={onToggle} aria-expanded={open}>
        <h3>{r.name}</h3>
        <span className="recipe-meta">
          {r.minutes}분 · {'★'.repeat(r.level)}
          {'☆'.repeat(3 - r.level)} · {r.ingredients.join(', ')}
        </span>
      </button>
      {open && (
        <>
          <ol>
            {r.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {onTimer && (
            <button className="btn btn-small recipe-timer" onClick={() => onTimer(r.name, r.minutes * 60)}>
              {r.minutes}분 타이머 맞추기
            </button>
          )}
        </>
      )}
    </div>
  )
}
