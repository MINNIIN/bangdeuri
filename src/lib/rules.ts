import type { Room } from './types'

export const NAME_MAX = 8
export const MOTTO_MAX = 30
export const NICK_MAX = 8
export const MESSAGE_MAX = 40
export const MAX_DROPS = 60
/** 채팅 한 줄 글자 수 */
export const CHAT_MAX = 80
/** 방마다 남기는 채팅 수 (서버는 30일 지난 것도 지운다) */
export const CHAT_KEEP = 500
export const PASSWORD_MIN = 6

/** 서버가 던지는 에러 코드 → 화면 문구 */
export const ERROR_TEXT: Record<string, string> = {
  room_full: '방이 꽉 찼어요. 방 주인이 정리하면 다시 놓을 수 있어요',
  room_not_found: '방을 찾을 수 없어요',
  forbidden: '방 주인만 할 수 있어요',
  login_required: '로그인이 필요해요',
  profile_required: '먼저 내 미니미를 만들어 주세요',
  email_taken: '이미 가입한 이메일이에요. 로그인해 주세요',
  bad_login: '이메일이나 비밀번호가 맞지 않아요',
  weak_password: `비밀번호는 6자 이상이어야 해요`,
  push_unavailable: '이 환경에서는 알림을 쓸 수 없어요',
  push_denied: '브라우저에서 알림이 꺼져 있어요. 설정에서 허용해 주세요',
  too_fast: '조금 천천히 보내 주세요',
  too_many_rooms: '방은 5개까지 만들 수 있어요',
  bad_date: '1년 전부터 2년 뒤까지만 적을 수 있어요',
  calendar_full: '달력이 꽉 찼어요. 지난 일정이 지나면 다시 쓸 수 있어요',
  too_many_alarms: '알람은 10개까지 맞출 수 있어요',
  confirm_email: '가입 확인 메일을 보냈어요',
}

export function errorText(e: unknown): string {
  const code = e instanceof Error ? e.message : ''
  return ERROR_TEXT[code] ?? '잠깐 문제가 생겼어요\n다시 해 볼래요?'
}

/** 시각·날짜 칸을 누르면 (PC에서도) 고르는 창을 바로 연다. 못 여는 브라우저는 그냥 직접 입력 */
export function openPicker(e: { currentTarget: HTMLInputElement }) {
  try {
    e.currentTarget.showPicker?.()
  } catch {
    // 사용자 동작이 아니거나 지원 안 함
  }
}

/** 한국 날짜 YYYY-MM-DD */
export function kstDate(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

export const todayCount = (room: Room, now = new Date()) => (room.todayDate === kstDate(now) ? room.todayVisits : 0)

/** 글자 수는 화면에 보이는 글자 기준 (이모지 하나 = 1자) */
export const charLength = (s: string) => [...s].length
export const clip = (s: string, max: number) => [...s].slice(0, max).join('')

/** 부르는 말 + 가: 민수 → 민수가, 지민 → 지민이가 */
export function subjectOf(name: string) {
  const last = name.charCodeAt(name.length - 1)
  const batchim = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0
  return batchim ? `${name}이가` : `${name}가`
}

/** 방 링크를 보낼 때 같이 가는 초대 문구 (functions/_middleware.ts 미리보기와 같은 말) */
export const inviteText = (owner: string) => `${subjectOf(owner)} 집들이에 초대했어요! 선물 하나 두고, 한마디 남겨 주세요!`
