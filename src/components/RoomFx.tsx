import { type CSSProperties, useId } from 'react'
import type { Fx } from '../lib/interactions'
import { VIEW_H, VIEW_W } from '../lib/iso'

/**
 * 방 안 효과 (SVG). 움직임은 전부 CSS 애니메이션이라 리액트는 그리기만 한다.
 * 좌표는 집 SVG 좌표 그대로.
 */

type P = { x: number; y: number }

const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` })

const HEART = 'M0 1h1V0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0z'
const SPARK = 'M2 0h1v2h2v1H3v2H2V3H0V2h2z'

/** 머리 위로 떠오르는 것들 (하트, 음표, Zzz …) */
export function Floaters({ fx, at }: { fx: Fx; at: P }) {
  const t = `translate(${at.x} ${at.y})`
  switch (fx) {
    case 'zzz':
      return (
        <g transform={t} className="fx">
          {[0, 1, 2].map((i) => (
            <text key={i} className="fx-rise fx-zzz" x={6 + i * 5} y={-i * 3} fontSize={8 + i * 2} style={delay(i * 0.6)}>
              Z
            </text>
          ))}
        </g>
      )
    case 'hearts':
      return (
        <g transform={t} className="fx">
          {[-8, 2, 9].map((x, i) => (
            <path key={i} className="fx-rise" d={HEART} transform={`translate(${x} ${-i * 4}) scale(1.3)`} fill="#ff4f79" style={delay(i * 0.45)} />
          ))}
        </g>
      )
    case 'notes':
      return (
        <g transform={t} className="fx">
          {['♪', '♫', '♪'].map((n, i) => (
            <text key={i} className="fx-rise fx-note" x={-12 + i * 11} y={-i * 3} fontSize={11} style={delay(i * 0.5)}>
              {n}
            </text>
          ))}
        </g>
      )
    case 'steam':
      return (
        <g transform={t} className="fx">
          {[-5, 1, 6].map((x, i) => (
            <circle key={i} className="fx-rise fx-puff" cx={x} cy={0} r={3 + (i % 2)} fill="#ffffff" style={delay(i * 0.55)} />
          ))}
        </g>
      )
    case 'bubbles':
      return (
        <g transform={t} className="fx">
          {[-10, -3, 4, 10].map((x, i) => (
            <circle key={i} className="fx-rise" cx={x} cy={0} r={1.6 + (i % 3)} fill="rgba(255,255,255,0.5)" stroke="#5aa8e0" strokeWidth={0.8} style={delay(i * 0.4)} />
          ))}
        </g>
      )
    case 'drops':
      return (
        <g transform={t} className="fx">
          {[-3, 0, 3].map((x, i) => (
            <rect key={i} className="fx-fall" x={x} y={0} width={1.6} height={3} fill="#5aa8e0" style={delay(i * 0.3)} />
          ))}
        </g>
      )
    case 'sparkle':
      return (
        <g transform={t} className="fx">
          {[
            [-12, -4],
            [10, -10],
            [2, 4],
            [-4, -16],
          ].map(([x, y], i) => (
            <path key={i} className="fx-twinkle" d={SPARK} transform={`translate(${x} ${y}) scale(1.4)`} fill="#ffd94a" style={delay(i * 0.25)} />
          ))}
        </g>
      )
    case 'confetti':
      return (
        <g transform={t} className="fx">
          {['#ff4f79', '#ffd94a', '#6fd6b8', '#6a8cff', '#ff8a3d', '#9d8cff', '#59c26b'].map((c, i) => (
            <rect key={i} className="fx-burst" x={-1} y={-1} width={2.4} height={2.4} fill={c} style={{ ...delay(i * 0.05), ['--bx' as string]: `${(i - 3) * 7}px`, ['--by' as string]: `${-14 - (i % 3) * 7}px` }} />
          ))}
        </g>
      )
    case 'shock':
      return (
        <g transform={t} className="fx">
          <g className="fx-pop">
            <rect x={-3} y={-14} width={6} height={14} rx={1} fill="#ff4f4f" stroke="#2b2233" strokeWidth={1} />
            <rect x={-1} y={-12} width={2} height={7} fill="#fff" />
            <rect x={-1} y={-3.6} width={2} height={2} fill="#fff" />
          </g>
        </g>
      )
    case 'stink':
      return (
        <g transform={t} className="fx">
          {[-6, 0, 6].map((x, i) => (
            <path key={i} className="fx-rise fx-stink" d={`M${x} 0q2 -3 0 -6q-2 -3 0 -6`} fill="none" stroke="#7bbf3a" strokeWidth={1.4} style={delay(i * 0.4)} />
          ))}
        </g>
      )
    case 'sweat':
      return (
        <g transform={t} className="fx">
          {[-11, 11].map((x, i) => (
            <path key={i} className="fx-fall" d={`M${x} 0l1.5 2.5a1.6 1.6 0 1 1 -3 0z`} fill="#8fd0ff" stroke="#2b2233" strokeWidth={0.5} style={delay(i * 0.5)} />
          ))}
        </g>
      )
    case 'type':
      return (
        <g transform={t} className="fx">
          {['타닥', '탁', '타닥'].map((w, i) => (
            <text key={i} className="fx-rise fx-word" x={-14 + i * 12} y={-i * 2} fontSize={7} style={delay(i * 0.45)}>
              {w}
            </text>
          ))}
        </g>
      )
    case 'ring':
      return (
        <g transform={t} className="fx">
          <text className="fx-shake fx-word fx-loud" x={0} y={0} fontSize={9} textAnchor="middle">
            따르릉!
          </text>
        </g>
      )
    case 'flush':
      return (
        <g transform={t} className="fx">
          <ellipse className="fx-swirl" cx={0} cy={0} rx={8} ry={3} fill="none" stroke="#5aa8e0" strokeWidth={1.5} strokeDasharray="4 3" />
          <text className="fx-rise fx-word" x={0} y={-6} fontSize={8} textAnchor="middle">
            쏴아아~
          </text>
          {[-6, 6].map((x, i) => (
            <rect key={i} className="fx-burst" x={x} y={-2} width={2} height={2} fill="#8fd0ff" style={{ ['--bx' as string]: `${x}px`, ['--by' as string]: '-10px' }} />
          ))}
        </g>
      )
    case 'wind':
      return (
        <g transform={t} className="fx">
          {[0, 5, 10].map((y, i) => (
            <rect key={i} className="fx-wind" x={0} y={y} width={12} height={1.2} rx={0.6} fill="#8fd0ff" style={delay(i * 0.25)} />
          ))}
        </g>
      )
    case 'game':
      return (
        <g transform={t} className="fx">
          {['삐융', '★', '뿅'].map((w, i) => (
            <text key={i} className="fx-rise fx-word fx-game" x={-12 + i * 11} y={-i * 2} fontSize={i === 1 ? 10 : 7} style={delay(i * 0.5)}>
              {w}
            </text>
          ))}
        </g>
      )
    default:
      return null
  }
}

/** TV 화면에 나오는 채널 (sprite 위 화면 칸에 겹친다) */
export function TvScreen({ x, y, w, h, channel, switching }: { x: number; y: number; w: number; h: number; channel: number; switching: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return (
    <g transform={`translate(${x} ${y})`} className="tv-on">
      <defs>
        <clipPath id={`tv-${id}`}>
          <rect width={w} height={h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#tv-${id})`}>
        <Channel n={channel} w={w} h={h} />
        {switching && (
          <g className="tv-noise">
            <rect width={w} height={h} fill="#c9c9d6" />
            {Array.from({ length: 18 }, (_, i) => (
              <rect key={i} x={(i * 7.3) % w} y={(i * 3.7) % h} width={3} height={1} fill={i % 2 ? '#2b2233' : '#fff'} />
            ))}
          </g>
        )}
        <rect width={w} height={h * 0.45} fill="#fff" opacity={0.12} />
      </g>
    </g>
  )
}

