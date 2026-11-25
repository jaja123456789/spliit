// Spliit's service worker: push notifications, and the app on this device when there is no
// network — the pages and group data already seen, and the code that runs them.
//
// Static and dependency-free on purpose: it is served as-is from public/, under whatever base path
// the deployment uses (the Docker build swaps a placeholder at start-up), so it reads that path
// from its own scope instead of having it written in.

const VERSION = 'v1'
const STATIC_CACHE = `spliit-static-${VERSION}`
const PAGES_CACHE = `spliit-pages-${VERSION}`
const DATA_CACHE = `spliit-data-${VERSION}`
const OWN_CACHES = [STATIC_CACHE, PAGES_CACHE, DATA_CACHE]

// Generous on purpose. Trimming a chunk that a saved page still loads would leave that page broken
// offline; a few hundred files is a few deployments' worth.
const LIMITS = {
  [STATIC_CACHE]: 600,
  [PAGES_CACHE]: 150,
  [DATA_CACHE]: 500,
}

/** "/" or "/spliit/": everything this worker may answer for lives under it. */
const BASE = new URL(self.registration.scope).pathname

/** Group data only. Sign-in, sync, push and MCP answer per user, and must never be replayed. */
const CACHED_PROCEDURE = /^(groups|categories)\./

// Named by their content: a new build gives a changed file a new name, so a saved copy never goes
// stale.
const HASHED_FILE = /^\/_next\/static\//
// Same name across deployments: icons, the logo, the manifest. Saved for offline use, but checked
// for a newer copy each time — served cache-first like the hashed files, a regenerated icon or a
// changed manifest never reached a device that already had the old one.
const NAMED_FILE =
  /^\/(_next\/image|logo\/|logo-with-text\.png|android-chrome-|manifest\.webmanifest|favicon)/

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('spliit-') && !OWN_CACHES.includes(name)) {
          await caches.delete(name)
        }
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  // Only reads. The share target, mutations and uploads are POSTs and go straight through.
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) {
    return
  }
  const path = url.pathname.slice(BASE.length - 1)

  if (HASHED_FILE.test(path)) {
    event.respondWith(cacheFirst(event, STATIC_CACHE))
  } else if (NAMED_FILE.test(path)) {
    event.respondWith(staleWhileRevalidate(event, STATIC_CACHE))
  } else if (path.startsWith('/api/trpc/')) {
    const procedure = path.slice('/api/trpc/'.length)
    if (CACHED_PROCEDURE.test(procedure)) {
      event.respondWith(networkFirst(event, DATA_CACHE))
    }
  } else if (request.mode === 'navigate' && !path.startsWith('/api/')) {
    // A full page load. Client-side navigations fetch RSC payloads instead, which are left alone:
    // when one fails offline, Next falls back to a full load of the same address, which lands here.
    event.respondWith(networkFirst(event, PAGES_CACHE, offlinePage))
  }
})

/** Content-hashed files never change under the same name, so a saved copy is always right. */
async function cacheFirst(event, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(event.request)
  if (cached) return cached
  const response = await fetch(event.request)
  if (response.ok)
    event.waitUntil(save(cache, cacheName, event.request, response))
  return response
}

/**
 * The saved copy at once, if there is one, while the network's answer replaces it for next time;
 * the network's answer otherwise. For files that keep their name when their content changes.
 */
async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(event.request)
  const network = fetch(event.request)
  if (cached) {
    event.waitUntil(
      network
        .then((response) =>
          response.ok ? save(cache, cacheName, event.request, response) : null,
        )
        .catch(() => {}),
    )
    return cached
  }
  const response = await network
  if (response.ok)
    event.waitUntil(save(cache, cacheName, event.request, response))
  return response
}

/**
 * The network's answer whenever there is one — the saved copy only when the request fails
 * outright. No timeout: on a slow connection a fresh answer late beats a stale one early.
 */
async function networkFirst(event, cacheName, fallback) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(event.request)
    if (response.ok && !response.redirected && response.type === 'basic') {
      event.waitUntil(save(cache, cacheName, event.request, response))
    }
    return response
  } catch (error) {
    const cached = await cache.match(event.request, { ignoreVary: true })
    if (cached) return cached
    if (fallback) return fallback()
    throw error
  }
}

async function save(cache, cacheName, request, response) {
  await cache.put(request, response.clone())
  const keys = await cache.keys()
  // Oldest first: `keys()` lists entries in the order they were added.
  for (const key of keys.slice(
    0,
    Math.max(0, keys.length - LIMITS[cacheName]),
  )) {
    await cache.delete(key)
  }
}

function offlinePage() {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Spliit</title>` +
      `<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;color:#1b1f1e;background:#fbfaf9}a{color:#047857}</style></head>` +
      `<body><h1>You are offline</h1><p>This page has not been opened on this device yet, so there is nothing saved to show.</p>` +
      `<p><a href="${BASE}groups">Your groups</a> may be — they open offline once they have been opened online.</p></body></html>`,
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

// Saves a page and the code it loads, without the page having to be opened. Sent by a group's
// expense list while online, for the screen most likely to be wanted offline: adding an expense.
self.addEventListener('message', (event) => {
  if (
    event.data &&
    event.data.type === 'warm' &&
    Array.isArray(event.data.urls)
  ) {
    event.waitUntil(warm(event.data.urls))
  }
})

async function warm(urls) {
  const pages = await caches.open(PAGES_CACHE)
  const statics = await caches.open(STATIC_CACHE)
  for (const url of urls) {
    try {
      const page = new URL(url, self.location.origin)
      if (!page.pathname.startsWith(BASE)) continue
      const response = await fetch(page, { credentials: 'same-origin' })
      if (!response.ok || response.redirected) continue
      const html = await response.clone().text()
      await save(pages, PAGES_CACHE, page.href, response)
      const assets = new Set(
        Array.from(
          html.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]+)"/g),
          (match) => new URL(match[1].replace(/&amp;/g, '&'), page).href,
        ),
      )
      for (const asset of assets) {
        if (await statics.match(asset)) continue
        const assetResponse = await fetch(asset)
        if (assetResponse.ok)
          await save(statics, STATIC_CACHE, asset, assetResponse)
      }
    } catch (error) {
      // Offline or the page is gone: nothing to save this time.
    }
  }
}

function withBase(path) {
  if (!path.startsWith('/') || path.startsWith(BASE)) return path
  return BASE + path.slice(1)
}

self.addEventListener('push', function (event) {
  if (!(self.Notification && self.Notification.permission === 'granted')) {
    return
  }

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i]
          if (client.focused && client.visibilityState === 'visible') {
            // App is open and focused, don't show notification
            return
          }
        }

        const data = event.data?.json() ?? {}
        const title = data.title || 'New Activity in Spliit'
        const message = data.body || 'Something happened in your group.'
        // The server writes paths from the root; under a base path they need it in front.
        const url = withBase(data.url || '/groups')
        const icon = withBase(data.icon || '/logo/192x192.png')
        const badge = withBase(data.badge || '/logo/96x96.png')

        const options = {
          body: message,
          icon: icon,
          badge: badge,
          data: {
            url: url,
          },
        }

        return self.registration.showNotification(title, options)
      }),
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      // Check if there is already a window open with this URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i]
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus()
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url)
      }
    }),
  )
})
