import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { captureInstallPrompt } from './lib/install'
import { registerServiceWorker } from './lib/push'

// 홈 화면 앱(PWA): 설치 제안을 먼저 잡아 두고, 서비스 워커를 등록한다
captureInstallPrompt()
registerServiceWorker()

const root = createRoot(document.getElementById('root')!)
// 개발용: ?game=claw 처럼 열면 미니게임 하나만 띄운다 (화면 확인용)
const devGame = import.meta.env.DEV ? new URLSearchParams(location.search).get('game') : null
if (devGame)
  void import('./components/games/GameHost').then(({ GameHost }) =>
    root.render(<GameHost game={devGame as never} onResult={(g, r) => console.log('[game]', g, JSON.stringify(r))} onClose={() => console.log('[game] close')} />),
  )
else
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
