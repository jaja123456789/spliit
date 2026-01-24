'use client'

import { Button } from '@/components/ui/button'
import { useGroupActions } from '@/contexts'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

export function SyncAllGroups() {
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{
    synced: number
    skipped: number
  } | null>(null)
  const { syncAllGroups } = useGroupActions()

  const handleSyncAll = async () => {
    setSyncing(true)
    setSyncResult(null)

    try {
      const result = await syncAllGroups()
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
