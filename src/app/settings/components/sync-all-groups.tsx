'use client'

import { getRecentGroups } from '@/app/groups/recent-groups-helpers'
import { Button } from '@/components/ui/button'
import { trpc } from '@/trpc/client'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

export function SyncAllGroups() {
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{
    synced: number
    skipped: number
  } | null>(null)
  const syncAll = trpc.sync.syncAll.useMutation()

  const handleSyncAll = async () => {
    setSyncing(true)
    setSyncResult(null)

    try {
      const recentGroups = getRecentGroups()
      const starredGroups = JSON.parse(
        localStorage.getItem('starredGroups') || '[]',
      ) as string[]
      const archivedGroups = JSON.parse(
        localStorage.getItem('archivedGroups') || '[]',
      ) as string[]

      const groups = recentGroups.map((group) => ({
        groupId: group.id,
        isStarred: starredGroups.includes(group.id),
        isArchived: archivedGroups.includes(group.id),
      }))

      const result = await syncAll.mutateAsync({ groups, clearOmitList: true })
      setSyncResult(result)
    } catch (error) {
      console.error('Sync error:', error)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-4">
      <Button
        onClick={handleSyncAll}
        disabled={syncing}
        className="w-full sm:w-auto"
      >
        {syncing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Syncing...
          </>
        ) : (
          'Sync all groups now'
        )}
      </Button>

      {syncResult && (
        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm font-medium">
            Synced {syncResult.synced} group
            {syncResult.synced !== 1 ? 's' : ''}
          </p>
          {syncResult.skipped > 0 && (
            <p className="text-sm text-muted-foreground">
              Skipped {syncResult.skipped} group
              {syncResult.skipped !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
