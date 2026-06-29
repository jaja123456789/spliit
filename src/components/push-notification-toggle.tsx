'use client'
import { useEnv } from '@/components/env-provider'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import { trpc } from '@/trpc/client'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function PushNotificationToggle({
  vapidKey,
}: {
  vapidKey: string | undefined
}) {
  const { NEXT_PUBLIC_BASE_PATH } = useEnv() // Get runtime value
  const [isSupported, setIsSupported] = useState(false)
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()
  const subscribeMutation = trpc.push.subscribe.useMutation()
  const unsubscribeMutation = trpc.push.unsubscribe.useMutation()

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true)
      registerServiceWorker()
    } else {
      setLoading(false)
    }
  }, [])

  const registerServiceWorker = async () => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
    try {
      const registration = await navigator.serviceWorker.register(
        `${NEXT_PUBLIC_BASE_PATH}/sw.js`,
        {
          scope: `${NEXT_PUBLIC_BASE_PATH}/`,
          updateViaCache: 'none',
        },
      )
      const sub = await registration.pushManager.getSubscription()
      setSubscription(sub)
    } catch (error) {
      console.error('Service Worker registration failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const subscribe = async () => {
    setLoading(true)
    try {
      if (!('Notification' in window)) {
        throw new Error('Notifications API not supported')
      }

      let permission = Notification.permission
      if (permission === 'default') {
        permission = await Notification.requestPermission()
      }

      if (permission !== 'granted') {
        throw new Error(`Notification permission is ${permission}`)
      }

      const registration = await navigator.serviceWorker.ready

      if (!vapidKey) {
        throw new Error('VAPID public key not found')
      }

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      // Send to server
      const json = sub.toJSON()
      if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
        await subscribeMutation.mutateAsync({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
        })
        setSubscription(sub)
        toast({
          title: 'Notifications enabled',
          description: 'You will now receive updates for your groups.',
        })
      }
    } catch (error) {
      console.error('Failed to subscribe:', error)
      const permissionState =
        typeof Notification !== 'undefined'
          ? Notification.permission
          : 'unsupported'
      toast({
        title: 'Error',
        description:
          permissionState === 'denied'
            ? 'Notifications are blocked for this site. Allow them in browser settings and try again.'
            : permissionState === 'default'
              ? 'Notification permission was not granted.'
              : 'Failed to enable notifications.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const unsubscribe = async () => {
    if (!subscription) return
    setLoading(true)
    try {
      // 1. Unsubscribe in browser
      await subscription.unsubscribe()

      // 2. Unsubscribe in DB (Clean up)
      await unsubscribeMutation.mutateAsync({
        endpoint: subscription.endpoint,
      })

      setSubscription(null)
      toast({
        title: 'Notifications disabled',
      })
    } catch (error) {
      console.error('Error unsubscribing', error)
      toast({
        title: 'Error',
        description: 'Failed to disable notifications.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  if (!isSupported) return null

  return (
    <div className="flex items-center justify-between space-x-2">
      <div className="flex-1">
        <Label
          htmlFor="push-notifs"
          className="font-medium flex items-center gap-2"
        >
          {subscription ? (
            <Bell className="w-4 h-4" />
          ) : (
            <BellOff className="w-4 h-4" />
          )}
          Push Notifications
        </Label>
        <p className="text-sm text-muted-foreground">
          Get notified when someone adds an expense.
        </p>
      </div>
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Switch
          id="push-notifs"
          disabled={loading || (!subscription && !vapidKey)}
          checked={!!subscription}
          onCheckedChange={(checked) => (checked ? subscribe() : unsubscribe())}
        />
      )}
    </div>
  )
}
