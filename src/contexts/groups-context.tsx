'use client'

import { clearAllLocalGroupsData, getArchivedGroups, getRecentGroups, getStarredGroups, RecentGroup, saveArchivedGroups, saveRecentGroups, saveStarredGroups } from '@/app/groups/recent-groups-helpers'
import { useToast } from '@/components/ui/use-toast'
import { trpc } from '@/trpc/client'
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { TRPCClientError } from '@trpc/client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'

// Zod schemas (existing in src/app/groups/recent-groups-helpers.ts)
// Types
export interface GroupsData {
  recentGroups: RecentGroup[]
  starredGroupIds: Set<string>
  archivedGroupIds: Set<string>
  syncedGroupIds: Set<string>
  source: 'local-only' | 'merged'
  syncError?: Error
}

// Type for cloud data (from listGroups procedure output)
interface SyncedGroup {
  groupId: string
  isStarred: boolean
  isArchived: boolean
  activeParticipantId: string | null
  syncedAt: Date
  group: { id: string; name: string }
}

export interface GroupActions {
  saveRecentGroup: (group: RecentGroup) => Promise<void>
  deleteRecentGroup: (groupId: string) => void
  starGroup: (groupId: string) => Promise<void>
  unstarGroup: (groupId: string) => Promise<void>
  archiveGroup: (groupId: string) => Promise<void>
  unarchiveGroup: (groupId: string) => Promise<void>
  syncGroup: (groupId: string) => Promise<void>
  unsyncGroup: (groupId: string) => Promise<void>
  syncAllGroups: () => Promise<{ synced: number; skipped: number }>
  refresh: () => void
  clearLocalData: () => void
}

export interface GroupsContextValue {
  groupsQuery: UseQueryResult<GroupsData>
  actions: GroupActions
}

// Load from localStorage helper
function loadFromLocalStorage(): GroupsData {
  try {
    const recentGroups = getRecentGroups()
    const starredGroups = getStarredGroups()
    const archivedGroups = getArchivedGroups()

    return {
      recentGroups,
      starredGroupIds: new Set(starredGroups),
      archivedGroupIds: new Set(archivedGroups),
      syncedGroupIds: new Set(),
      source: 'local-only',
    }
  } catch (error) {
    console.warn('Failed to load from localStorage:', error)
    return {
      recentGroups: [],
      starredGroupIds: new Set(),
      archivedGroupIds: new Set(),
      syncedGroupIds: new Set(),
      source: 'local-only',
    }
  }
}

// Merge groups helper (server wins for conflicts)
function mergeGroups(local: GroupsData, cloud: SyncedGroup[]): GroupsData {
  const merged: GroupsData = {
    recentGroups: [],
    starredGroupIds: new Set(),
    archivedGroupIds: new Set(),
    syncedGroupIds: new Set(),
    source: 'merged',
  }

  // Server groups first (they win conflicts)
  for (const serverGroup of cloud) {
    merged.recentGroups.push({
      id: serverGroup.groupId,
      name: serverGroup.group.name,
    })
    if (serverGroup.isStarred) merged.starredGroupIds.add(serverGroup.groupId)
    if (serverGroup.isArchived) merged.archivedGroupIds.add(serverGroup.groupId)
    merged.syncedGroupIds.add(serverGroup.groupId)
  }

  // Local-only groups preserved (not on server)
  for (const localGroup of local.recentGroups) {
    if(merged.recentGroups.find(g=>g.id === localGroup.id)) continue;
    merged.recentGroups.push(localGroup)
    if (local.starredGroupIds.has(localGroup.id)) {
      merged.starredGroupIds.add(localGroup.id)
    }
    if (local.archivedGroupIds.has(localGroup.id)) {
      merged.archivedGroupIds.add(localGroup.id)
    }
  }

  return merged
}

// Persist to localStorage helper
function persistToLocalStorage(data: GroupsData): void {
  saveRecentGroups(data.recentGroups);
  saveStarredGroups(Array.from(data.starredGroupIds));
  saveArchivedGroups(Array.from(data.archivedGroupIds));
}

/**
 * Check if an error is an UNAUTHORIZED tRPC error.
 * Useful for determining when to redirect to login.
 *
 * @param error - The error to check
 * @returns `true` if the error is a tRPC UNAUTHORIZED error
 * @example
 * ```tsx
 * try {
 *   await updateMetadata({ groupId, isStarred: true })
 * } catch (error) {
 *   if (isUnauthorizedError(error)) {
 *     router.push('/login')
 *   }
 * }
 * ```
 */
export function isUnauthorizedError(error: unknown): boolean {
  return (
    error instanceof TRPCClientError &&
    (error as TRPCClientError<any>).data?.code === 'UNAUTHORIZED'
  )
}

