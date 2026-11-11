import { useEffect, useState } from 'react'
import { isIOS, isStandalone } from './push'

/**
 * 홈 화면에 추가(PWA 설치) 안내.
 * - 안드로이드·PC 크롬: 브라우저가 주는 beforeinstallprompt 이벤트로 설치 창을 바로 띄운다
 * - 아이폰 Safari: 설치 API가 없어서 "공유 → 홈 화면에 추가" 순서를 보여 준다
 * - 카톡·인스타 같은 앱 안 브라우저: 홈 화면 추가가 안 돼서 다른 브라우저로 열라고 한다
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

/** 앱이 뜨자마자 불러서 브라우저의 설치 제안을 잡아 둔다 (늦게 붙이면 놓친다) */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    for (const cb of listeners) cb()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    for (const cb of listeners) cb()
  })
}

export type InstallWay = 'installed' | 'prompt' | 'ios' | 'kakao' | 'inapp' | 'other'

const ua = () => navigator.userAgent

/** 카카오톡 안 브라우저인지 (여기서는 구글 로그인이 막히고, 로그인도 다른 브라우저와 따로다) */
export const inKakaoTalk = () => /KAKAOTALK/i.test(ua())

export function installWay(): InstallWay {
  if (isStandalone()) return 'installed'
  if (/KAKAOTALK/i.test(ua())) return 'kakao'
  if (/Instagram|FBAN|FBAV|Line\/|NAVER\(inapp|DaumApps|everytimeApp/i.test(ua())) return 'inapp'
  if (deferred) return 'prompt'
  // 아이폰은 Safari뿐 아니라 크롬도 공유 메뉴에서 홈 화면에 추가할 수 있다
  if (isIOS()) return 'ios'
  return 'other'
}

export function useInstallWay() {
  const [way, setWay] = useState<InstallWay>(installWay)
  useEffect(() => {
    const update = () => setWay(installWay())
    listeners.add(update)
    update()
    return () => {
      listeners.delete(update)
    }
  }, [])
  return way
}

/** 크롬 설치 창 띄우기. 설치했으면 true */
export async function promptInstall() {
  const e = deferred
  if (!e) return false
  await e.prompt()
  const { outcome } = await e.userChoice
  deferred = null
  for (const cb of listeners) cb()
  return outcome === 'accepted'
}

/** 카톡 안 브라우저에서 기본 브라우저로 지금 주소(또는 준 주소) 열기 */
export function openOutsideKakao(href: string = window.location.href) {
  window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`
}

const HIDE_KEY = 'bangdeuri:install-hidden'
const HIDE_MS = 7 * 24 * 60 * 60 * 1000

export function installHidden(now = Date.now()) {
  try {
    return Number(localStorage.getItem(HIDE_KEY) ?? 0) > now
  } catch {
    return false
  }
}

export function hideInstall(now = Date.now()) {
  try {
    localStorage.setItem(HIDE_KEY, String(now + HIDE_MS))
  } catch {
    // 이번 화면에서만 숨긴다
  }
}
