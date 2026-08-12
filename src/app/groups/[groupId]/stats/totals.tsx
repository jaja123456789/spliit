'use client'
import { TotalsFigure } from '@/app/groups/[groupId]/stats/totals-figure'
import { Money } from '@/components/money'
import { SheetHeader } from '@/components/sheet-header'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveUser } from '@/lib/hooks'
import { getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { useCurrentGroup } from '../current-group-context'

/**
 * The head of the stats sheet and the rows under it.
 *
 * The group total leads, as it does on the expenses sheet, and the personal figures follow as ruled
 * rows. It used to be four equally-weighted label/figure pairs under a header that said "Totals"
 * over "Spending summary of the entire group." — three lines of chrome above the first number.
 */
export function Totals() {
  const { groupId, group } = useCurrentGroup()
  const activeUser = useActiveUser(groupId)
  const t = useTranslations('Stats.Totals')

  const participantId = activeUser ?? undefined
  const { data } = trpc.groups.stats.get.useQuery({ groupId, participantId })
  // Read the balance from the same query the Balances tab renders, rather than recomputing it.
  // Balances count reimbursements and these spending figures don't, so a locally derived
  // `paid - share` would be the balance from before anyone settled up and the two tabs would
  // disagree about who owes what.
  const { data: balancesData } = trpc.groups.balances.list.useQuery({ groupId })

  const ready = !!data && !!group
  const currency = group ? getCurrencyFromGroup(group) : null
  const balance = participantId
    ? balancesData?.balances[participantId]?.total
    : undefined

  return (
    <>
      <SheetHeader
        label={t('groupTotal')}
        figureTestId="total-group-spendings"
        figure={
          ready && currency ? (
            <Money currency={currency} amount={data.totalGroupSpendings} bold />
          ) : (
            <Skeleton className="h-8 w-40" />
          )
        }
        context={ready ? t('description') : <Skeleton className="h-3.5 w-48" />}
      />
      <div className="px-4 sm:px-6 pb-2">
        {!ready || !currency ? (
          <div className="flex flex-col">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="flex items-baseline justify-between gap-4 border-b last:border-b-0 py-3 h-[46px]"
              >
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : (
          participantId && (
            <>
              <TotalsFigure
                label={t('youPaid')}
                amount={data.totalParticipantSpendings ?? 0}
                currency={currency}
                testId="your-total-spendings"
              />
              <TotalsFigure
                label={t('yourShare')}
                amount={data.totalParticipantShare ?? 0}
                currency={currency}
                testId="your-total-share"
              />
              {balance !== undefined && (
                <TotalsFigure
                  label={balance < 0 ? t('youOwe') : t('yourBalance')}
                  hint={t('balanceHint')}
                  amount={balance}
                  currency={currency}
                  tone="balance"
                  testId="your-balance"
                />
              )}
            </>
          )
        )}
      </div>
    </>
  )
}
