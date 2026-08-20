const CACHE = 'egc-v1'
const STATIC = ['/', '/index.html']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ))
  self.clients.claim()
})

self.addEventListener('push', e => {
  let data = { title: 'EGC App', body: '' }
  try { data = { ...data, ...e.data.json() } } catch { /* non-JSON payload, use defaults */ }

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo.png',
      badge: '/logo.png',
      data: { link: data.link || '/home' },
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const link = e.notification.data?.link || '/home'

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'navigate', link })
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link)
    })
  )
})

self.addEventListener('fetch', e => {
  const { request } = e
  // Only handle http(s) — skip chrome-extension:// and other schemes
  if (!request.url.startsWith('http')) return

  // Network-first for API calls
  if (request.url.includes('/api/')) {
    e.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({ error: 'Offline' }), {
        headers: { 'Content-Type': 'application/json' }
      }))
    )
    return
  }
  // Cache-first for static assets
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(resp => {
      if (resp.ok && request.method === 'GET') {
        const clone = resp.clone()
        caches.open(CACHE).then(c => c.put(request, clone))
      }
      return resp
    }).catch(() => caches.match('/index.html')))
  )
})
