'use client'

import { restoreFromServer, shouldRestore } from '@/lib/sync-restore'
import { trpc } from '@/trpc/client'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

/**
 * SyncRestoreProvider - Automatically restores localStorage from server on sign-in
 *
 * This component:
 * 1. Checks if user is signed in via NextAuth session
 * 2. Checks if restore has already been completed
 * 3. If session exists but no restore flag → triggers restore
 * 4. Runs only once per session (restore flag prevents re-runs)
 */
export function SyncRestoreProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session, status } = useSession()
  const [restoreAttempted, setRestoreAttempted] = useState(false)

  const listGroups = trpc.sync.listGroups.useQuery(undefined, {
    enabled: false, // Don't auto-fetch, we'll trigger manually
  })

  const getPreferences = trpc.sync.getPreferences.useQuery(undefined, {
    enabled: false, // Don't auto-fetch, we'll trigger manually
  })

  const syncAll = trpc.sync.syncAll.useMutation()

  useEffect(() => {
    // Don't run on server
    if (typeof window === 'undefined') return

    // Wait for session to load
    if (status === 'loading') return

    // Only run once per mount
    if (restoreAttempted) return

    const isSignedIn = !!session?.user

    // Check if restore should be triggered
    if (shouldRestore(isSignedIn)) {
      setRestoreAttempted(true)

      // Run restore in background (don't block UI)
      restoreFromServer(
        () => listGroups.refetch().then((result) => result.data || []),
        () =>
          getPreferences
            .refetch()
            .then(
              (result) =>
                result.data || { syncExisting: false, syncNewGroups: false },
            ),
        (input) => syncAll.mutateAsync(input),
      )
        .then(() => {
          console.log('Sync restore completed successfully')
        })
        .catch((error) => {
          console.error('Sync restore failed:', error)
          // Restore failure is logged but doesn't break the app
        })
    }
  }, [session, status, restoreAttempted, listGroups, getPreferences, syncAll])

  return <>{children}</>
}
