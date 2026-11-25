'use client'

import { Button } from '@/components/ui/button'
import { forgetActiveUserIfGone } from '@/lib/active-user'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { PropsWithChildren, useEffect } from 'react'
import { CurrentGroupProvider } from './current-group-context'
import { GroupBarSummaryProvider } from './group-bar-summary'
import { GroupHeader } from './group-header'
import { SaveGroupLocally } from './save-recent-group'

export function GroupLayoutClient({
  groupId,
  children,
}: PropsWithChildren<{ groupId: string }>) {
  const { data, isLoading } = trpc.groups.get.useQuery({ groupId })
  const t = useTranslations('Groups.NotFound')

  // On every page of the group, not only where the identity question is asked: Balances, a payment
  // and a comment all act as "you", and a removed participant cannot.
  const participantIds = data?.group?.participants.map((p) => p.id).join(',')
  useEffect(() => {
    if (participantIds !== undefined)
      forgetActiveUserIfGone(groupId, participantIds.split(','))
  }, [groupId, participantIds])

  // A group can genuinely disappear — deletion shipped, and a shared link can be stale. This used
  // to render the whole group: header, tab strip, an Expenses tab, a Balances tab, all of them
  // empty, with a red toast that scrolled away after a few seconds. Say it on the page instead,
  // and offer the one thing that can still be done from here.
  if (data && !data.group) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('description')}</p>
        <Button asChild className="mt-6">
          <Link href="/groups">{t('link')}</Link>
        </Button>
      </div>
    )
  }

  const props =
    isLoading || !data?.group
      ? { isLoading: true as const, groupId, group: undefined }
      : { isLoading: false as const, groupId, group: data.group }

  if (isLoading) {
    return (
      <CurrentGroupProvider {...props}>
        <GroupBarSummaryProvider>
          <GroupHeader />
          {children}
          <TabBarClearance />
        </GroupBarSummaryProvider>
      </CurrentGroupProvider>
    )
  }

  return (
    <CurrentGroupProvider {...props}>
      <GroupBarSummaryProvider>
        <GroupHeader />
        {children}
        <TabBarClearance />
        <SaveGroupLocally />
      </GroupBarSummaryProvider>
    </CurrentGroupProvider>
  )
}

/**
 * The bottom bar is fixed, so the page has to end above it or the last row is unreachable. Matches
 * the bar's own height plus whatever the device reserves for its home indicator.
 */
const TabBarClearance = () => (
  <div
    aria-hidden="true"
    className="h-[calc(3.5rem+env(safe-area-inset-bottom))] sm:hidden"
  />
)
