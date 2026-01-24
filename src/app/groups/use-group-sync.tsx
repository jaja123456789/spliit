'use client'

import { useToast } from '@/components/ui/use-toast'
import { trpc } from '@/trpc/client'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useState } from 'react'

export function useGroupSync(groupId: string) {
  const { data: session } = useSession()
  const toast = useToast()
  const [isSynced, setIsSynced] = useState(false)

  // Query synced groups to check if this group is synced
  const { data: syncedGroups, refetch } = trpc.sync.listGroups.useQuery(
    undefined,
    {
      enabled: !!session,
    },
  )

  // Mutations
  const addGroup = trpc.sync.addGroup.useMutation({
    onSuccess: () => {
      refetch()
      toast.toast({
        title: 'Group synced',
        description: 'This group is now synced to your account',
      })
    },
    onError: (error) => {
      if (error.data?.code === 'UNAUTHORIZED') {
        toast.toast({
          title: 'Session expired',
          description: 'Please sign in again to sync groups',
          variant: 'destructive',
        })
      } else {
        toast.toast({
          title: 'Sync failed',
          description: error.message || 'Failed to sync group',
          variant: 'destructive',
        })
      }
    },
  })

  const removeGroup = trpc.sync.removeGroup.useMutation({
    onSuccess: () => {
      refetch()
      toast.toast({
        title: 'Group unsynced',
        description: 'This group has been removed from sync',
      })
    },
    onError: (error) => {
      if (error.data?.code === 'UNAUTHORIZED') {
        toast.toast({
          title: 'Session expired',
          description: 'Please sign in again',
          variant: 'destructive',
        })
      } else {
        toast.toast({
          title: 'Unsync failed',
          description: error.message || 'Failed to unsync group',
          variant: 'destructive',
        })
      }
    },
  })

  // Update synced status when data changes
  useEffect(() => {
    if (syncedGroups) {
      const synced = syncedGroups.some(
        (sg: { groupId: string }) => sg.groupId === groupId,
      )
      setIsSynced(synced)
    } else {
      setIsSynced(false)
    }
  }, [syncedGroups, groupId])

  const toggleSync = useCallback(
    async (isStarred = false, isArchived = false) => {
      if (!session) {
        toast.toast({
          title: 'Sign in required',
          description: 'Please sign in to sync groups',
          variant: 'destructive',
        })
        return
      }

      if (isSynced) {
        await removeGroup.mutateAsync({ groupId })
      } else {
        await addGroup.mutateAsync({ groupId, isStarred, isArchived })
      }
    },
    [session, isSynced, groupId, addGroup, removeGroup, toast],
  )

  return {
    isSynced,
    isLoading: addGroup.isPending || removeGroup.isPending,
    toggleSync,
    canSync: !!session,
  }
}
