'use client'

import {
  RecentGroup,
  archiveGroup,
  deleteRecentGroup,
  starGroup,
  unarchiveGroup,
  unstarGroup,
} from '@/app/groups/recent-groups-helpers'
import { useGroupSync } from '@/app/groups/use-group-sync'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { trpc } from '@/trpc/client'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { StarFilledIcon } from '@radix-ui/react-icons'
import {
  Calendar,
  Cloud,
  CloudOff,
  Loader2,
  MoreHorizontal,
  Star,
  Users,
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function RecentGroupListCard({
  group,
  groupDetail,
  isStarred,
  isArchived,
  refreshGroupsFromStorage,
}: {
  group: RecentGroup
  groupDetail?: AppRouterOutput['groups']['list']['groups'][number]
  isStarred: boolean
  isArchived: boolean
  refreshGroupsFromStorage: () => void
}) {
  const router = useRouter()
  const locale = useLocale()
  const toast = useToast()
  const t = useTranslations('Groups')
  const { data: session } = useSession()
  const {
    isSynced,
    isLoading: isSyncLoading,
    toggleSync,
    canSync,
  } = useGroupSync(group.id)
  const [showUnsyncDialog, setShowUnsyncDialog] = useState(false)

  const handleRemoveRecent = (event: React.MouseEvent) => {
    event.stopPropagation()

    // If group is synced, show confirmation dialog
    if (isSynced) {
      setShowUnsyncDialog(true)
    } else {
      // Just remove from local storage
      deleteRecentGroup(group)
      refreshGroupsFromStorage()
      toast.toast({
        title: t('RecentRemovedToast.title'),
        description: t('RecentRemovedToast.description'),
      })
    }
  }

  const handleUnsyncAndRemove = async () => {
    // Unsync from server
    await toggleSync(isStarred, isArchived)

    // Remove from local storage
    deleteRecentGroup(group)
    refreshGroupsFromStorage()

    setShowUnsyncDialog(false)
    toast.toast({
      title: 'Group removed and unsynced',
      description:
        'The group has been removed from this device and unsynced from your account',
    })
  }

  const handleKeepSyncedAndRemove = () => {
    // Just remove from local storage, keep synced
    deleteRecentGroup(group)
    refreshGroupsFromStorage()

    setShowUnsyncDialog(false)
    toast.toast({
      title: t('RecentRemovedToast.title'),
      description: 'The group is still synced to your account',
    })
  }

  const handleToggleSync = async (event: React.MouseEvent) => {
    event.stopPropagation()
    await toggleSync(isStarred, isArchived)
  }

  // Mutation for updating metadata
  const updateMetadata = trpc.sync.updateMetadata.useMutation({
    onError: (error) => {
      // Silent error - local update already succeeded
      console.error('Failed to sync metadata:', error)
    },
  })

  return (
    <li key={group.id}>
      <Button
        variant="secondary"
        className="h-fit w-full py-3 rounded-lg border bg-card shadow-sm"
        asChild
      >
        <div
          className="text-base cursor-pointer"
          onClick={() => router.push(`/groups/${group.id}`)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              router.push(`/groups/${group.id}`)
            }
          }}
        >
          <div className="w-full flex flex-col gap-1">
            <div className="text-base flex gap-2 justify-between">
              <Link
                href={`/groups/${group.id}`}
                className="flex-1 overflow-hidden text-ellipsis flex items-center gap-2"
              >
                <span className="truncate">{group.name}</span>
              </Link>
              <span className="flex-shrink-0 flex items-center">
                {/* Sync toggle button - only show when logged in */}
                {canSync && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="-my-3 -ml-3 -mr-1.5"
                    onClick={handleToggleSync}
                    disabled={isSyncLoading}
                    title={isSynced ? 'Unsync from cloud' : 'Sync to cloud'}
                  >
                    {isSyncLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isSynced ? (
                      <Cloud className="w-4 h-4 text-blue-500" />
                    ) : (
                      <CloudOff className="w-4 h-4 text-muted-foreground" />
                    )}
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="-my-3 -ml-3 -mr-1.5"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (isStarred) {
                      unstarGroup(group.id)
                      // Sync to server if logged in and group is synced
                      if (session && isSynced) {
                        updateMetadata.mutate({
                          groupId: group.id,
                          isStarred: false,
                        })
                      }
                    } else {
                      starGroup(group.id)
                      unarchiveGroup(group.id)
                      // Sync to server if logged in and group is synced
                      if (session && isSynced) {
                        updateMetadata.mutate({
                          groupId: group.id,
                          isStarred: true,
                          isArchived: false,
                        })
                      }
                    }
                    refreshGroupsFromStorage()
                  }}
                >
                  {isStarred ? (
                    <StarFilledIcon className="w-4 h-4 text-orange-400" />
                  ) : (
                    <Star className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="-my-3 -mr-3 -ml-1.5"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={handleRemoveRecent}
                    >
                      {t('removeRecent')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(event) => {
                        event.stopPropagation()
                        if (isArchived) {
                          unarchiveGroup(group.id)
                          // Sync to server if logged in and group is synced
                          if (session && isSynced) {
                            updateMetadata.mutate({
                              groupId: group.id,
                              isArchived: false,
                            })
                          }
                        } else {
                          archiveGroup(group.id)
                          unstarGroup(group.id)
                          // Sync to server if logged in and group is synced
                          if (session && isSynced) {
                            updateMetadata.mutate({
                              groupId: group.id,
                              isArchived: true,
                              isStarred: false,
                            })
                          }
                        }
                        refreshGroupsFromStorage()
                      }}
                    >
                      {t(isArchived ? 'unarchive' : 'archive')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </div>
            <div className="text-muted-foreground font-normal text-xs">
              {groupDetail ? (
                <div className="w-full flex items-center justify-between">
                  <div className="flex items-center">
                    <Users className="w-3 h-3 inline mr-1" />
                    <span>{groupDetail._count.participants}</span>
                  </div>
                  <div className="flex items-center">
                    <Calendar className="w-3 h-3 inline mx-1" />
                    <span>
                      {new Date(groupDetail.createdAt).toLocaleDateString(
                        locale,
                        {
                          dateStyle: 'medium',
                        },
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-6 rounded-full" />
                  <Skeleton className="h-4 w-24 rounded-full" />
                </div>
              )}
            </div>
          </div>
        </div>
      </Button>

      {/* Confirmation dialog for removing synced group */}
      <AlertDialog open={showUnsyncDialog} onOpenChange={setShowUnsyncDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove synced group</AlertDialogTitle>
            <AlertDialogDescription>
              This group is synced to your account. What would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={handleKeepSyncedAndRemove}>
              Remove from device only
            </Button>
            <AlertDialogAction onClick={handleUnsyncAndRemove}>
              Remove and unsync
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}
