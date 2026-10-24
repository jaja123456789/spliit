'use client'

import { BalancesList } from '@/app/groups/[groupId]/balances-list'
import { PaymentList } from '@/app/groups/[groupId]/payment-list'
import { ReimbursementList } from '@/app/groups/[groupId]/reimbursement-list'
import { SettleAllButton } from '@/app/groups/[groupId]/settle-all-button'
import { Money } from '@/components/money'
import { SheetHeader } from '@/components/sheet-header'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveUser } from '@/lib/hooks'
import { getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { match } from 'ts-pattern'
import { useCurrentGroup } from '../current-group-context'

/**
 * @param variant `panel` is the same sheet beside the expense list on a wide screen: who owes what
 * and the payments that would settle it, without the history of payments already made — that is
 * the Balances tab's to show, and beside a list it would only compete with it.
 */
export default function BalancesAndReimbursements({
  variant = 'page',
}: {
  variant?: 'page' | 'panel'
}) {
  const { groupId, group } = useCurrentGroup()
  const activeUserId = useActiveUser(groupId)
  const { data: balancesData, isLoading: balancesAreLoading } =
    trpc.groups.balances.list.useQuery({
      groupId,
    })
  const t = useTranslations('Balances')
  // "You are owed" / "You owe" already exist, worded for exactly this, on the Stats tab.
  const tStats = useTranslations('Stats.Totals')

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
    <Card bleed className="mb-4">
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
              headline
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

      <SectionRule>{t('Reimbursements.title')}</SectionRule>
      <CardContent className="px-4 sm:px-6 pb-0">
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
      {/* The batch action sits under the rows it acts on rather than beside the section's name.
          Above them it was an instruction with nothing yet to apply to; here it is the last line of
          a list, which is where "…and all of them" belongs. */}
      {!isLoading && balancesData.reimbursements.length > 1 && (
        <div className="mt-4 flex justify-end border-y bg-muted/40 px-4 py-2.5 sm:px-6">
          <SettleAllButton
            groupId={groupId}
            reimbursements={balancesData.reimbursements}
            participants={group.participants}
            activeUserId={activeUserId}
          />
        </div>
      )}

      {/* Money that already moved. Recording a payment used to be reachable only from a suggested
          reimbursement, so a settled group offered no way to record one — which is precisely the
          moment you want to record the payment that settled it. It lives here instead, where it is
          true whatever the balances say, and the payments themselves finally have somewhere to be
          other than italic rows among the expenses. */}
      {variant === 'page' ? (
        <>
          <SectionRule>{t('Payments.title')}</SectionRule>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            {isLoading || !currency ? (
              <PaymentsLoading />
            ) : (
              <PaymentList
                groupId={groupId}
                participants={group.participants}
                currency={currency}
              />
            )}
          </CardContent>
        </>
      ) : (
        <div className="h-4" />
      )}
    </Card>
  )
}

/**
 * The rule between two parts of one sheet. Not a heading of its own card — the whole point of the
 * sheet is that these are all views of the same arithmetic.
 */
const SectionRule = ({ children }: { children: React.ReactNode }) => (
  <div className="px-4 sm:px-6 pt-5 pb-1">
    <h3 className="section-label">{children}</h3>
  </div>
)

/** The reimbursement row with the content taken out: mark, two lines, figure, pill. */
const ReimbursementsLoading = ({
  participantCount = 3,
}: {
  participantCount?: number
}) => {
  return (
    <div className="flex flex-col">
      {Array(Math.max(participantCount - 1, 1))
        .fill(undefined)
        .map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 py-3 border-b last:border-0"
          >
            <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-7 w-16 shrink-0 rounded-full" />
          </div>
        ))}
    </div>
  )
}

const PaymentsLoading = () => (
  <div className="flex flex-col">
    <div className="flex items-center gap-3 py-3 border-b">
      <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-3.5 w-16" />
    </div>
    <Skeleton className="my-3 h-4 w-32" />
  </div>
)

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