function Channel({ n, w, h }: { n: number; w: number; h: number }) {
  switch (n % 5) {
    case 0: // 도트 드라마: 두 사람이 다가가고 하트
      return (
        <g>
          <rect width={w} height={h} fill="#ffd6e6" />
          <rect y={h - 3} width={w} height={3} fill="#ffb3cf" />
          <g className="tv-left">
            <circle cx={6} cy={h - 6} r={2.4} fill="#3b2b3f" />
            <rect x={4.5} y={h - 4} width={3} height={3} fill="#6a8cff" />
          </g>
          <g className="tv-right">
            <circle cx={w - 6} cy={h - 6} r={2.4} fill="#7a4b2e" />
            <rect x={w - 7.5} y={h - 4} width={3} height={3} fill="#ff8fb8" />
          </g>
          <path className="tv-blink" d={HEART} transform={`translate(${w / 2 - 2.5} 1.5) scale(0.7)`} fill="#ff4f79" />
        </g>
      )
    case 1: // 뉴스: 앵커 + 아래 자막
      return (
        <g>
          <rect width={w} height={h} fill="#2f56c9" />
          <rect x={w - 11} y={1.5} width={9} height={5} fill="#8fb0ff" />
          <circle cx={9} cy={4} r={2.2} fill="#ffe0cc" />
          <rect x={6} y={6} width={6} height={3} fill="#2b2233" />
          <rect y={h - 3.2} width={w} height={3.2} fill="#e8384f" />
          <text className="tv-ticker" x={w} y={h - 0.8} fontSize={2.8} fill="#fff">
            속보 · 방들이 대유행 · 친구 방에 똥 놓고 간 사람 검거 ·
          </text>
        </g>
      )
    case 2: // 음악 방송: 이퀄라이저
      return (
        <g>
          <rect width={w} height={h} fill="#2a1f45" />
          {Array.from({ length: 7 }, (_, i) => (
            <rect
              key={i}
              className="tv-eq"
              x={2 + i * ((w - 4) / 7)}
              y={1}
              width={(w - 4) / 7 - 1}
              height={h - 2}
              fill={['#ff4f79', '#ff8a3d', '#ffd94a', '#59c26b', '#6fd6b8', '#6a8cff', '#9d8cff'][i]}
              style={delay(i * 0.11)}
            />
          ))}
        </g>
      )
    case 3: // 고양이 채널
      return (
        <g>
          <rect width={w} height={h} fill="#fff3b0" />
          <g className="tv-bounce">
            <path d={`M${w / 2 - 5} ${h - 2}v-6l2 -2l2 2h2l2 -2l2 2v6z`} fill="#ffb347" stroke="#2b2233" strokeWidth={0.5} />
            <rect x={w / 2 - 2.6} y={h - 6} width={1} height={1} fill="#2b2233" />
            <rect x={w / 2 + 1.6} y={h - 6} width={1} height={1} fill="#2b2233" />
          </g>
          <text x={2} y={4} fontSize={2.8} fill="#a87445">
            냥
          </text>
        </g>
      )
    default: // 축구 중계
      return (
        <g>
          <rect width={w} height={h} fill="#59c26b" />
          <rect x={w / 2 - 0.3} width={0.6} height={h} fill="#fff" opacity={0.8} />
          <circle cx={w / 2} cy={h / 2} r={2.6} fill="none" stroke="#fff" strokeWidth={0.5} opacity={0.8} />
          <rect x={4} y={3} width={1.6} height={2.4} fill="#e8384f" />
          <rect x={w - 6} y={h - 6} width={1.6} height={2.4} fill="#4d7dff" />
          <circle className="tv-ball" cx={4} cy={h / 2} r={1} fill="#fff" stroke="#2b2233" strokeWidth={0.3} />
        </g>
      )
  }
}

