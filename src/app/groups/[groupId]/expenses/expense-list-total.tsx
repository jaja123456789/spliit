'use client'

import { useCollapseIntoGroupBar } from '@/app/groups/[groupId]/group-bar-summary'
import { Money } from '@/components/money'
import { SheetHeader } from '@/components/sheet-header'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveUserState } from '@/lib/hooks'
import { formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useLocale, useTranslations } from 'next-intl'
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
 *
 * @param hidden for a group with nothing in it, where the figure and the export would be about
 * nothing. It stays mounted: its scan button picks up a receipt shared to the app. And it says
 * nothing to the group's bar, which would otherwise take a hidden header for a scrolled-away one.
 */
export function ExpenseListTotal({
  actions,
  hidden = false,
}: {
  actions?: ReactNode
  hidden?: boolean
}) {
  const { groupId, group } = useCurrentGroup()
  const activeUser = useActiveUserState(groupId)
  const t = useTranslations('Expenses.Totals')
  // Not before we know who "you" are: see `useActiveUserState`.
  const { data } = trpc.groups.stats.get.useQuery(
    { groupId, participantId: activeUser ?? undefined },
    { enabled: activeUser !== undefined },
  )

  const currency = group ? getCurrencyFromGroup(group) : null
  const ready = !!currency && !!data
  const locale = useLocale()
  const summary = useCollapseIntoGroupBar<HTMLDivElement>(
    ready && !hidden
      ? [
          `${t('group')} ${formatCurrency(
            currency,
            data.totalGroupSpendings,
            locale,
          )}`,
          data.totalParticipantShare !== undefined &&
            `${t('yourShare')} ${formatCurrency(
              currency,
              data.totalParticipantShare,
              locale,
            )}`,
        ]
          .filter(Boolean)
          .join(' · ')
      : null,
  )

  return (
    <div ref={summary} hidden={hidden}>
      <SheetHeader
        label={t('group')}
        figureTestId="expenses-group-total"
        actions={actions}
        // A step smaller on a phone: the list is what this screen is for, and the total also
        // collapses into the group bar once you scroll.
        compact
        figure={
          ready ? (
            <Money
              currency={currency}
              amount={data.totalGroupSpendings}
              headline
            />
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
    </div>
  )
}
