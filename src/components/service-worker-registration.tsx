'use client'
import { useEnv } from '@/components/env-provider'
import { useEffect } from 'react'

/**
 * Installs the service worker for everyone, not only for those who turn notifications on: it is
 * also what lets the app open without a network (see `public/sw.js`). Production only — in
 * development it would serve yesterday's hot-reloaded code.
 */
export function ServiceWorkerRegistration() {
  const { NEXT_PUBLIC_BASE_PATH } = useEnv()

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .register(`${NEXT_PUBLIC_BASE_PATH}/sw.js`, {
        scope: `${NEXT_PUBLIC_BASE_PATH}/`,
        updateViaCache: 'none',
      })
      .catch((error) => console.error('Service worker not installed:', error))
  }, [NEXT_PUBLIC_BASE_PATH])

  return null
}