const COVER = { x: -400, y: -400, width: VIEW_W + 800, height: VIEW_H + 800 }

/** 불 끄고 잘 때 */
export function Night() {
  return <rect {...COVER} className="fx-night" fill="#0b0d2a" />
}

/** 디스코볼: 어두워지고 빛 조각이 돈다 */
export function Disco({ at }: { at: P }) {
  return (
    <g className="fx-disco" pointerEvents="none">
      <rect {...COVER} fill="#120a24" opacity={0.42} />
      <g transform={`translate(${at.x} ${at.y})`}>
        <g className="disco-spin">
          {['#ff4f79', '#ffd94a', '#6fd6b8', '#6a8cff', '#ff8a3d', '#9d8cff', '#b4ff9a', '#fff'].map((c, i) => {
            const a = (i / 8) * Math.PI * 2
            return <circle key={i} cx={Math.cos(a) * (60 + (i % 3) * 30)} cy={Math.sin(a) * (30 + (i % 3) * 15)} r={7 + (i % 3) * 3} fill={c} opacity={0.5} />
          })}
        </g>
      </g>
    </g>
  )
}

/** 스탠드·화면 불빛 */
export function Glow({ at, r = 40, color = '#fff3b0', className = '' }: { at: P; r?: number; color?: string; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return (
    <g pointerEvents="none" className={className}>
      <defs>
        <radialGradient id={`glow-${id}`}>
          <stop offset="0%" stopColor={color} stopOpacity={0.75} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <ellipse cx={at.x} cy={at.y} rx={r} ry={r * 0.7} fill={`url(#glow-${id})`} style={{ mixBlendMode: 'screen' }} />
    </g>
  )
}
