'use client'

import { ProfileAvatar } from '@/components/profile-avatar'
import { Button } from '@/components/ui/button'
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
 * On the evenly path — which is most expenses — this used to be a second card below the form, so
 * the one thing people routinely change was the last thing on a page one and a half screens long,
 * in a different container from the amount that decides it. Here it sits directly under the control
 * that says "evenly", each person carrying their own share, and dropping someone re-divides the
 * rest in place.
 *
 * Only for evenly. The row list it replaces is also the per-person *value editor* for shares,
 * percentage and exact amount — each of those rows holds an input and its own error — and a chip
 * has nowhere to put one. So the three modes behind "More" keep the rows, unchanged.
 */
export function EvenlyChips({
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

  const isOn = (id: string) =>
    paidFor.some((entry: any) => entry.participant === id)
  const selected = group.participants.filter((p) => isOn(p.id))

  // The same largest-remainder split the expense itself will be stored with, so the chips do not
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

  // Rebuilt in the group's own order every time, rather than filtering someone out and appending
  // them back on the end. Order is not visible here — the row list on the other split modes reads
  // from `group.participants` — but it was visible to the draft, which compares the form against
  // the values it started with: dropping someone and picking them again left the array in a
  // different order, and the form counted itself edited from then on.
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
    <div className="mt-3" data-testid="evenly-chips">
      {/* A grid, not a wrap. Free-flowing pills sized themselves to their names, so three people
          came out 131, 139 and 137px wide and wrapped 2 + 1 — a ragged edge under a form whose
          every other row runs the full width. Two equal columns give the block an edge, and the
          names line up with each other instead of with nothing. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {group.participants.map((participant) => {
          const on = isOn(participant.id)
          const share = shareOf(participant.id)
          return (
            <button
              key={participant.id}
              type="button"
              role="switch"
              aria-checked={on}
              data-testid={`evenly-chip-${participant.name}`}
              onClick={() => toggle(participant.id)}
              className={cn(
                'flex min-h-11 min-w-0 items-center gap-2 rounded-md py-1.5 pl-1.5 pr-3 text-sm transition-colors',
                // No outline: a fill says "control" everywhere else on this form now, so it
                // says it here too, and the difference between in and out is the fill's tone.
                on
                  ? 'bg-primary/10 text-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              <ProfileAvatar
                name={participant.name}
                isActiveUser={!!activeUserId && activeUserId === participant.id}
                size={26}
                className={cn(!on && 'opacity-50')}
              />
              <span
                className={cn(
                  'min-w-0 truncate font-medium',
                  !on && 'line-through',
                )}
              >
                {participant.name}
              </span>
              {on && share !== null && (
                <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
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
        // Small type, but not a small target: 16px of link under a row of 44px chips was the
        // same inconsistency this pass exists to remove.
        className="mt-1 h-auto min-h-11 px-0 text-xs font-normal text-muted-foreground"
        data-testid="evenly-chips-toggle-all"
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
