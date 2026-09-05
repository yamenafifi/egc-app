// Bump this on every real deploy that needs to force stale caches out -
// activate() below deletes any cache whose name doesn't match this one.
const CACHE = 'egc-v4'
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

  // Navigations (loading the app itself) are network-first, not
  // cache-first: cache-first here is what let this go stale forever
  // before - a real deploy landing, or the dev server rebuilding, was
  // invisible because every refresh kept re-serving whatever HTML/JS
  // happened to be cached from the very first visit, and a plain
  // reload can't bypass a service worker's own fetch handler to notice.
  // Falling back to cache only covers genuinely being offline.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
        }
        return resp
      }).catch(() => caches.match(request).then(cached => cached || caches.match('/index.html')))
    )
    return
  }

  // Stale-while-revalidate for everything else (JS/CSS/images): respond
  // instantly from cache if present for speed, but always also fetch in
  // the background and overwrite the cache entry - so a change is picked
  // up on the very next load instead of needing a manual cache-clear
  // (a plain cache-first here has the identical staleness problem as
  // navigations did, just for the code files rather than the shell).
  e.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(resp => {
        if (resp.ok && request.method === 'GET') {
          const clone = resp.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
        }
        return resp
      }).catch(() => cached)
      return cached || network
    })
  )
})
