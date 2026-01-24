'use client'

import { useToast } from '@/components/ui/use-toast'
import { useGroupActions, useGroups } from '@/contexts'
import { useSession } from 'next-auth/react'
import { useCallback, useState } from 'react'

export function useGroupSync(groupId: string) {
  const { data: session } = useSession()
  const { toast } = useToast()
  const { isSynced } = useGroups()
  const { syncGroup, unsyncGroup } = useGroupActions()
  const [isLoading, setIsLoading] = useState(false)

  const groupIsSynced = isSynced(groupId)

  const toggleSync = useCallback(async () => {
    if (!session) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to sync groups',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    try {
      if (groupIsSynced) {
        await unsyncGroup(groupId)
        toast({
          title: 'Group unsynced',
          description: 'This group has been removed from sync',
        })
      } else {
        await syncGroup(groupId)
        toast({
          title: 'Group synced',
          description: 'This group is now synced to your account',
        })
      }
    } catch (error) {
      // Context already handles UNAUTHORIZED redirect
      // Other errors show toast
      toast({
        title: groupIsSynced ? 'Unsync failed' : 'Sync failed',
        description: 'Please try again',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [session, groupId, groupIsSynced, syncGroup, unsyncGroup, toast])

  return {
    isSynced: groupIsSynced,
    isLoading,
    toggleSync,
    canSync: !!session,
  }
}
