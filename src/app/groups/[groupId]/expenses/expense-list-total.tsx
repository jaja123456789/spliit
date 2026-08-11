'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { useActiveUser } from '@/lib/hooks'
import { formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useLocale, useTranslations } from 'next-intl'
import { useCurrentGroup } from '../current-group-context'

/**
 * The running totals for the expense list.
 *
 * The list itself is paginated, so summing the rows on screen would quietly report the first page
 * as the whole group. These come from the same stats query the Stats tab uses, which is also why
 * they agree with it.
 */
export function ExpenseListTotal() {
  const { groupId, group } = useCurrentGroup()
  const activeUser = useActiveUser(groupId)
  const locale = useLocale()
  const t = useTranslations('Expenses.Totals')
  const { data } = trpc.groups.stats.get.useQuery({
    groupId,
    participantId: activeUser ?? undefined,
  })

  if (!group || !data)
    return (
      <div className="flex gap-4 px-4 sm:px-6">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-3 w-24 rounded-full" />
      </div>
    )

  const currency = getCurrencyFromGroup(group)

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 sm:px-6 text-xs text-muted-foreground">
      <span>
        {t('group')}{' '}
        <strong className="font-semibold tabular-nums text-foreground">
          {formatCurrency(currency, data.totalGroupSpendings, locale)}
        </strong>
      </span>
      {data.totalParticipantShare !== undefined && (
        <span>
          {t('yourShare')}{' '}
          <strong className="font-semibold tabular-nums text-foreground">
            {formatCurrency(currency, data.totalParticipantShare, locale)}
          </strong>
        </span>
      )}
    </div>
  )
}