// Context
const GroupsContext = createContext<GroupsContextValue | null>(null)

// Internal hook
function useGroupsContext() {
  const context = useContext(GroupsContext)
  if (!context) {
    throw new Error('useGroupsContext must be used within a GroupsProvider')
  }
  return context
}

/**
 * Centralized state management for group data.
 *
 * Provides react-query based state for recent, starred, archived, and synced groups.
 * Uses localStorage as placeholderData for immediate render, then merges with cloud
 * data for authenticated users.
 *
 * @param props - Component props
 * @param props.children - Child components to wrap with group state
 * @example
 * ```tsx
 * // In layout.tsx
 * <GroupsProvider>
 *   {children}
 * </GroupsProvider>
 * ```
 */
export function GroupsProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession()
  const queryClient = useQueryClient()
  const utils = trpc.useUtils()
  const router = useRouter()
  const { toast } = useToast()

  // tRPC mutations
  const addGroupMutation = trpc.sync.addGroup.useMutation()
  const removeGroupMutation = trpc.sync.removeGroup.useMutation()
  const updateMetadataMutation = trpc.sync.updateMetadata.useMutation()
  const syncAllMutation = trpc.sync.syncAll.useMutation()

  // Preferences query (for auto-sync)
  const preferencesQuery = trpc.sync.getPreferences.useQuery(undefined, {
    enabled: sessionStatus === 'authenticated',
  })

  // Query key
  const queryKey = useMemo(
    () => ['groups', session?.user?.id ?? 'anonymous'],
    [session?.user?.id],
  )

  // Load groups pipeline
  const loadGroupsPipeline = useCallback(async (): Promise<GroupsData> => {
    const local = loadFromLocalStorage()

    if (sessionStatus !== 'authenticated') {
      return { ...local, source: 'local-only' }
    }

    try {
      const cloud = await utils.sync.listGroups.fetch()
      const merged = mergeGroups(local, cloud)
      persistToLocalStorage(merged)
      return { ...merged, source: 'merged' }
    } catch (error) {
      console.error('Cloud sync failed:', error)
      return { ...local, source: 'local-only', syncError: error as Error }
    }
  }, [sessionStatus, utils.sync.listGroups])

  const groupsQuery = useQuery({
    queryKey,
    queryFn: loadGroupsPipeline,
    enabled: sessionStatus !== 'loading',
    placeholderData: loadFromLocalStorage(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  // Session change effect
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      queryClient.removeQueries({ queryKey: ['groups'] })
    }
    if (sessionStatus !== 'loading') {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    }
  }, [sessionStatus, queryClient])

  // Helper for optimistic cache update
  const updateGroupsQueryOptimistic = useCallback(
    (updater: (old: GroupsData) => GroupsData) => {
      queryClient.setQueryData<GroupsData>(queryKey, (old) => {
        if (!old) return old
        const updated = updater(old)
        persistToLocalStorage(updated)
        return updated
      })
    },
    [queryClient, queryKey],
  )

  // Helper for sync errors
  const handleSyncError = useCallback(
    (error: unknown, fallbackMessage: string) => {
      if (isUnauthorizedError(error)) {
        router.push('/login')
      } else {
        toast({
          title: 'Sync failed',
          description: fallbackMessage,
          variant: 'destructive',
        })
      }
    },
    [router, toast],
  )

  // Action implementations
  const saveRecentGroup = useCallback(
    async (group: RecentGroup) => {
      // 1. Update cache + localStorage optimistically
      updateGroupsQueryOptimistic((old) => ({
        ...old,
        recentGroups: [
          group,
          ...old.recentGroups.filter((g) => g.id !== group.id),
        ],
      }))

      // 2. Auto-sync if conditions met
      if (
        sessionStatus === 'authenticated' &&
        preferencesQuery.data?.syncNewGroups &&
        !groupsQuery.data?.syncedGroupIds.has(group.id)
      ) {
        try {
          // Check if omitted first
          const isOmittedResult = await utils.sync.isOmitted.fetch({
            groupId: group.id,
          })
          if (isOmittedResult.omitted) return

          await addGroupMutation.mutateAsync({
            groupId: group.id,
            isStarred:
              groupsQuery.data?.starredGroupIds.has(group.id) ?? false,
            isArchived:
              groupsQuery.data?.archivedGroupIds.has(group.id) ?? false,
          })
          // Update cache to mark as synced
          updateGroupsQueryOptimistic((old) => {
            const newSynced = new Set(old.syncedGroupIds)
            newSynced.add(group.id)
            return {
              ...old,
              syncedGroupIds: newSynced,
            }
          })
        } catch (error) {
          handleSyncError(error, 'Group saved locally but not synced to cloud')
        }
      }
    },
    [
      sessionStatus,
      preferencesQuery.data,
      groupsQuery.data,
      updateGroupsQueryOptimistic,
      utils.sync.isOmitted,
      addGroupMutation,
      handleSyncError,
    ],
  )

  const deleteRecentGroup = useCallback(
    (groupId: string) => {
      updateGroupsQueryOptimistic((old) => ({
        ...old,
        recentGroups: old.recentGroups.filter((g) => g.id !== groupId),
      }))
    },
    [updateGroupsQueryOptimistic],
  )

  const starGroup = useCallback(
    async (groupId: string) => {
      // Update cache optimistically
      updateGroupsQueryOptimistic((old) => {
        const newStarred = new Set(old.starredGroupIds)
        newStarred.add(groupId)
        const newArchived = new Set(old.archivedGroupIds)
        newArchived.delete(groupId)
        return {
          ...old,
          starredGroupIds: newStarred,
          archivedGroupIds: newArchived,
        }
      })

      // If authenticated + synced → call sync.updateMetadata
      if (sessionStatus === 'authenticated' && groupsQuery.data?.syncedGroupIds.has(groupId)) {
        try {
          await updateMetadataMutation.mutateAsync({
            groupId,
            isStarred: true,
            isArchived: false,
          })
        } catch (error) {
          handleSyncError(error, 'Failed to sync star status to cloud')
        }
      }
    },
    [
      updateGroupsQueryOptimistic,
      sessionStatus,
      groupsQuery.data,
      updateMetadataMutation,
      handleSyncError,
    ],
  )

  const unstarGroup = useCallback(
    async (groupId: string) => {
      // Update cache optimistically
      updateGroupsQueryOptimistic((old) => {
        const newStarred = new Set(old.starredGroupIds)
        newStarred.delete(groupId)
        return {
          ...old,
          starredGroupIds: newStarred,
        }
      })

      // If authenticated + synced → call sync.updateMetadata
      if (session?.user && groupsQuery.data?.syncedGroupIds.has(groupId)) {
        try {
          await updateMetadataMutation.mutateAsync({
            groupId,
            isStarred: false,
          })
        } catch (error) {
          handleSyncError(error, 'Failed to sync unstar status to cloud')
        }
      }
    },
    [
      updateGroupsQueryOptimistic,
      session,
      groupsQuery.data,
      updateMetadataMutation,
      handleSyncError,
    ],
  )

  const archiveGroup = useCallback(
    async (groupId: string) => {
      // Update cache optimistically
      updateGroupsQueryOptimistic((old) => {
        const newStarred = new Set(old.starredGroupIds)
        newStarred.delete(groupId)
        const newArchived = new Set(old.archivedGroupIds)
        newArchived.add(groupId)
        return {
          ...old,
          starredGroupIds: newStarred,
          archivedGroupIds: newArchived,
        }
      })

      // If authenticated + synced → call sync.updateMetadata
      if (session?.user && groupsQuery.data?.syncedGroupIds.has(groupId)) {
        try {
          await updateMetadataMutation.mutateAsync({
            groupId,
            isStarred: false,
            isArchived: true,
          })
        } catch (error) {
          handleSyncError(error, 'Failed to sync archive status to cloud')
        }
      }
    },
    [
      updateGroupsQueryOptimistic,
      session,
      groupsQuery.data,
      updateMetadataMutation,
      handleSyncError,
    ],
  )

  const unarchiveGroup = useCallback(
    async (groupId: string) => {
      // Update cache optimistically
      updateGroupsQueryOptimistic((old) => {
        const newArchived = new Set(old.archivedGroupIds)
        newArchived.delete(groupId)
        return {
          ...old,
          archivedGroupIds: newArchived,
        }
      })

      // If authenticated + synced → call sync.updateMetadata
      if (session?.user && groupsQuery.data?.syncedGroupIds.has(groupId)) {
        try {
          await updateMetadataMutation.mutateAsync({
            groupId,
            isArchived: false,
          })
        } catch (error) {
          handleSyncError(error, 'Failed to sync unarchive status to cloud')
        }
      }
    },
    [
      updateGroupsQueryOptimistic,
      session,
      groupsQuery.data,
      updateMetadataMutation,
      handleSyncError,
    ],
  )

  const syncGroup = useCallback(
    async (groupId: string) => {
      const currentData = groupsQuery.data
      if (!currentData) return

      await addGroupMutation.mutateAsync({
        groupId,
        isStarred: currentData.starredGroupIds.has(groupId),
        isArchived: currentData.archivedGroupIds.has(groupId),
      })

      // Update cache: add to syncedGroupIds
      updateGroupsQueryOptimistic((old) => {
        const newSynced = new Set(old.syncedGroupIds)
        newSynced.add(groupId)
        return {
          ...old,
          syncedGroupIds: newSynced,
        }
      })
    },
    [groupsQuery.data, addGroupMutation, updateGroupsQueryOptimistic],
  )

  const unsyncGroup = useCallback(
    async (groupId: string) => {
      await removeGroupMutation.mutateAsync({ groupId })

      // Update cache: remove from syncedGroupIds
      updateGroupsQueryOptimistic((old) => {
        const newSynced = new Set(old.syncedGroupIds)
        newSynced.delete(groupId)
        return {
          ...old,
          syncedGroupIds: newSynced,
        }
      })
    },
    [removeGroupMutation, updateGroupsQueryOptimistic],
  )

  const syncAllGroups = useCallback(async () => {
    const currentData = groupsQuery.data
    if (!currentData) return { synced: 0, skipped: 0 }

    const groups = currentData.recentGroups.map((group) => ({
      groupId: group.id,
      isStarred: currentData.starredGroupIds.has(group.id),
      isArchived: currentData.archivedGroupIds.has(group.id),
    }))

    const result = await syncAllMutation.mutateAsync({ groups })

    // Update cache with all synced groups
    updateGroupsQueryOptimistic((old) => ({
      ...old,
      syncedGroupIds: new Set(groups.map((g) => g.groupId)),
    }))

    return result
  }, [groupsQuery.data, syncAllMutation, updateGroupsQueryOptimistic])

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['groups'] })
  }, [queryClient])

  const clearLocalData = useCallback(() => {
    // Clear localStorage
    clearAllLocalGroupsData()

    // Clear react-query cache for groups
    queryClient.removeQueries({ queryKey: ['groups'] })
  }, [queryClient])

  // Combine all actions
  const actions = useMemo<GroupActions>(
    () => ({
      saveRecentGroup,
      deleteRecentGroup,
      starGroup,
      unstarGroup,
      archiveGroup,
      unarchiveGroup,
      syncGroup,
      unsyncGroup,
      syncAllGroups,
      refresh,
      clearLocalData,
    }),
    [
      saveRecentGroup,
      deleteRecentGroup,
      starGroup,
      unstarGroup,
      archiveGroup,
      unarchiveGroup,
      syncGroup,
      unsyncGroup,
      syncAllGroups,
      refresh,
      clearLocalData,
    ],
  )

  const value = useMemo(
    () => ({ groupsQuery, actions }),
    [groupsQuery, actions],
  )

  return (
    <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>
  )
}

