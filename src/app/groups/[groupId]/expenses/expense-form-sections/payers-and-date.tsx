'use client'

import { ProfileAvatar } from '@/components/profile-avatar'
import { Button } from '@/components/ui/button'
import { CalculatorInput } from '@/components/ui/calculator-input'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { assignAvatarHues } from '@/lib/avatar-hue'
import { Currency } from '@/lib/currency'
import { ExpenseFormValues } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { Crown, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { FieldArrayWithId, UseFormReturn } from 'react-hook-form'
import { formatDate } from './helpers'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>
type Form = UseFormReturn<ExpenseFormValues>
type Wording = 'Expense' | 'Income'

// Not a participant id, and it never reaches the form: `onValueChange` intercepts it.
const MULTI_PAYER_OPTION = '__multiple_payers__'

/** Who paid — one payer or several — and when. */
export function PayersAndDate({
  form,
  sExpense,
  group,
  isMultiPayer,
  payerFields,
  paidByValues,
  activeUserId,
  expenseCurrency,
  onAddPayer,
  onRemovePayer,
  onPayerAmountChange,
}: {
  form: Form
  sExpense: Wording
  group: Group
  isMultiPayer: boolean
  payerFields: FieldArrayWithId<ExpenseFormValues, 'paidBy', 'id'>[]
  paidByValues: ExpenseFormValues['paidBy']
  activeUserId: string | null
  expenseCurrency: Currency
  onAddPayer: () => void
  onRemovePayer: (index: number) => void
  onPayerAmountChange: (index: number, value: string) => void
}) {
  const t = useTranslations('ExpenseForm')
  const avatarHues = assignAvatarHues(group.participants.map((p) => p.name))
  const maxAmount = Math.max(...paidByValues.map((p) => Number(p.amount) || 0))

  const getIsParticipantPaying = (
    participantId: string,
    currentIndex: number,
  ) => {
    return paidByValues.some(
      (field, index) =>
        index !== currentIndex && field.participant === participantId,
    )
  }

  return (
    <div
      className={cn(
        !isMultiPayer && 'grid grid-cols-2 items-start gap-3 px-6 py-2',
      )}
    >
      <div>
        {isMultiPayer && (
          <FormLabel className="block px-6 pb-1 pt-2 text-sm font-normal text-muted-foreground">
            {t(`${sExpense}.paidByField.label`)}
          </FormLabel>
        )}

        <div className="flex flex-col">
          {payerFields.map((field, index) => {
            // Determine if this specific row is the highest payer
            const currentAmount = Number(paidByValues[index]?.amount) || 0
            const isHighest =
              isMultiPayer && currentAmount > 0 && currentAmount === maxAmount

            return (
              <div
                key={field.id}
                className={cn(
                  // One shape for one payer or five: a ruled row at the same height as
                  // every other row in this section. With several payers the name moves
                  // to the left and an amount joins it on the right — nothing else
                  // changes. It used to become a bordered card with a tinted background,
                  // a shadow and a red bin, which is a different form's visual language
                  // sitting inside this one.
                  'flex items-center justify-between gap-2 transition-colors',
                  isMultiPayer && 'py-1',
                  // The pair's own grid supplies the gutter when there is one payer.
                  isMultiPayer && 'px-6',
                )}
              >
                <FormField
                  control={form.control}
                  name={`paidBy.${index}.participant`}
                  render={({ field }) => (
                    <FormItem
                      className={cn(
                        'min-w-0 space-y-0',
                        isMultiPayer
                          ? 'flex flex-1 items-center'
                          : 'flex w-full flex-col items-stretch gap-1',
                      )}
                    >
                      {!isMultiPayer && (
                        <FormLabel className="text-sm font-normal text-muted-foreground">
                          {t(`${sExpense}.paidByField.label`)}
                        </FormLabel>
                      )}
                      <Select
                        onValueChange={(value) => {
                          if (value === MULTI_PAYER_OPTION) {
                            onAddPayer()
                            return
                          }
                          field.onChange(value)
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          {/* The payer is pre-selected rather than showing a placeholder, so
                                    there is no stable text to find this control by. */}
                          <SelectTrigger
                            data-testid={`paid-by-select-${index}`}
                            className={cn(
                              // A pill that hugs its value, not a full-width field: this
                              // is a statement of fact you occasionally change. The fill
                              // is what says it can be changed and the chevron says how —
                              // a control that looks like static text is the fault the
                              // assign strip had. It used to stretch to everything right
                              // of the label, which was a fine invisible target and a
                              // very odd visible one once the fill arrived.
                              // Bordered and full width whether there is one payer or
                              // five, so a payer reads as the same kind of field as the
                              // date beside it. It used to become a grey pill hugging
                              // its own text the moment a second payer appeared, which
                              // is the visual language this form has otherwise left.
                              'h-11 w-full justify-between gap-1 rounded-md border bg-card px-3 font-medium shadow-none focus:ring-0 [&>svg]:opacity-40',
                            )}
                          >
                            {/* The payer is a person, and every other place this form
                                        names one shows their plate beside the name. Here it was
                                        the name alone — the one participant on the screen without
                                        a face, and the one the concept draws with one. */}
                            <div className="flex min-w-0 items-center gap-2">
                              {isHighest && (
                                <Crown className="h-3 w-3 shrink-0 text-primary" />
                              )}
                              {/* No plate of its own: SelectValue renders the chosen
                                          item's own children, which now carry one — drawing a
                                          second here showed "JA JA Jason". */}
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {group.participants.map(({ id, name }) => (
                            <SelectItem
                              key={id}
                              value={id}
                              disabled={getIsParticipantPaying(id, index)}
                            >
                              <span className="flex items-center gap-2">
                                <ProfileAvatar
                                  name={name}
                                  hue={avatarHues.get(name)}
                                  isActiveUser={
                                    !!activeUserId && activeUserId === id
                                  }
                                  size={24}
                                />
                                {name}
                              </span>
                            </SelectItem>
                          ))}
                          {!isMultiPayer && (
                            <SelectItem
                              value={MULTI_PAYER_OPTION}
                              data-testid="multiple-payers-option"
                              className="border-t"
                            >
                              {t('multiplePayers')}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Only shown once there is more than one payer: with a single payer the
                          hero above is this field, and rendering both meant typing into one and
                          watching the other update. */}
                {isMultiPayer && (
                  <FormField
                    control={form.control}
                    name={`paidBy.${index}.amount`}
                    render={({ field }) => (
                      <FormItem className="w-[120px] shrink-0 space-y-0">
                        {/* The item row's price field, to the class: symbol in its own
                                    column, figure right-aligned and tabular so the decimals line
                                    up down the column, the box tracking its value, and the
                                    calculator inside the field rather than beside it. */}
                        <div className="flex h-11 items-center gap-1 rounded-md border border-input bg-card pl-2 transition-shadow focus-within:ring-2 focus-within:ring-primary [&_button]:h-8 [&_button]:w-8">
                          <span className="font-mono text-xs text-subtle-foreground">
                            {expenseCurrency.symbol || group.currency}
                          </span>
                          <FormControl>
                            <CalculatorInput
                              placeholder="0.00"
                              className="h-11 min-w-0 flex-1 border-0 bg-transparent shadow-none has-[[data-slot=input-group-control]:focus-visible]:ring-0"
                              inputClassName="h-11 w-full border-0 bg-transparent px-0 text-right font-mono text-base font-semibold tabular-nums shadow-none focus-visible:ring-0"
                              {...field}
                              onValueChange={(val) => {
                                onPayerAmountChange(index, val)
                              }}
                            />
                          </FormControl>
                        </div>
                        <FormMessage className="mt-1 text-right text-xs" />
                      </FormItem>
                    )}
                  />
                )}

                {payerFields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemovePayer(index)}
                    title={t('removePayer')}
                    className="relative h-8 w-8 shrink-0 text-subtle-foreground after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-[''] hover:bg-destructive/10 hover:text-destructive sm:after:hidden"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        {/* The action that adds a payer belongs to the payers, so it sits directly under
                  them — the date used to be wedged between the two, which put a control and the
                  thing it acts on either side of an unrelated field. Same shape as the item list,
                  where "Add a line" follows the lines. */}
        {isMultiPayer && (
          <Button
            type="button"
            variant="ghost"
            onClick={onAddPayer}
            className="mx-6 mt-1 h-11 w-[calc(100%-3rem)] justify-center rounded-md border border-dashed text-sm font-normal text-muted-foreground hover:text-foreground"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('addPayer')}
          </Button>
        )}
      </div>

      {/* Out of More options: a date is not an advanced setting, and burying it meant
                  every backdated expense cost two extra taps. It pairs with Paid by while there
                  is one payer, and takes a row of its own once there are several. */}
      <div className="min-w-0">
        <FormField
          control={form.control}
          name="expenseDate"
          render={({ field }) => (
            <FormItem
              className={cn(
                // The same labelled box in both modes. It used to become a grey pill on
                // a label-left row as soon as a second payer appeared, so adding a payer
                // restyled a field that has nothing to do with payers. Only its width
                // changes: it shares a row with Paid by, or takes one of its own.
                'flex flex-col items-stretch gap-1 space-y-0',
                isMultiPayer && 'px-6 pb-1 pt-2',
              )}
            >
              <FormLabel className="text-sm font-normal text-muted-foreground">
                {t(`${sExpense}.DateField.label`)}
              </FormLabel>
              <FormControl>
                <Input
                  className="date-base h-11 w-full rounded-md border bg-card px-3 font-medium shadow-none focus-visible:ring-2 focus-visible:ring-primary"
                  name="expenseDate"
                  type="date"
                  value={formatDate(field.value)}
                  onChange={(e) => field.onChange(new Date(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  )
}
