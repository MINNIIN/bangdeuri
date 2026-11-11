import { useState } from 'react'
import { hideInstall, installHidden, openOutsideKakao, promptInstall, useInstallWay } from '../lib/install'
import { Icon } from './PixelSprite'
import { Sheet } from './Sheet'

/** 홈 화면에 추가 안내 카드 (기기마다 다른 방법) */
export function InstallCard({ reason }: { reason: string }) {
  const way = useInstallWay()
  const [hidden, setHidden] = useState(installHidden)
  const [guide, setGuide] = useState(false)

  if (hidden || way === 'installed' || way === 'other') return null

  const later = () => {
    hideInstall()
    setHidden(true)
  }

  return (
    <section className="install">
      <img className="install-icon" src="/icon-192.png" alt="" width={44} height={44} />
      <div className="install-body">
        <b>홈 화면에 방들이 추가하기</b>
        <span className="muted">{way === 'kakao' || way === 'inapp' ? '이 앱 안에서는 추가할 수 없어요. 다른 브라우저로 열어 주세요' : reason}</span>
        <div className="install-actions">
          {way === 'prompt' && (
            <button className="btn btn-small btn-primary" onClick={() => promptInstall().then((ok) => ok && setHidden(true))}>
              <Icon id="addbox" size={13} /> 추가하기
            </button>
          )}
          {way === 'ios' && (
            <button className="btn btn-small btn-primary" onClick={() => setGuide(true)}>
              <Icon id="addbox" size={13} /> 추가하는 법
            </button>
          )}
          {way === 'kakao' && (
            <button className="btn btn-small btn-primary" onClick={() => openOutsideKakao()}>
              다른 브라우저로 열기
            </button>
          )}
          <button className="link" onClick={later}>
            나중에
          </button>
        </div>
      </div>

      <Sheet open={guide} onClose={() => setGuide(false)} title="아이폰 홈 화면에 추가하기">
        <ol className="install-steps">
          <li>
            <b>1</b>
            <span>
              Safari 아래쪽(또는 위쪽)의 <Icon id="share" size={16} /> <b>공유</b> 버튼을 눌러요
            </span>
          </li>
          <li>
            <b>2</b>
            <span>
              메뉴를 아래로 내려 <Icon id="addbox" size={16} /> <b>홈 화면에 추가</b>를 눌러요
            </span>
          </li>
          <li>
            <b>3</b>
            <span>
              오른쪽 위 <b>추가</b>를 누르면 끝! 이제 홈 화면의 방들이 아이콘으로 열어 주세요
            </span>
          </li>
        </ol>
        <p className="muted install-tip">홈 화면 아이콘으로 열어야 친구가 놀러 왔을 때 알림을 받을 수 있어요 (iOS 16.4 이상)</p>
      </Sheet>
    </section>
  )
}
