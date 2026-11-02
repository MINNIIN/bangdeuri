import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { captureInstallPrompt } from './lib/install'
import { registerServiceWorker } from './lib/push'

// 홈 화면 앱(PWA): 설치 제안을 먼저 잡아 두고, 서비스 워커를 등록한다
captureInstallPrompt()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