/**
 * Hook to access group state.
 *
 * Provides access to group data, loading states, and helper functions to check
 * if a group is starred, archived, or synced.
 *
 * @returns Group data and query state
 * @example
 * ```tsx
 * const { recentGroups, isStarred, isSynced, isRefetching } = useGroups()
 *
 * // Check if a specific group is starred
 * if (isStarred('group-123')) {
 *   // Render star icon
 * }
 *
 * // Access all recent groups
 * recentGroups.map(group => <GroupCard key={group.id} group={group} />)
 * ```
 */
export function useGroups() {
  const { groupsQuery } = useGroupsContext()
  const data = groupsQuery.data!

  return {
    recentGroups: data.recentGroups,
    starredGroupIds: data.starredGroupIds,
    archivedGroupIds: data.archivedGroupIds,
    syncedGroupIds: data.syncedGroupIds,
    isPending: groupsQuery.isPending,
    isSuccess: groupsQuery.isSuccess,
    isRefetching: groupsQuery.isRefetching,
    syncError: data.syncError,
    isStarred: (groupId: string) => data.starredGroupIds.has(groupId),
    isArchived: (groupId: string) => data.archivedGroupIds.has(groupId),
    isSynced: (groupId: string) => data.syncedGroupIds.has(groupId),
  }
}

/**
 * Hook to access group mutation actions.
 *
 * Provides actions to modify group state. All actions automatically handle:
 * - Optimistic cache updates
 * - localStorage persistence
 * - Cloud sync for authenticated users
 *
 * @returns Actions to modify group state
 * @example
 * ```tsx
 * const { starGroup, saveRecentGroup, syncGroup } = useGroupActions()
 *
 * // Star a group (updates cache + localStorage + cloud)
 * await starGroup('group-123')
 *
 * // Save a recently visited group
 * await saveRecentGroup({ id: 'group-123', name: 'Trip to Paris' })
 *
 * // Manually sync a group to the cloud
 * await syncGroup('group-123')
 * ```
 */
export function useGroupActions() {
  const { actions } = useGroupsContext()
  return actions
}
