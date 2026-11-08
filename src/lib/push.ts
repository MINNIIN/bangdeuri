import { backend } from './backend'
import type { PushPrefs } from './types'

/** 푸시 알림: 서비스 워커 등록 → 알림 허락 → 구독 정보를 서버에 저장 */
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
const PREFS_KEY = 'bangdeuri:push'

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export type PushSupport = 'ok' | 'local' | 'no-key' | 'unsupported' | 'ios-home'

export function pushSupport(): PushSupport {
  if (backend.local) return 'local'
  if (!VAPID) return 'no-key'
  // 아이폰은 홈 화면에 추가한 앱에서만 푸시를 받을 수 있다
  if (isIOS() && !isStandalone()) return 'ios-home'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  return 'ok'
}

const OFF: PushPrefs = { enter: false, drop: false, event: false, alarm: false }

export function savedPrefs(): PushPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) return { ...OFF, ...JSON.parse(raw) }
  } catch {
    // 못 읽으면 꺼진 것으로
  }
  return { ...OFF }
}

/** 다 꺼졌으면 이 기기 구독을 지운다 */
export const allOff = (p: PushPrefs) => !p.enter && !p.drop && !p.event && !p.alarm

/**
 * 화면에는 알림 스위치가 하나뿐이다: 켜면 모든 종류를 받는다.
 * (서버는 종류별 칸을 그대로 쓴다. 새 알림 종류가 생기면 PushPrefs와 여기에만 추가하면 된다)
 */
export const prefsFor = (on: boolean): PushPrefs => ({ enter: on, drop: on, event: on, alarm: on })

/** 예전에 일부만 켜 둔 기기: 스위치 하나로 바뀌었으니 전부 켜짐으로 올린다 */
export const needsUpgrade = (p: PushPrefs) => !allOff(p) && Object.values(p).some((v) => !v)

function rememberPrefs(p: PushPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    // 이번 화면에서만 기억
  }
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch(() => undefined)
}

function keyBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** 알림 설정을 바꾼다. 다 끄면 이 기기 구독을 지운다 */
export async function setPushPrefs(prefs: PushPrefs): Promise<PushPrefs> {
  if (pushSupport() !== 'ok') throw new Error('push_unavailable')
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'))
  await navigator.serviceWorker.ready
  const current = await reg.pushManager.getSubscription()

  if (allOff(prefs)) {
    if (current) {
      await backend.removePush(current.endpoint)
      await current.unsubscribe()
    }
    rememberPrefs(prefs)
    return prefs
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('push_denied')
  const sub =
    current ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID!) }))
  await backend.savePush(sub.toJSON(), prefs)
  rememberPrefs(prefs)
  return prefs
}
