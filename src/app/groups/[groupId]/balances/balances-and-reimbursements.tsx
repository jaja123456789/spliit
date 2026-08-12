'use client'

import { BalancesList } from '@/app/groups/[groupId]/balances-list'
import { ReimbursementList } from '@/app/groups/[groupId]/reimbursement-list'
import { Money } from '@/components/money'
import { SheetHeader } from '@/components/sheet-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveUser } from '@/lib/hooks'
import { getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect } from 'react'
import { match } from 'ts-pattern'
import { useCurrentGroup } from '../current-group-context'

export default function BalancesAndReimbursements() {
  const utils = trpc.useUtils()
  const { groupId, group } = useCurrentGroup()
  const activeUserId = useActiveUser(groupId)
  const { data: balancesData, isLoading: balancesAreLoading } =
    trpc.groups.balances.list.useQuery({
      groupId,
    })
  const t = useTranslations('Balances')
  // "You are owed" / "You owe" already exist, worded for exactly this, on the Stats tab.
  const tStats = useTranslations('Stats.Totals')

  useEffect(() => {
    // Until we use tRPC more widely and can invalidate the cache on expense
    // update, it's easier and safer to invalidate the cache on page load.
    utils.groups.balances.invalidate()
  }, [utils])

  const isLoading = balancesAreLoading || !balancesData || !group
  const currency = group ? getCurrencyFromGroup(group) : null

  // The header answers the question the screen exists for, so it needs the reader's own balance —
  // not the group's. Without an active user there is no "you", and the sheet falls back to naming
  // itself.
  const yourBalance =
    activeUserId && balancesData
      ? balancesData.balances[activeUserId]?.total ?? 0
      : undefined
  const isSettled = yourBalance !== undefined && yourBalance === 0

  return (
    <Card className="mb-4">
      {/* One sheet, not two cards. "Balances" and "Suggested reimbursements" are two views of the
          same arithmetic — a heading, a paragraph and a second border between them made them look
          like unrelated screens that happened to share a tab. */}
      <SheetHeader
        label={
          yourBalance === undefined
            ? t('title')
            : isSettled
            ? t('allSettled')
            : tStats(yourBalance > 0 ? 'yourBalance' : 'youOwe')
        }
        figure={
          isLoading || !currency ? (
            <Skeleton className="h-8 w-40" />
          ) : // `undefined`, not `null`: with nobody selected as "you" this sheet has no figure at
          // all, and `null` still renders the reserved box — a 38px empty band under the label.
          // Anyone who answered "I don't want to select anyone" saw it on every visit.
          yourBalance === undefined ? undefined : (
            <Money
              currency={currency}
              amount={Math.abs(yourBalance)}
              bold
              className={
                isSettled
                  ? 'text-muted-foreground'
                  : yourBalance > 0
                  ? 'text-credit'
                  : 'text-debt'
              }
            />
          )
        }
        context={
          isLoading ? (
            <Skeleton className="h-3.5 w-40" />
          ) : yourBalance === undefined ? (
            t('description')
          ) : (
            t('headerContext', {
              people: group.participants.length,
              toSettle: balancesData.reimbursements.length,
            })
          )
        }
      />
      <CardContent className="px-4 sm:px-6 pb-2">
        {isLoading ? (
          <BalancesLoading participantCount={group?.participants.length} />
        ) : (
          <BalancesList
            balances={balancesData.balances}
            participants={group.participants}
            currency={getCurrencyFromGroup(group)}
            groupId={groupId}
          />
        )}
      </CardContent>

      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-5 pb-1">
        <span className="font-mono text-xs uppercase tracking-[0.14em] text-subtle-foreground">
          {t('Reimbursements.title')}
        </span>
        {/* Recording a payment used to be reachable only from a suggested-reimbursement row, so a
            settled group offered no way to record one — which is precisely the moment you want to
            record the payment that settled it. */}
        <Button variant="outline" size="sm" asChild className="h-8">
          <Link href={`/groups/${groupId}/payments/create`}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t('recordPayment')}
          </Link>
        </Button>
      </div>
      <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
        {isLoading ? (
          <ReimbursementsLoading
            participantCount={group?.participants.length}
          />
        ) : (
          <ReimbursementList
            reimbursements={balancesData.reimbursements}
            participants={group.participants}
            currency={getCurrencyFromGroup(group)}
            groupId={groupId}
          />
        )}
      </CardContent>
    </Card>
  )
}

const ReimbursementsLoading = ({
  participantCount = 3,
}: {
  participantCount?: number
}) => {
  return (
    <div className="flex flex-col">
      {Array(participantCount - 1)
        .fill(undefined)
        .map((_, index) => (
          <div key={index} className="flex justify-between py-5">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
    </div>
  )
}

/**
 * The balance rows with the content taken out, rather than a different shape that happens to be
 * grey. The previous version was a two-column grid left over from an older bar-chart layout; it
 * measured 17px shorter than the list it stood in for, so everything below it — the section rule,
 * the reimbursements, the footer — jumped when the data landed.
 */
const BalancesLoading = ({
  participantCount = 3,
}: {
  participantCount?: number
}) => {
  const nameWidth = (index: number) =>
    match(index % 3)
      .with(0, () => 'w-20')
      .with(1, () => 'w-16')
      .otherwise(() => 'w-24')

  return (
    <div className="flex flex-col gap-4">
      {Array(participantCount)
        .fill(undefined)
        .map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-[10px]" />
            <div className="flex flex-1 min-w-0 flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 h-5">
                <Skeleton className={`h-3.5 ${nameWidth(index)}`} />
                <Skeleton className="h-3.5 w-20" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
              <div className="h-4 flex items-center">
                <Skeleton className="h-3 w-14" />
              </div>
            </div>
          </div>
        ))}
    </div>
  )
}
