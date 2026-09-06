'use client'

import { ProfileAvatar } from '@/components/profile-avatar'
import { Button } from '@/components/ui/button'
import { assignAvatarHues } from '@/lib/avatar-hue'
import { Currency } from '@/lib/currency'
import { ExpenseFormValues } from '@/lib/schemas'
import {
  allocateMinorUnits,
  amountAsMinorUnits,
  cn,
  formatCurrency,
} from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { useLocale, useTranslations } from 'next-intl'
import { UseFormReturn, useWatch } from 'react-hook-form'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>

/**
 * Who shares an evenly-split expense, and what it costs each of them.
 *
 * These were chips in a two-column grid, which was the right idea at the wrong shape: a name and a
 * figure are a row, and a grid of them is a set of little boxes the eye has to read in two
 * directions. One column, one person per line, the figure in the same place every time — the same
 * list the balances and the reimbursements are already drawn as.
 *
 * Dropping someone leaves their row where it is, greyed. The alternative — removing it — makes the
 * list jump under the finger and gives the reader nothing to press to undo what they just did.
 * The share re-divides across whoever is left, so an evenly-split expense can never fail to add up
 * and there is no total to reconcile at the foot of the list.
 *
 * Only for evenly. The rows behind "Custom" are also per-person *value editors* — each holds an
 * input and its own error — so they live with the rest of that mode in `PaidForList`.
 */
export function SplitRows({
  form,
  group,
  currency,
  totalAmount,
  activeUserId,
}: {
  form: UseFormReturn<ExpenseFormValues>
  group: Group
  currency: Currency
  totalAmount: number
  activeUserId?: string | null
}) {
  const t = useTranslations('ExpenseForm')
  const locale = useLocale()
  const paidFor = useWatch({ control: form.control, name: 'paidFor' }) ?? []
  const avatarHues = assignAvatarHues(group.participants.map((p) => p.name))

  const isOn = (id: string) =>
    paidFor.some((entry: any) => entry.participant === id)
  const selected = group.participants.filter((p) => isOn(p.id))

  // The same largest-remainder split the expense itself will be stored with, so the rows do not
  // promise three equal thirds the arithmetic cannot deliver: $87.40 three ways is 29.13, 29.13,
  // 29.14 and one of them has to be the odd penny.
  const totalMinorUnits = amountAsMinorUnits(totalAmount, currency)
  const shares = allocateMinorUnits(
    selected.map(() => totalMinorUnits / (selected.length || 1)),
    totalMinorUnits,
  )
  const shareOf = (id: string) => {
    const index = selected.findIndex((p) => p.id === id)
    return index < 0 ? null : shares[index]
  }
  // "each" is only true when the odd penny did not have to go somewhere.
  const isExact = shares.length > 0 && new Set(shares).size === 1

  // Rebuilt in the group's own order every time, rather than filtering someone out and appending
  // them back on the end. Order is not visible here — the rows read from `group.participants` —
  // but it was visible to the draft, which compares the form against the values it started with:
  // dropping someone and picking them again left the array in a different order, and the form
  // counted itself edited from then on.
  const toggle = (id: string) => {
    const current = form.getValues('paidFor')
    const chosen = new Set(current.map((entry: any) => entry.participant))
    if (chosen.has(id)) chosen.delete(id)
    else chosen.add(id)
    form.setValue(
      'paidFor',
      group.participants
        .filter((participant) => chosen.has(participant.id))
        .map((participant) => ({
          participant: participant.id,
          shares:
            current.find((entry: any) => entry.participant === participant.id)
              ?.shares ?? '1',
        })) as any,
      { shouldDirty: true, shouldTouch: true, shouldValidate: true },
    )
  }

  const allSelected = selected.length === group.participants.length

  return (
    <div className="mt-2" data-testid="split-rows">
      {/* The count and the per-person figure, which is the question this list answers. It replaces
          "Everyone shares it equally unless you say otherwise" — a sentence that said what the
          control above it already says, and said nothing about this expense. */}
      {selected.length > 0 && (
        <p
          className="mb-2 text-sm text-muted-foreground"
          data-testid="split-summary"
        >
          {t('evenlySummary', {
            count: selected.length,
            each: `${isExact ? '' : '≈ '}${formatCurrency(
              currency,
              shares[0] ?? 0,
              locale,
            )}`,
          })}
        </p>
      )}

      <div className="divide-y overflow-hidden rounded-lg border">
        {group.participants.map((participant) => {
          const on = isOn(participant.id)
          const share = shareOf(participant.id)
          return (
            <button
              key={participant.id}
              type="button"
              role="switch"
              aria-checked={on}
              data-testid={`split-row-${participant.name}`}
              onClick={() => toggle(participant.id)}
              className={cn(
                // The whole row is the target. With one control per row and nothing else in it to
                // press, a smaller hit area inside would only be a way to miss.
                'flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                on ? 'hover:bg-muted/60' : 'bg-muted/40 hover:bg-muted/60',
              )}
            >
              <ProfileAvatar
                name={participant.name}
                hue={avatarHues.get(participant.name)}
                isActiveUser={!!activeUserId && activeUserId === participant.id}
                size={32}
                className={cn(!on && 'opacity-40 grayscale')}
              />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate font-medium',
                  !on && 'text-muted-foreground',
                )}
              >
                {participant.name}
              </span>
              {on && share !== null && (
                <span className="shrink-0 tabular-nums font-medium">
                  {formatCurrency(currency, share, locale)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <Button
        type="button"
        variant="link"
        size="sm"
        // Small type, but not a small target: 16px of link under a list of 52px rows was the same
        // inconsistency this pass exists to remove.
        className="mt-1 h-auto min-h-11 px-0 text-xs font-normal text-muted-foreground"
        data-testid="split-rows-toggle-all"
        onClick={() => {
          const options = {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          }
          if (allSelected) {
            form.setValue('paidFor', [] as any, options)
          } else {
            const current = form.getValues('paidFor')
            form.setValue(
              'paidFor',
              group.participants.map((p) => ({
                participant: p.id,
                shares:
                  current.find((entry: any) => entry.participant === p.id)
                    ?.shares ?? '1',
              })) as any,
              options,
            )
          }
        }}
      >
        {allSelected ? t('selectNone') : t('selectAll')}
      </Button>
    </div>
  )
}
