'use client'

import { getRecentGroups } from '@/app/groups/recent-groups-helpers'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Arriving at "/" from inside the app, where the root layout's inline script (`skipLandingScript`)
 * does not run: a browser that already has groups goes to them rather than to the front page.
 */
export function SkipLanding() {
  const router = useRouter()
  useEffect(() => {
    try {
      if (getRecentGroups().length > 0) router.replace('/groups')
    } catch {
      // Unreadable storage: show the front page, as for a first visit.
    }
  }, [router])
  return null
}
