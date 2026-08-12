'use client'

import { AddGroupByUrlButton } from '@/app/groups/add-group-by-url-button'
import { RecentGroups } from '@/app/groups/recent-groups-helpers'
import { SyncFeatureAnnouncement } from '@/components/sync-feature-announcement'
import { SyncIndicator } from '@/components/sync-indicator'
import { Button } from '@/components/ui/button'
import { useGroups } from '@/contexts'
import { getGroups } from '@/lib/api'
import { readPendingShareImage } from '@/lib/share-target'
import { cn, formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { Loader2, Receipt } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PropsWithChildren, useEffect, useState } from 'react'
import { RecentGroupListCard } from './recent-group-list-card'
import { useGroupBalances } from './use-group-balances'

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
  const router = useRouter()
  const {
    recentGroups,
    starredGroupIds,
    archivedGroupIds,
    isRefetching,
    isPending,
  } = useGroups()

  // Tell the user why they were dropped here, instead of leaving a shared receipt waiting silently.
  const [hasPendingReceipt, setHasPendingReceipt] = useState(false)
  useEffect(() => {
    setHasPendingReceipt(!!readPendingShareImage())
  }, [])

  if (isPending && recentGroups.length === 0) return null

  return (
    <RecentGroupList_
      hasPendingReceipt={hasPendingReceipt}
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
  hasPendingReceipt,
}: {
  groups: RecentGroups
  starredGroups: Set<string>
  archivedGroups: Set<string>
  isRefetching: boolean
  hasPendingReceipt: boolean
}) {
  const t = useTranslations('Groups')
  const locale = useLocale()
  const { data: session } = useSession()
  const { data, isLoading } = trpc.groups.list.useQuery({
    groupIds: groups.map((group) => group.id),
  })
  // Above the early returns below: hooks cannot be called conditionally.
  const { balanceFor, total, coveredCount, isPartial } = useGroupBalances(
    groups.map((group) => group.id),
  )

  if (isLoading || !data) {
    return (
      <GroupsPage
        isRefetching={isRefetching}
        hasPendingReceipt={hasPendingReceipt}
      >
        <p>
          <Loader2 className="w-4 m-4 mr-2 inline animate-spin" />{' '}
          {t('loadingRecent')}
        </p>
      </GroupsPage>
    )
  }

  if (data.groups.length === 0) {
    return (
      <GroupsPage
        isRefetching={isRefetching}
        hasPendingReceipt={hasPendingReceipt}
      >
        <div className="text-sm space-y-2">
          <p>{t('NoRecent.description')}</p>
          {!session && (
            <p>
              <Button variant="link" asChild className="-m-4">
                <Link href="/settings" className="text-primary hover:underline">
                  {t('NoRecent.enableCloudSync')}
                </Link>
              </Button>{' '}
              {t('NoRecent.enableCloudSyncHelp')}
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

  // Cards come from this device's local list, but a group can disappear from under it — someone
  // else deletes it, or the link was stale to begin with. Only render what the server actually
  // returned, so a deleted group stops advertising itself on every other device. The local entry
  // is left alone rather than pruned: a transient failure to load should not wipe the list.
  const existingGroups = groups.filter((group) =>
    data.groups.some((serverGroup) => serverGroup.id === group.id),
  )

  const sortedGroups = [...existingGroups].sort((a, b) => {
    const detailsA = data.groups.find((g) => g.id === a.id)
    const detailsB = data.groups.find((g) => g.id === b.id)

    const timeA = detailsA?.updatedAt
      ? new Date(detailsA.updatedAt).getTime()
      : 0
    const timeB = detailsB?.updatedAt
      ? new Date(detailsB.updatedAt).getTime()
      : 0

    return timeB - timeA
  })

  const { starredGroupInfo, groupInfo, archivedGroupInfo } = sortGroups({
    groups: sortedGroups,
    starredGroups,
    archivedGroups,
  })

  return (
    <GroupsPage
      isRefetching={isRefetching}
      hasPendingReceipt={hasPendingReceipt}
    >
      {coveredCount > 0 && (
        <div className="mb-4 rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">
            {isPartial ? t('Overall.partial') : t('Overall.all')}
          </div>
          <div
            className={cn(
              'text-lg font-semibold tabular-nums',
              Math.abs(total) < 1
                ? 'text-muted-foreground'
                : total > 0
                ? 'text-credit'
                : 'text-debt',
            )}
          >
            {/* The one figure in the app not in the figure face. The amount is interpolated into a
                translated sentence ("You are owed {amount}") so that translators control the word
                order, and next-intl only accepts a string there — `t.rich` renders a ReactNode
                value at runtime but its own types forbid it, and all 23 locales carry `{amount}`,
                so switching the message to tag syntax would break the 22 that are translated. */}
            {Math.abs(total) < 1
              ? t('Overall.settled')
              : t(total > 0 ? 'Overall.owedToYou' : 'Overall.youOwe', {
                  amount: formatCurrency(
                    getCurrencyFromGroup(data.groups[0]),
                    Math.abs(total),
                    locale,
                  ),
                })}
          </div>
        </div>
      )}

      <SyncFeatureAnnouncement />

      {starredGroupInfo.length > 0 && (
        <>
          <h2 className="mb-2">{t('starred')}</h2>
          <GroupList
            groups={starredGroupInfo}
            groupDetails={data.groups}
            balanceFor={balanceFor}
          />
        </>
      )}

      {groupInfo.length > 0 && (
        <>
          <h2 className="mt-6 mb-2">{t('recent')}</h2>
          <GroupList
            groups={groupInfo}
            groupDetails={data.groups}
            balanceFor={balanceFor}
          />
        </>
      )}

      {archivedGroupInfo.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 opacity-50">{t('archived')}</h2>
          <div className="opacity-50">
            <GroupList
              groups={archivedGroupInfo}
              groupDetails={data.groups}
              balanceFor={balanceFor}
            />
          </div>
        </>
      )}
    </GroupsPage>
  )
}

function GroupList({
  groups,
  groupDetails,
  balanceFor,
}: {
  groups: RecentGroups
  groupDetails?: AppRouterOutput['groups']['list']['groups']
  balanceFor: (groupId: string) => number | undefined
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {groups.map((group) => {
        const detail = groupDetails?.find((d) => d.id === group.id)
        return (
          <RecentGroupListCard
            key={group.id}
            group={group}
            groupDetail={detail}
            balance={balanceFor(group.id)}
            currency={detail ? getCurrencyFromGroup(detail) : undefined}
          />
        )
      })}
    </ul>
  )
}

function GroupsPage({
  children,
  isRefetching,
  hasPendingReceipt,
}: PropsWithChildren<{
  isRefetching?: boolean
  hasPendingReceipt?: boolean
}>) {
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
      {hasPendingReceipt && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{t('sharedReceiptPending')}</span>
        </div>
      )}
      <div>{children}</div>
    </>
  )
}
