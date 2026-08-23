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

  const toggle = (id: string) => {
    const current = form.getValues('paidFor')
    const options = {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    }
    if (isOn(id)) {
      form.setValue(
        'paidFor',
        current.filter((entry: any) => entry.participant !== id) as any,
        options,
      )
    } else {
      form.setValue(
        'paidFor',
        [...current, { participant: id, shares: '1' }] as any,
        options,
      )
    }
  }

  const allSelected = selected.length === group.participants.length

  return (
    <div className="mt-3" data-testid="evenly-chips">
      <div className="flex flex-wrap gap-2">
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
                'flex min-h-11 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm transition-colors',
                on
                  ? 'border-primary/40 bg-primary/5 text-foreground'
                  : 'border-input text-muted-foreground',
              )}
            >
              <ProfileAvatar
                name={participant.name}
                isActiveUser={!!activeUserId && activeUserId === participant.id}
                size={26}
                className={cn(!on && 'opacity-50')}
              />
              <span className={cn('font-medium', !on && 'line-through')}>
                {participant.name}
              </span>
              {on && share !== null && (
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
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
        className="mt-1 h-auto px-0 text-xs font-normal text-muted-foreground"
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
