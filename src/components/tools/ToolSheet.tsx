import type { ToolId } from '../../lib/tools'
import { Sheet } from '../Sheet'
import { RecipeTool } from './RecipeTool'
import { TimerTool } from './TimerTool'

const TITLES: Record<ToolId, string> = {
  recipe: '오늘 뭐 해 먹지?',
  pantry: '냉장고 털기',
  'timer-desk': '집중 타이머',
  'timer-microwave': '전자레인지',
  'timer-washer': '세탁기',
  turntable: '턴테이블',
  calendar: '달력',
  alarm: '알람 시계',
}

export interface ToolProps {
  onTimer?: (label: string, seconds: number) => void
}

/** 가구에 도착하면 열리는 도구 창 */
export function ToolSheet({ tool, onClose, onTimer }: ToolProps & { tool: ToolId | null; onClose: () => void }) {
  const body = tool ? renderTool(tool, { onTimer }) : null
  return (
    <Sheet open={!!tool && !!body} onClose={onClose} title={tool ? TITLES[tool] : ''}>
      {body}
    </Sheet>
  )
}

function renderTool(tool: ToolId, p: ToolProps) {
  switch (tool) {
    case 'recipe':
      return <RecipeTool mode="list" onTimer={p.onTimer} />
    case 'pantry':
      return <RecipeTool mode="pantry" onTimer={p.onTimer} />
    case 'timer-desk':
      return <TimerTool source="desk" />
    case 'timer-microwave':
      return <TimerTool source="microwave" />
    case 'timer-washer':
      return <TimerTool source="washer" />
    default:
      return null
  }
}
