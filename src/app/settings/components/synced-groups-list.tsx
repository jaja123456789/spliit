'use client'

import { Button } from '@/components/ui/button'
import { trpc } from '@/trpc/client'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'

export function SyncedGroupsList() {
  const {
    data: syncedGroups,
    isLoading,
    refetch,
  } = trpc.sync.listGroups.useQuery()
  const removeGroup = trpc.sync.removeGroup.useMutation({
    onSuccess: () => {
      refetch()
    },
  })

  if (isLoading) {
    return <Loader2 className="w-4 h-4 animate-spin" />
  }

  if (!syncedGroups || syncedGroups.length === 0) {
    return <p className="text-sm text-muted-foreground">No synced groups yet</p>
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-3">
        {syncedGroups.length} group{syncedGroups.length !== 1 ? 's' : ''} synced
        to the cloud
      </p>
      <ul className="space-y-2">
        {syncedGroups.map(
          (syncedGroup: {
            groupId: string
            isStarred: boolean
            isArchived: boolean
            syncedAt: Date
            group: { id: string; name: string }
          }) => (
            <li
              key={syncedGroup.groupId}
              className="flex items-center justify-between p-3 bg-muted rounded-lg"
            >
              <div>
                <Link
                  href={`/groups/${syncedGroup.groupId}`}
                  className="font-medium hover:underline"
                >
                  {syncedGroup.group.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {syncedGroup.isStarred && '⭐ '}
                  {syncedGroup.isArchived && '📦 '}
                  Synced {new Date(syncedGroup.syncedAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  removeGroup.mutate({ groupId: syncedGroup.groupId })
                }
                disabled={removeGroup.isPending}
              >
                {removeGroup.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Unsync'
                )}
              </Button>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}
