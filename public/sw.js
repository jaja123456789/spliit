self.addEventListener('push', function (event) {
  if (!(self.Notification && self.Notification.permission === 'granted')) {
    return
  }

  const data = event.data?.json() ?? {}
  const title = data.title || 'New Activity in Spliit'
  const message = data.body || 'Something happened in your group.'
  const url = data.url || '/groups'
  const icon = data.icon || '/logo/192x192.png'
  const badge = data.badge || '/logo/96x96.png'

  const options = {
    body: message,
    icon: icon,
    badge: badge,
    data: {
      url: url,
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
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
