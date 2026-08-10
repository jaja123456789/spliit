'use client'
import { TotalsFigure } from '@/app/groups/[groupId]/stats/totals-figure'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveUser } from '@/lib/hooks'
import { getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { useCurrentGroup } from '../current-group-context'

export function Totals() {
  const { groupId, group } = useCurrentGroup()
  const activeUser = useActiveUser(groupId)
  const t = useTranslations('Stats.Totals')

  const participantId =
    activeUser && activeUser !== 'None' ? activeUser : undefined
  const { data } = trpc.groups.stats.get.useQuery({ groupId, participantId })
  // Read the balance from the same query the Balances tab renders, rather than recomputing it.
  // Balances count reimbursements and these spending figures don't, so a locally derived
  // `paid - share` would be the balance from before anyone settled up and the two tabs would
  // disagree about who owes what.
  const { data: balancesData } = trpc.groups.balances.list.useQuery({ groupId })

  if (!data || !group)
    return (
      <div className="grid gap-4">
        {[0, 1, 2].map((index) => (
          <div key={index}>
            <Skeleton className="mt-1 h-3 w-48" />
            <Skeleton className="mt-3 h-4 w-20" />
          </div>
        ))}
      </div>
    )

  const currency = getCurrencyFromGroup(group)
  const balance = participantId
    ? balancesData?.balances[participantId]?.total
    : undefined

  return (
    <div className="grid gap-4">
      <TotalsFigure
        label={t('groupTotal')}
        amount={data.totalGroupSpendings}
        currency={currency}
        testId="total-group-spendings"
      />
      {participantId && (
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
            <div className="border-t pt-4">
              <TotalsFigure
                label={balance < 0 ? t('youOwe') : t('yourBalance')}
                amount={balance}
                currency={currency}
                tone="balance"
                testId="your-balance"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('balanceHint')}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
