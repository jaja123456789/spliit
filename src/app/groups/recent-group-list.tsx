'use client'

import { AddGroupByUrlButton } from '@/app/groups/add-group-by-url-button'
import { RecentGroups } from '@/app/groups/recent-groups-helpers'
import { SyncFeatureAnnouncement } from '@/components/sync-feature-announcement'
import { SyncIndicator } from '@/components/sync-indicator'
import { Button } from '@/components/ui/button'
import { useGroups } from '@/contexts'
import { getGroups } from '@/lib/api'
import { trpc } from '@/trpc/client'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { Loader2 } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { PropsWithChildren } from 'react'
import { RecentGroupListCard } from './recent-group-list-card'

export type RecentGroupsState =
  | { status: 'pending' }
  | {
      status: 'partial'
      groups: RecentGroups
      starredGroups: string[]
      archivedGroups: string[]
    }
  | {
      status: 'complete'
      groups: RecentGroups
      groupsDetails: Awaited<ReturnType<typeof getGroups>>
      starredGroups: string[]
      archivedGroups: string[]
    }

function sortGroups({
  groups,
  starredGroups,
  archivedGroups,
}: {
  groups: RecentGroups
  starredGroups: Set<string>
  archivedGroups: Set<string>
}) {
  const starredGroupInfo = []
  const groupInfo = []
  const archivedGroupInfo = []
  for (const group of groups) {
    if (starredGroups.has(group.id)) {
      starredGroupInfo.push(group)
    } else if (archivedGroups.has(group.id)) {
      archivedGroupInfo.push(group)
    } else {
      groupInfo.push(group)
    }
  }
  return {
    starredGroupInfo,
    groupInfo,
    archivedGroupInfo,
  }
}

export function RecentGroupList() {
  const {
    recentGroups,
    starredGroupIds,
    archivedGroupIds,
    isRefetching,
    isPending,
  } = useGroups()

  if (isPending && recentGroups.length === 0) return null

  return (
    <RecentGroupList_
      groups={recentGroups}
      starredGroups={starredGroupIds}
      archivedGroups={archivedGroupIds}
      isRefetching={isRefetching}
    />
  )
}

function RecentGroupList_({
  groups,
  starredGroups,
  archivedGroups,
  isRefetching,
}: {
  groups: RecentGroups
  starredGroups: Set<string>
  archivedGroups: Set<string>
  isRefetching: boolean
}) {
  const t = useTranslations('Groups')
  const { data: session } = useSession()
  const { data, isLoading } = trpc.groups.list.useQuery({
    groupIds: groups.map((group) => group.id),
  })

  if (isLoading || !data) {
    return (
      <GroupsPage isRefetching={isRefetching}>
        <p>
          <Loader2 className="w-4 m-4 mr-2 inline animate-spin" />{' '}
          {t('loadingRecent')}
        </p>
      </GroupsPage>
    )
  }

  if (data.groups.length === 0) {
    return (
      <GroupsPage isRefetching={isRefetching}>
        <div className="text-sm space-y-2">
          <p>{t('NoRecent.description')}</p>
          {!session && (
            <p>
              <Button variant="link" asChild className="-m-4">
                <Link href="/settings" className="text-primary hover:underline">
                  Enable cloud sync
                </Link>
              </Button>{' '}
              to access your groups across devices.
            </p>
          )}
          <p>
            <Button variant="link" asChild className="-m-4">
              <Link href={`/groups/create`}>{t('NoRecent.create')}</Link>
            </Button>{' '}
            {t('NoRecent.orAsk')}
          </p>
        </div>
      </GroupsPage>
    )
  }

  const { starredGroupInfo, groupInfo, archivedGroupInfo } = sortGroups({
    groups,
    starredGroups,
    archivedGroups,
  })

  return (
    <GroupsPage isRefetching={isRefetching}>
      <SyncFeatureAnnouncement />

      {starredGroupInfo.length > 0 && (
        <>
          <h2 className="mb-2">{t('starred')}</h2>
          <GroupList groups={starredGroupInfo} groupDetails={data.groups} />
        </>
      )}

      {groupInfo.length > 0 && (
        <>
          <h2 className="mt-6 mb-2">{t('recent')}</h2>
          <GroupList groups={groupInfo} groupDetails={data.groups} />
        </>
      )}

      {archivedGroupInfo.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 opacity-50">{t('archived')}</h2>
          <div className="opacity-50">
            <GroupList groups={archivedGroupInfo} groupDetails={data.groups} />
          </div>
        </>
      )}
    </GroupsPage>
  )
}

function GroupList({
  groups,
  groupDetails,
}: {
  groups: RecentGroups
  groupDetails?: AppRouterOutput['groups']['list']['groups']
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {groups.map((group) => (
        <RecentGroupListCard
          key={group.id}
          group={group}
          groupDetail={groupDetails?.find(
            (groupDetail) => groupDetail.id === group.id,
          )}
        />
      ))}
    </ul>
  )
}

function GroupsPage({
  children,
  isRefetching,
}: PropsWithChildren<{ isRefetching?: boolean }>) {
  const t = useTranslations('Groups')
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="font-bold text-2xl flex-1">
          <Link href="/groups">{t('myGroups')}</Link>
        </h1>
        {isRefetching && <SyncIndicator />}
        <div className="flex gap-2">
          <AddGroupByUrlButton />
          <Button asChild>
            <Link href="/groups/create">{t('create')}</Link>
          </Button>
        </div>
      </div>
      <div>{children}</div>
    </>
  )
}
