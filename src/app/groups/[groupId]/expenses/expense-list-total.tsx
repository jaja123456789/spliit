'use client'

import { Money } from '@/components/money'
import { SheetHeader } from '@/components/sheet-header'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveUser } from '@/lib/hooks'
import { getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { ReactNode } from 'react'
import { useCurrentGroup } from '../current-group-context'

/**
 * The head of the expenses sheet.
 *
 * This used to be a strip of small print below a header that said "Expenses" over "Here are the
 * expenses that you created for your group." — a title repeating the tab you had just pressed, and
 * a sentence explaining a list. The group total takes that space instead, because it is the thing
 * people open this screen to see.
 *
 * The list itself is paginated, so summing the rows on screen would quietly report the first page
 * as the whole group. These come from the same stats query the Stats tab uses, which is also why
 * the two agree.
 */
export function ExpenseListTotal({ actions }: { actions?: ReactNode }) {
  const { groupId, group } = useCurrentGroup()
  const activeUser = useActiveUser(groupId)
  const t = useTranslations('Expenses.Totals')
  const { data } = trpc.groups.stats.get.useQuery({
    groupId,
    participantId: activeUser ?? undefined,
  })

  const currency = group ? getCurrencyFromGroup(group) : null
  const ready = !!currency && !!data

  return (
    <SheetHeader
      label={t('group')}
      actions={actions}
      figure={
        ready ? (
          <Money currency={currency} amount={data.totalGroupSpendings} bold />
        ) : (
          <Skeleton className="h-8 w-40" />
        )
      }
      context={
        ready ? (
          data.totalParticipantShare !== undefined && (
            <>
              {t('yourShare')}{' '}
              <Money
                currency={currency}
                amount={data.totalParticipantShare}
                className="text-foreground"
              />
            </>
          )
        ) : (
          <Skeleton className="h-3.5 w-32" />
        )
      }
    />
  )
}
