import { DRINKS, type Drink } from '../../lib/cafe'

/** 메뉴판 그림: 아이스는 투명 컵 + 얼음 + 빨대, 따뜻한 건 머그 + 위 장식 */
function CupIcon({ d }: { d: Drink }) {
  if (d.iced)
    return (
      <svg viewBox="0 0 48 56" width="44" height="52" aria-hidden>
        <rect x="27" y="1" width="4" height="22" rx="2" fill="#ff5fa2" transform="rotate(12 29 12)" />
        <path d="M9 12 H39 L35 52 H13 Z" fill={d.color} />
        {d.syrup && <path d="M12.2 40 H35.8 L35 52 H13 Z" fill={d.syrup} />}
        <rect x="14" y="16" width="8" height="7" rx="1.5" fill="#fff" opacity=".75" />
        <rect x="24" y="20" width="8" height="7" rx="1.5" fill="#fff" opacity=".7" />
        <rect x="17" y="25" width="7" height="6" rx="1.5" fill="#fff" opacity=".6" />
        <path d="M7 9 H41 L35.5 54 H12.5 Z" fill="none" stroke="#2b2233" strokeWidth="2.2" strokeLinejoin="round" />
        <rect x="5" y="7" width="38" height="4" rx="2" fill="#fff" stroke="#2b2233" strokeWidth="2" />
      </svg>
    )
  return (
    <svg viewBox="0 0 56 56" width="48" height="48" aria-hidden>
      <path d="M40 22 h4 a7 7 0 0 1 0 14 h-4" fill="none" stroke="#2b2233" strokeWidth="3.4" />
      <path d="M8 16 H42 L39 48 Q38 52 34 52 H16 Q12 52 11 48 Z" fill="#fffaf2" stroke="#2b2233" strokeWidth="2.4" strokeLinejoin="round" />
      <ellipse cx="25" cy="17" rx="16" ry="4" fill={d.color} />
      {d.top === 'art' && <path d="M25 21 C18 17 19 13 22 13.5 C23.5 13.8 24.6 15 25 16 C25.4 15 26.5 13.8 28 13.5 C31 13 32 17 25 21 Z" fill="#fff6ea" />}
      {d.top === 'cream' && (
        <g fill="#fffaf2" stroke="#2b2233" strokeWidth="1.6">
          <ellipse cx="25" cy="13" rx="12" ry="5" />
          <ellipse cx="25" cy="8" rx="7" ry="4" />
        </g>
      )}
      {d.top === 'foam' && <ellipse cx="25" cy="17" rx="11" ry="2.4" fill="#d9b08a" />}
      <rect x="11" y="34" width="29" height="5" fill="#c98f5a" />
      {!d.iced && (
        <g stroke="#cfc6d8" strokeWidth="2" fill="none" strokeLinecap="round">
          <path d="M19 9 q-3 -3 0 -6" />
          <path d="M30 9 q-3 -3 0 -6" />
        </g>
      )}
    </svg>
  )
}

/** 카페 주문대: 음료를 고르면 바리스타가 만들어서 건네준다 (돈은 안 든다) */
export function CafeMenu({ onOrder }: { onOrder: (drinkId: string) => void }) {
  return (
    <div className="cafe-menu">
      <p className="cafe-menu-note">오늘은 오픈 기념 — 전 메뉴 무료로 만들어 드려요 ☕</p>
      <div className="cafe-menu-grid">
        {DRINKS.map((d) => (
          <button key={d.id} className="cafe-drink" onClick={() => onOrder(d.id)}>
            <span className={`cafe-drink-cup${d.iced ? ' is-iced' : ''}`}>
              <CupIcon d={d} />
            </span>
            <b>{d.name}</b>
            <small>{d.desc}</small>
            <span className="cafe-drink-price">
              <s>{d.price.toLocaleString()}원</s> 0원
            </span>
            {d.iced && <span className="cafe-drink-tag">ICE</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
