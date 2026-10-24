'use client'

import { useGroupBarSummary } from '@/app/groups/[groupId]/group-bar-summary'
import { GroupTabBar } from '@/app/groups/[groupId]/group-tab-bar'
import { GroupTabs } from '@/app/groups/[groupId]/group-tabs'
import { ShareButton } from '@/app/groups/[groupId]/share-button'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useCurrentGroup } from './current-group-context'

/**
 * A screen inside a group that is a task to finish rather than a place to go: the expense form,
 * the settle sheet. Its bar has a way out and says what the task is.
 *
 * The expense form had no exit on a phone at all. Its tab bar is hidden there by design, Cancel was
 * removed on the grounds that "the chevron and the device's own back button" were the exit, and no
 * chevron was ever built — an installed app on an iPhone has no browser toolbar either.
 */
function useTask(groupId: string) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('GroupBar')
  const tPayment = useTranslations('Payment')
  const rest = pathname.replace(/^\/groups\/[^/]+\/?/, '')
  if (rest === 'expenses/create')
    return { title: t('newExpense'), close: `/groups/${groupId}/expenses` }
  if (/^expenses\/[^/]+\/edit$/.test(rest))
    return { title: t('editExpense'), close: `/groups/${groupId}/expenses` }
  if (rest === 'payments/create')
    return {
      title: searchParams.get('from')
        ? tPayment('settleTitle')
        : tPayment('title'),
      close: `/groups/${groupId}/balances`,
    }
  return null
}

/**
 * The group's one bar: back to your groups, the group's name, Share. It replaces two — the app's own
 * header and, under it, the group's name row — which together took the first 124px of a phone.
 * Sticky, so the way back and the group's name never scroll away.
 */
export const GroupHeader = () => {
  const { isLoading, groupId, group } = useCurrentGroup()
  const t = useTranslations('GroupBar')
  const tHeader = useTranslations('Header')
  const task = useTask(groupId)
  const summary = useGroupBarSummary()

  return (
    <>
      {/* `-mt-6` pulls the bar up through the page's own top padding, so it sits flush with the top
          of the screen; `-mx-4` takes it to the edges on a phone. */}
      <div className="sticky top-0 z-40 -mx-4 -mt-6 flex h-14 items-center gap-1 border-b bg-background px-1.5">
        {task ? (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
          >
            <Link href={task.close} aria-label={t('close')}>
              <X className="h-5 w-5" />
            </Link>
          </Button>
        ) : (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
          >
            {/* Named "Groups", as the header's link to the same place was. */}
            <Link href="/groups" aria-label={tHeader('groups')}>
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
        )}

        <div className="min-w-0 flex-1 px-1">
          {task ? (
            <>
              <h1 className="truncate text-base font-semibold leading-tight">
                {task.title}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {isLoading ? '…' : group.name}
              </p>
            </>
          ) : (
            <>
              <h1 className="min-w-0 text-lg font-bold leading-tight">
                <Link href={`/groups/${groupId}`} className="block truncate">
                  {isLoading ? (
                    <Skeleton className="mt-1 mb-1 h-5 w-32" />
                  ) : (
                    group.name
                  )}
                </Link>
              </h1>
              {summary && (
                <p
                  className="truncate text-xs text-muted-foreground"
                  data-testid="group-bar-summary"
                >
                  {summary}
                </p>
              )}
            </>
          )}
        </div>

        {/* Share belongs to the group, so it sits beside the group's name, exactly once. */}
        {!task && group && <ShareButton group={group} quiet />}
      </div>

      {/* The strip is the navigation from `sm` up. Below that it is `GroupTabBar`. A task has
          neither: you finish it or close it. */}
      {!task && (
        <div className="hidden sm:flex">
          <GroupTabs groupId={groupId} />
        </div>
      )}
      <GroupTabBar groupId={groupId} />
    </>
  )
}
