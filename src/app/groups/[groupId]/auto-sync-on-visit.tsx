'use client'

import { trpc } from '@/trpc/client'
import { useSession } from 'next-auth/react'
import { useEffect, useRef } from 'react'

/**
 * AutoSyncOnVisit - Automatically syncs a group when visited for the first time
 *
 * This component:
 * 1. Checks if user is signed in
 * 2. Checks if syncNewGroups preference is enabled
 * 3. Checks if group is not in omitted list
 * 4. If all conditions met → syncs the group automatically
 * 5. Runs only once per mount (using ref to prevent re-runs)
 */
export function AutoSyncOnVisit({
  groupId,
  isStarred = false,
  isArchived = false,
}: {
  groupId: string
  isStarred?: boolean
  isArchived?: boolean
}) {
  const { data: session } = useSession()
  const hasAttemptedSync = useRef(false)

  const { data: preferences } = trpc.sync.getPreferences.useQuery(undefined, {
    enabled: !!session,
  })

  const { data: omittedData } = trpc.sync.isOmitted.useQuery(
    { groupId },
    { enabled: !!session },
  )

  const { data: syncedGroups } = trpc.sync.listGroups.useQuery(undefined, {
    enabled: !!session,
  })

  const addGroup = trpc.sync.addGroup.useMutation()

  useEffect(() => {
    // Don't run on server
    if (typeof window === 'undefined') return

    // Only run once per mount
    if (hasAttemptedSync.current) return

    // Need session
    if (!session) return

    // Need preferences loaded
    if (!preferences) return

    // Need syncNewGroups enabled
    if (!preferences.syncNewGroups) return

    // Need omitted data loaded
    if (omittedData === undefined) return

    // Don't sync if group is omitted
    if (omittedData.omitted) return

    // Don't sync if already synced
    const alreadySynced = syncedGroups?.some(
      (sg: { groupId: string }) => sg.groupId === groupId,
    )
    if (alreadySynced) return

    // All conditions met - auto-sync this group
    hasAttemptedSync.current = true

    addGroup
      .mutateAsync({
        groupId,
        isStarred,
        isArchived,
      })
      .then(() => {
        console.log(`Auto-synced group ${groupId}`)
      })
      .catch((error) => {
        console.error('Auto-sync failed:', error)
        // Failure is logged but doesn't break the app
      })
  }, [
    session,
    preferences,
    omittedData,
    syncedGroups,
    groupId,
    isStarred,
    isArchived,
    addGroup,
  ])

  // This component doesn't render anything
  return null
}
