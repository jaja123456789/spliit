import type { AppRouter } from '@/trpc/routers/_app'
import type { inferRouterOutputs } from '@trpc/server'
import {
  archiveGroup,
  getArchivedGroups,
  getRecentGroups,
  getStarredGroups,
  saveRecentGroup,
  starGroup,
} from '../app/groups/recent-groups-helpers'

type RouterOutput = inferRouterOutputs<AppRouter>
type SyncedGroup = RouterOutput['sync']['listGroups'][number]

const SYNC_RESTORE_FLAG = 'sync-restore-complete'

/**
 * Sleep utility for exponential backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param attempts Number of retry attempts (default 3)
 * @returns Result of the function
 */
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i === attempts - 1) throw error
      // Exponential backoff: 1s, 2s, 4s
      await sleep(Math.pow(2, i) * 1000)
    }
  }
  throw new Error('fetchWithRetry: All attempts failed')
}

/**
 * Merge server groups with local groups
 * Server data wins for conflicts on the same groupId
 */
function mergeGroups(
  localRecent: { id: string; name: string }[],
  localStarred: string[],
  localArchived: string[],
  serverGroups: SyncedGroup[],
) {
  const mergedRecent: { id: string; name: string }[] = []
  const mergedStarred: string[] = []
  const mergedArchived: string[] = []
  const allGroupsToSync: {
    groupId: string
    isStarred?: boolean
    isArchived?: boolean
    activeParticipantId?: string
  }[] = []

  // Track processed groups to avoid duplicates
  const processedGroupIds = new Set<string>()

  // Process server groups first (they win conflicts)
  for (const serverGroup of serverGroups) {
    const { groupId, group, isStarred, isArchived } = serverGroup

    // Add to recent groups
    mergedRecent.push({ id: groupId, name: group.name })

    // Add to starred/archived if applicable
    if (isStarred) {
      mergedStarred.push(groupId)
    }
    if (isArchived) {
      mergedArchived.push(groupId)
    }

    processedGroupIds.add(groupId)
  }

  // Process local groups that aren't on server
  for (const localGroup of localRecent) {
    if (!processedGroupIds.has(localGroup.id)) {
      mergedRecent.push(localGroup)

      // Preserve local starred/archived state
      const isLocalStarred = localStarred.includes(localGroup.id)
      const isLocalArchived = localArchived.includes(localGroup.id)

      if (isLocalStarred) {
        mergedStarred.push(localGroup.id)
      }
      if (isLocalArchived) {
        mergedArchived.push(localGroup.id)
      }

      // Add to groups to sync (for syncExisting)
      allGroupsToSync.push({
        groupId: localGroup.id,
        isStarred: isLocalStarred,
        isArchived: isLocalArchived,
      })

      processedGroupIds.add(localGroup.id)
    }
  }

  return {
    recentGroups: mergedRecent,
    starredGroups: mergedStarred,
    archivedGroups: mergedArchived,
    allGroupsToSync,
  }
}

/**
 * Main restore function - called after sign-in
 * Fetches synced groups from server and merges with local state
 */
export async function restoreFromServer(
  listGroupsFn: () => Promise<SyncedGroup[]>,
  getPreferencesFn: () => Promise<{
    syncExisting: boolean
    syncNewGroups: boolean
  }>,
  syncAllFn: (input: {
    groups: Array<{
      groupId: string
      isStarred?: boolean
      isArchived?: boolean
      activeParticipantId?: string
    }>
  }) => Promise<{ synced: number; skipped: number }>,
): Promise<void> {
  try {
    // 1. Capture current localStorage state (pre-restore)
    const localRecent = getRecentGroups()
    const localStarred = getStarredGroups()
    const localArchived = getArchivedGroups()

    // 2. Fetch from server with retry logic (3 attempts, exponential backoff)
    const serverGroups = await fetchWithRetry(() => listGroupsFn())

    // 3. Merge (server wins for conflicts on same groupId)
    const merged = mergeGroups(
      localRecent,
      localStarred,
      localArchived,
      serverGroups,
    )

    // 4. Update localStorage with merged data
    // Clear existing data first
    localStorage.setItem('recentGroups', JSON.stringify([]))
    localStorage.setItem('starredGroups', JSON.stringify([]))
    localStorage.setItem('archivedGroups', JSON.stringify([]))

    // Populate with merged data
    for (const group of merged.recentGroups) {
      saveRecentGroup(group)
    }
    for (const groupId of merged.starredGroups) {
      starGroup(groupId)
    }
    for (const groupId of merged.archivedGroups) {
      archiveGroup(groupId)
    }

    // 5. Set restore completed flag
    localStorage.setItem(SYNC_RESTORE_FLAG, 'true')
  } catch (error) {
    // Log error but don't throw - restore failure shouldn't break the app
    console.error('Sync restore failed:', error)

    // Re-throw if it's a TRPCClientError for visibility
    if (error && typeof error === 'object' && 'data' in error) {
      throw error
    }
  }
}

/**
 * Clear the sync restore flag (called on sign-out)
 */
export function clearSyncRestoreFlag(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SYNC_RESTORE_FLAG)
  }
}

/**
 * Check if sync restore has been completed
 */
export function isSyncRestoreComplete(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(SYNC_RESTORE_FLAG) === 'true'
}

/**
 * Check if sync restore should be triggered
 * Returns true if user is signed in but restore hasn't completed
 */
export function shouldRestore(isSignedIn: boolean): boolean {
  return isSignedIn && !isSyncRestoreComplete()
}
