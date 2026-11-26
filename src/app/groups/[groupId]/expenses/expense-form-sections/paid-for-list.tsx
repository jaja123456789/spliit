'use client'

import { ProfileAvatar } from '@/components/profile-avatar'
import { CalculatorInput } from '@/components/ui/calculator-input'
import { FormControl } from '@/components/ui/form'
import { Locale } from '@/i18n/request'
import { assignAvatarHues } from '@/lib/avatar-hue'
import { Currency } from '@/lib/currency'
import { useActiveUser } from '@/lib/hooks'
import { ExpenseFormValues } from '@/lib/schemas'
import { calculateShare } from '@/lib/totals'
import { amountAsMinorUnits, cn, formatCurrency } from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { useLocale, useTranslations } from 'next-intl'
import { UseFormReturn, useWatch } from 'react-hook-form'
import { match } from 'ts-pattern'
import { useShareIdentity } from './share-identity'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>
type Form = UseFormReturn<ExpenseFormValues>
type Wording = 'Expense' | 'Income'

export function PaidForList({
  form,
  group,
  expenseCurrency,
  totalAmount,
  splitMode,
  manuallyEditedParticipants,
  setManuallyEditedParticipants,
  recalculateByAmount,
}: {
  form: UseFormReturn<ExpenseFormValues>
  group: NonNullable<AppRouterOutput['groups']['get']['group']>
  expenseCurrency: Currency
  totalAmount: number
  splitMode: string
  manuallyEditedParticipants: Set<string>
  setManuallyEditedParticipants: (s: Set<string>) => void
  recalculateByAmount: (total: number, paidFor: any, edited: Set<string>) => any
}) {
  const t = useTranslations('ExpenseForm')
  const locale = useLocale() as Locale
  // Read here rather than threading a prop down: the mark is the only thing that needs it, and the
  // hook is a localStorage read the parent already does.
  const activeUserId = useActiveUser(group.id)
  const paidForValues = useWatch({ control: form.control, name: 'paidFor' })
  const paidByValues = useWatch({ control: form.control, name: 'paidBy' })
  const isReimbursement = useWatch({
    control: form.control,
    name: 'isReimbursement',
  })
  const expenseDate = useWatch({ control: form.control, name: 'expenseDate' })
  const avatarHues = assignAvatarHues(group.participants.map((p) => p.name))

  const shareIdentity = useShareIdentity()
  const getCalculatedShare = (participantId: string) => {
    return calculateShare(participantId, {
      ...shareIdentity,
      amount: amountAsMinorUnits(totalAmount, expenseCurrency),
      expenseDate: expenseDate ?? new Date(),
      paidFor: paidForValues.map((pf: any) => ({
        participant: { id: pf.participant, name: '', groupId: '' },
        expenseId: '',
        participantId: '',
        shares: (() => {
          const rawShares = pf.shares
          const numShares = Number(rawShares)
          if (isNaN(numShares)) return 0
          if (splitMode === 'BY_PERCENTAGE') return numShares * 100
          if (splitMode === 'BY_AMOUNT')
            return amountAsMinorUnits(numShares, expenseCurrency)
          return numShares
        })(),
      })),
      splitMode: splitMode as any,
      isReimbursement: isReimbursement,
      paidBy: paidByValues.map((pb: any) => ({
        participantId: pb.participant,
        participant: { id: pb.participant, name: '' },
        amount: 0,
      })),
    })
  }

  const handleShareChange = (participantId: string, newValue: string) => {
    // 1. Mark as edited
    const newEditedSet = new Set(manuallyEditedParticipants).add(participantId)
    setManuallyEditedParticipants(newEditedSet)

    // 2. Temporarily update the specific row to the new value
    let currentPaidFor = form.getValues('paidFor').map((p: any) =>
      p.participant === participantId
        ? { ...p, shares: newValue } // Keep as string for the input
        : p,
    )

    // 3. If in BY_AMOUNT mode, trigger the redistribution logic synchronously
    //    so the user sees the numbers balance out as they type.
    if (splitMode === 'BY_AMOUNT') {
      currentPaidFor = recalculateByAmount(
        totalAmount,
        currentPaidFor,
        newEditedSet,
      )
    }

    // 4. Update form
    form.setValue('paidFor', currentPaidFor, {
      shouldValidate: true,
      shouldDirty: true,
    })

    form.trigger('paidBy')
  }

  const toggleParticipant = (id: string, next: boolean) => {
    const currentPaidFor = form.getValues('paidFor')
    const options = {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    }
    if (next) {
      form.setValue(
        'paidFor',
        [...currentPaidFor, { participant: id, shares: '1' }] as any,
        options,
      )
    } else {
      form.setValue(
        'paidFor',
        currentPaidFor.filter((p: any) => p.participant !== id),
        options,
      )
      const newSet = new Set(manuallyEditedParticipants)
      newSet.delete(id)
      setManuallyEditedParticipants(newSet)
    }
  }

  return (
    <div
      className="divide-y overflow-hidden rounded-lg border"
      data-testid="paid-for-rows"
    >
      {group.participants.map(({ id, name }) => {
        const isSelected = paidForValues.some((p: any) => p.participant === id)
        const currentShare =
          paidForValues.find((p: any) => p.participant === id)?.shares || ''

        return (
          <div
            key={id}
            data-id={`${id}/${splitMode}/${group.currency}`}
            className={cn(
              // The same row as the evenly list, because it is the same list — a person, and what
              // they owe. What differs is that here the figure is a field.
              'flex min-h-[52px] items-center gap-3 px-3 py-2 transition-colors',
              !isSelected && 'bg-muted/40',
            )}
          >
            {/* The mark is the switch. The whole row cannot be, the way it is on the evenly list:
                most of this row is an input, and a tap that lands in it must land in it. Still a
                checkbox to anything reading the page — the box itself is gone, not the role or
                the name it answers to. */}
            <button
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              aria-label={name}
              data-testid={`split-row-toggle-${name}`}
              onClick={() => toggleParticipant(id, !isSelected)}
              className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ProfileAvatar
                name={name}
                hue={avatarHues.get(name)}
                isActiveUser={activeUserId === id}
                size={32}
                className={cn(!isSelected && 'opacity-40 grayscale')}
              />
            </button>

            <span
              className={cn(
                'min-w-0 flex-1 truncate font-medium',
                !isSelected && 'text-muted-foreground',
              )}
            >
              {name}
            </span>

            {isSelected && !isReimbursement && splitMode !== 'BY_AMOUNT' && (
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatCurrency(
                  expenseCurrency,
                  getCalculatedShare(id),
                  locale,
                )}
              </span>
            )}

            {splitMode !== 'EVENLY' && isSelected && (
              <div className="flex shrink-0 items-center gap-1">
                {splitMode === 'BY_AMOUNT' && (
                  <span className="text-sm text-muted-foreground">
                    {expenseCurrency.symbol || group.currency}
                  </span>
                )}
                <FormControl>
                  <CalculatorInput
                    className="h-9 w-[104px] rounded-md border border-input bg-card shadow-none has-[[data-slot=input-group-control]:focus-visible]:ring-0"
                    inputClassName="h-9 w-full border-0 bg-transparent px-2 text-right font-sans tabular-nums text-base shadow-none focus-visible:ring-0"
                    placeholder="0.00"
                    decimalPlaces={expenseCurrency.decimal_digits}
                    value={currentShare}
                    onValueChange={(val) => handleShareChange(id, val)}
                    disallowEmpty={false}
                  />
                </FormControl>
                {['BY_SHARES', 'BY_PERCENTAGE'].includes(splitMode) && (
                  <span className="text-sm text-muted-foreground">
                    {match(splitMode)
                      .with('BY_SHARES', () => <>{t('shares')}</>)
                      .with('BY_PERCENTAGE', () => <>%</>)
                      .otherwise(() => (
                        <></>
                      ))}
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
