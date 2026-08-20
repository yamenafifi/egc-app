// Web Push registration via the native PushManager - no new npm dependency.
// iOS Safari only supports this once the PWA has been Added to Home Screen
// (iOS >= 16.4); a plain browser tab has no PushManager at all, which
// getPushSubscriptionState() below reports as 'unsupported' so the UI can
// stay quiet instead of offering a dead-end button.
import { notificationsAPI } from './api'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(ch => ch.charCodeAt(0)))
}

function isSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

export async function getPushSubscriptionState() {
  if (!isSupported()) return 'unsupported'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'on' : 'off'
  } catch {
    return 'unsupported'
  }
}

export async function registerPush() {
  if (!isSupported()) {
    throw new Error('Push notifications are not supported on this device/browser.')
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.')
  }

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const { data } = await notificationsAPI.vapidPublicKey()
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.public_key),
    })
  }

  const json = sub.toJSON()
  await notificationsAPI.pushSubscribe({ endpoint: json.endpoint, keys: json.keys })
  return sub
}

export async function unregisterPush() {
  if (!isSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  try { await notificationsAPI.pushUnsubscribe(endpoint) } catch { /* best-effort */ }
}
