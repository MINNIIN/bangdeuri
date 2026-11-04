import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addMonths, dayLabel, kstMonth } from '../../lib/calendar'
import { timers } from '../../lib/timers'

// .env에 진짜 Supabase 키가 있어도 테스트는 이 브라우저 안의 가짜 서버로
vi.mock('../../lib/backend', async () => {
  const { createLocalBackend } = await import('../../lib/localBackend')
  return { backend: createLocalBackend() }
})
import { ToolSheet } from './ToolSheet'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const noop = () => {}

describe('가구 도구 창', () => {
  it('조리대: 레시피를 펼치면 순서와 타이머 버튼', () => {
    const onTimer = vi.fn()
    render(<ToolSheet tool="recipe" onClose={noop} onTimer={onTimer} />)
    fireEvent.click(screen.getByText('계란 라면'))
    expect(screen.getByText('물 550ml 끓이기')).toBeTruthy()
    fireEvent.click(screen.getByText('6분 타이머 맞추기'))
    expect(onTimer).toHaveBeenCalledWith('계란 라면', 360)
  })

  it('냉장고: 재료를 고르면 되는 레시피만', () => {
    render(<ToolSheet tool="pantry" onClose={noop} />)
    expect(screen.getByText('재료를 더 골라 봐요')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '바나나' }))
    fireEvent.click(screen.getByRole('button', { name: '우유' }))
    fireEvent.click(screen.getByRole('button', { name: '얼음' }))
    expect(screen.getByText('바나나 우유 스무디')).toBeTruthy()
  })

  it('전자레인지: 3분 누르면 타이머가 돈다', () => {
    render(<ToolSheet tool="timer-microwave" onClose={noop} />)
    fireEvent.click(screen.getByText('3분'))
    expect(timers.list()[0]).toMatchObject({ source: 'microwave', total: 180 })
    expect(screen.getByText('취소')).toBeTruthy()
  })

  it('턴테이블: 검색창이 보인다', () => {
    render(<ToolSheet tool="turntable" onClose={noop} onPlaySong={noop} onStopSong={noop} />)
    expect(screen.getByLabelText('노래 검색')).toBeTruthy()
  })

  it('달력: 손님에게 쓰기 칸이 있고 나만 보기는 없다', async () => {
    render(
      <ToolSheet
        tool="calendar"
        onClose={noop}
        calendar={{ roomId: 'r', owner: false, name: '고구마', anon: true, version: 0, onChanged: noop, onGuestWrote: noop, toast: noop }}
      />,
    )
    expect(screen.getByLabelText('일정 내용')).toBeTruthy()
    expect(screen.queryByText('나만 보기')).toBeNull()
    expect(await screen.findByText('아직 일정이 없어요')).toBeTruthy()
  })

  it('달력: 다음 달로 넘기면 그 달 1일을 보여 준다', async () => {
    render(
      <ToolSheet
        tool="calendar"
        onClose={noop}
        calendar={{ roomId: 'r', owner: false, name: '고구마', anon: true, version: 0, onChanged: noop, onGuestWrote: noop, toast: noop }}
      />,
    )
    fireEvent.click(screen.getByLabelText('다음달'))
    expect(screen.getByText(dayLabel(`${addMonths(kstMonth(), 1)}-01`))).toBeTruthy()
  })

  it('시계: 손님은 지금 시각만', () => {
    render(<ToolSheet tool="alarm" onClose={noop} alarm={{ owner: false, toast: noop }} />)
    expect(screen.getByText('방 주인만 알람을 맞출 수 있어요')).toBeTruthy()
  })

  it('시계: 주인은 알람 맞추기 칸', async () => {
    render(<ToolSheet tool="alarm" onClose={noop} alarm={{ owner: true, toast: noop }} />)
    expect(screen.getByLabelText('알람 시각')).toBeTruthy()
    expect(await screen.findByText('맞춘 알람이 없어요')).toBeTruthy()
    expect(screen.getByText('테스트 모드에서는 앱이 열려 있을 때만 울려요')).toBeTruthy()
  })
})
