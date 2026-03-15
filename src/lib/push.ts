import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'

// Initialize web-push with your keys
if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.EMAIL_FROM || 'noreply@example.com'}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
}

export async function sendPushNotificationToGroup(
  groupId: string,
  title: string,
  body: string,
  url: string,
  excludeParticipantId?: string,
) {
  if (!process.env.VAPID_PRIVATE_KEY) return

  // 1. Find all users synced to this group
  const syncedGroups = await prisma.syncedGroup.findMany({
    where: { groupId },
    include: {
      profile: {
        include: {
          user: {
            include: {
              pushSubscriptions: true,
            },
          },
        },
      },
    },
  })

  // 2. Aggregate subscriptions
  const subscriptions = syncedGroups
    .filter((sg) => sg.activeParticipantId != excludeParticipantId) // Don't notify the person who did the action
    .map((sg) => sg.profile.user)
    .flatMap((user) => user.pushSubscriptions)

  // 3. Send notifications
  const notifications = subscriptions.map((sub) => {
    const basePath = env.NEXT_PUBLIC_BASE_PATH

    const fullUrl = url.startsWith('http')
      ? url
      : `${env.NEXT_PUBLIC_BASE_URL}${env.NEXT_PUBLIC_BASE_PATH}${url}`

    const payload = JSON.stringify({
      title,
      body,
      url: fullUrl,
      // Inject paths here
      icon: `${basePath}/logo/192x192.png`,
      badge: `${basePath}/logo/96x96.png`,
    })
    return webpush
      .sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payload,
      )
      .catch((error) => {
        if (error.statusCode === 410 || error.statusCode === 404) {
          // Subscription is dead, delete it
          return prisma.pushSubscription.delete({ where: { id: sub.id } })
        }
        console.error('Error sending push notification', error)
      })
  })

  await Promise.all(notifications)
}
