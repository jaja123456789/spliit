'use client'

import { clearAllLocalGroupsData } from '@/app/groups/recent-groups-helpers'
import { useToast } from '@/components/ui/use-toast'
import { trpc } from '@/trpc/client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type PropsWithChildren,
} from 'react'
import {
  isUnauthorizedError,
  loadFromLocalStorage,
  mergeGroups,
  persistToLocalStorage,
} from './helpers'
import type { CoreGroupsContextValue, GroupsData } from './types'

const GroupsContext = createContext<CoreGroupsContextValue | null>(null)

const initialGroupsData: GroupsData = {
  recentGroups: [],
  starredGroupIds: new Set(),
  archivedGroupIds: new Set(),
  syncedGroupIds: new Set(),
  source: 'local-only',
}

export function useCoreGroupsContext(): CoreGroupsContextValue {
  const context = useContext(GroupsContext)
  if (!context) {
    throw new Error('useCoreGroupsContext must be used within a GroupsProvider')
  }
  return context
}

export function GroupsProvider({ children }: PropsWithChildren) {
  const { data: session, status: sessionStatus } = useSession()
  const utils = trpc.useUtils()
  const queryClient = useQueryClient()
  const router = useRouter()
  const { toast } = useToast()
  const t = useTranslations('Groups')

  // Query key
  const queryKey = useMemo(() => ['groups', 'list'], [])

  const _refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey })
  }, [queryClient, queryKey])

  // tRPC mutations
  const addGroupMutation = trpc.sync.addGroup.useMutation()
  const removeGroupMutation = trpc.sync.removeGroup.useMutation()
  const updateMetadataMutation = trpc.sync.updateMetadata.useMutation()
  const syncAllMutation = trpc.sync.syncAll.useMutation({
    onSuccess: () => {
      _refresh()
    },
  })

  const mutations = useMemo(
    () => ({
      addGroup: addGroupMutation,
      removeGroup: removeGroupMutation,
      updateMetadata: updateMetadataMutation,
      syncAll: syncAllMutation,
    }),
    [
      addGroupMutation,
      removeGroupMutation,
      updateMetadataMutation,
      syncAllMutation,
    ],
  )

  // Preferences query (for auto-sync)
  const preferencesQuery = trpc.sync.getPreferences.useQuery(undefined, {
    enabled: sessionStatus === 'authenticated',
  })

  // Load groups pipeline
  const { data: groupsData, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const localData = loadFromLocalStorage()

      if (sessionStatus !== 'authenticated') {
        return localData
      }

      try {
        const cloudGroups = await utils.sync.listGroups.fetch()
        return mergeGroups(localData, cloudGroups)
      } catch (error) {
        if (isUnauthorizedError(error)) {
          // If the token is invalid, we just return local data
          return localData
        }
        throw error
      }
    },
    // Don't run until we know the session status to avoid unnecessary fetches
    // or flashing content
    enabled: sessionStatus !== 'loading',
    placeholderData: initialGroupsData,
  })

  // Helper for optimistic cache update
  const updateOptimistic = useCallback(
    (updater: (old: GroupsData) => GroupsData) => {
      queryClient.setQueryData<GroupsData>(queryKey, (old) => {
        const newData = updater(old || initialGroupsData)
        persistToLocalStorage(newData)
        return newData
      })
    },
    [queryClient, queryKey],
  )

  // Session change effect: Sync local groups when logging in
  // We destructure `mutate` (as `syncAll`) to get a stable function reference.
  const { mutate: syncAll } = syncAllMutation

  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      // 1. Refresh to ensure we have the latest server data
      _refresh()

      // 2. Automatically sync any local groups to the account upon login
      const localData = loadFromLocalStorage()
      if (localData.recentGroups.length > 0) {
        // Map local groups to the schema expected by syncAllInputSchema
        const groupsToSync = localData.recentGroups.map((g) => ({
          groupId: g.id,
          isStarred: localData.starredGroupIds.has(g.id),
          isArchived: localData.archivedGroupIds.has(g.id),
        }))

        if (groupsToSync.length > 0) {
          syncAll({ groups: groupsToSync })
        }
      }
    }
  }, [sessionStatus, _refresh, syncAll])

  // Helper for sync errors
  const handleSyncError = useCallback(
    (error: unknown, fallbackMessage: string) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: t('Errors.unauthorized'),
          description: t('Errors.pleaseSignIn'),
          variant: 'destructive',
          action: (
            <button
              className="text-sm font-medium underline"
              onClick={() => router.push('/settings')}
            >
              {t('Errors.signIn')}
            </button>
          ),
        })
      } else {
        toast({
          title: t('Errors.generic'),
          description: fallbackMessage,
          variant: 'destructive',
        })
      }
    },
    [router, t, toast],
  )

  const _clearLocalData = useCallback(() => {
    clearAllLocalGroupsData()
    queryClient.setQueryData(queryKey, initialGroupsData)
  }, [queryClient, queryKey])

  const value = useMemo(
    () => ({
      // Robust fallback to prevent "Cannot read properties of undefined"
      groupsQuery: {
        data: groupsData ?? initialGroupsData,
        isLoading,
        error: null,
      } as any,
      queryKey,
      sessionStatus,
      updateOptimistic,
      handleSyncError,
      mutations,
      utils,
      preferencesQuery,
      _clearLocalData,
      _refresh,
    }),
    [
      groupsData,
      isLoading,
      queryKey,
      sessionStatus,
      updateOptimistic,
      handleSyncError,
      mutations,
      utils,
      preferencesQuery,
      _clearLocalData,
      _refresh,
    ],
  )

  return (
    <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>
  )
}