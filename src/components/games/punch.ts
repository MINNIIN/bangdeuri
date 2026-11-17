/**
 * 꽝꽝펀치 — 순수 계산 (화면·소리 없음).
 * 한 번 치기 = ① 오르내리는 힘 게이지를 멈추고 ② 줄어드는 링이 과녁에 맞을 때 친다.
 */

/** 한 판에 치는 횟수 */
export const PUNCHES = 3

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** 힘 게이지 왕복 속도 (초당 왕복 횟수) — 칠수록 빨라진다 */
export const gaugeSpeed = (punch: number) => 0.8 + punch * 0.35

/** t초 지났을 때 게이지 (0 → 1 → 0 삼각파, speed = 초당 왕복) */
export function gaugePower(t: number, speed: number): number {
  const ph = (((t * speed) % 1) + 1) % 1
  return ph < 0.5 ? ph * 2 : 2 - ph * 2
}

/** 링이 1 → 0으로 줄어드는 속도 (초당) — 칠수록 빨라진다 */
export const ringSpeed = (punch: number) => 0.7 + punch * 0.2

/** 과녁 크기 (링 크기 1 = 패드 가득) */
export const RING_TARGET = 0.3
/** 과녁에서 이만큼 벗어나면 정확도 0 */
const RING_TOLERANCE = 0.3

/** t초 지났을 때 링 크기 (0 아래로 안 간다) */
export const ringScale = (t: number, speed: number) => Math.max(0, 1 - t * speed)

/** 링 크기 → 정확도 0~1 (과녁과 딱 맞으면 1) */
export function accuracyFromRing(scale: number): number {
  return clamp01(1 - Math.abs(scale - RING_TARGET) / RING_TOLERANCE)
}

export function accuracyGrade(acc: number): string {
  if (acc >= 0.9) return '완벽!'
  if (acc >= 0.65) return '좋아!'
  if (acc >= 0.3) return '괜찮아'
  return '빗맞음'
}

/** 힘·정확도(각 0~1) → 0~999점. 빗맞아도 힘의 30%는 들어간다 */
export function punchScore(power: number, acc: number): number {
  return Math.round(999 * clamp01(power) * (0.3 + 0.7 * clamp01(acc)))
}

/** 한 판 기록 = 세 번 중 최고 */
export const roundBest = (scores: number[]) => scores.reduce((a, b) => Math.max(a, b), 0)

export function rankLabel(score: number): string {
  if (score >= 999) return '전설의 주먹'
  if (score >= 900) return '펀치왕'
  if (score >= 700) return '헬스장 단골'
  if (score >= 400) return '보통 주먹'
  return '솜주먹'
}

/** 미니미가 말할 한 줄 (20자 미만) */
export function resultLine(score: number): string {
  if (score >= 999) return '전설의 펀치 999점!!'
  if (score < 200) return '손목 나갈 뻔…'
  return `펀치 ${score}점!`
}

/** LED 숫자 굴리기: k(0~1 진행) → 지금 보여줄 값 (빠르게 올라가다 천천히 멈춤) */
export function rollValue(target: number, k: number): number {
  const e = 1 - Math.pow(1 - clamp01(k), 3)
  return Math.round(target * e)
}
