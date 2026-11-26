'use client'

import { CurrencySelector } from '@/components/currency-selector'
import { CalculatorInput } from '@/components/ui/calculator-input'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Locale } from '@/i18n/request'
import { Currency, defaultCurrencyList } from '@/lib/currency'
import { ExpenseFormValues } from '@/lib/schemas'
import { formatCurrency } from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { ChevronDown } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { UseFormReturn } from 'react-hook-form'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>
type Form = UseFormReturn<ExpenseFormValues>
type Wording = 'Expense' | 'Income'

/** How much: the currency, the figure, and what it comes to in the group's currency. */
export function AmountField({
  form,
  sExpense,
  group,
  conversionAvailable,
  expenseCurrency,
  groupCurrency,
  isMultiPayer,
  payerCount,
  effectiveTotal,
  effectiveRate,
  conversionRequired,
  splitControl,
  onAmountChange,
}: {
  form: Form
  sExpense: Wording
  group: Group
  conversionAvailable: boolean
  expenseCurrency: Currency
  groupCurrency: Currency
  isMultiPayer: boolean
  payerCount: number
  effectiveTotal: number
  effectiveRate: number
  conversionRequired: boolean
  splitControl: 'EVENLY' | 'ITEMS' | 'OTHER'
  onAmountChange: (value: string) => void
}) {
  const t = useTranslations('ExpenseForm')
  const locale = useLocale() as Locale

  return (
    <FormField
      control={form.control}
      name="paidBy.0.amount"
      render={({ field }) => (
        <FormItem className="space-y-0">
          <FormLabel className="mb-1 block text-sm font-normal text-muted-foreground">
            {t(`${sExpense}.amountLabel`)}
          </FormLabel>
          {/* One box around the three things that describe the figure: what currency it
                        is in, the figure, and what it comes to in the group's currency. They were
                        a label row and a control row, which put the conversion at the far right of
                        a line whose left half was the word "Amount". It qualifies the number, so
                        it belongs under the number.
                        Bordered rather than filled: this box holds a control and a reading, and
                        the sunken fill the rest of the form uses to mean "type here" would be
                        claiming that about the conversion line too. */}
          <div className="rounded-xl border border-input bg-card px-3 py-3 transition-shadow focus-within:ring-2 focus-within:ring-primary">
            <div className="flex items-center gap-3">
              {/* An expense can be entered in another currency than the group's, and that
                          lived as a Select buried in More options. Inert for a group with a custom
                          symbol: there is no exchange rate to convert from, which is why the old
                          Select was disabled there too. */}
              {conversionAvailable ? (
                <FormField
                  control={form.control}
                  name="originalCurrency"
                  render={({ field: currencyField }) => (
                    <CurrencySelector
                      currencies={defaultCurrencyList(locale, '')}
                      defaultValue={currencyField.value ?? ''}
                      isLoading={false}
                      onValueChange={currencyField.onChange}
                      renderTrigger={() => (
                        <button
                          type="button"
                          data-testid="currency-trigger"
                          title={t('changeCurrency')}
                          /* Symbol and code rather than the symbol alone: "$" is a dozen
                                     currencies, and the code is the half that says which. */
                          className="flex h-12 shrink-0 items-center gap-1 rounded-lg border border-input bg-background px-2.5 font-sans tabular-nums text-sm font-medium text-foreground transition-colors hover:bg-muted"
                        >
                          <span>
                            {expenseCurrency.symbol || group.currency}
                          </span>
                          <span className="text-muted-foreground">
                            {expenseCurrency.code}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-40" />
                        </button>
                      )}
                    />
                  )}
                />
              ) : (
                // No chevron here on purpose: with no exchange rate to convert from there
                // is nothing to pick, and this is a label, not a control.
                <span className="grid h-12 shrink-0 place-items-center rounded-lg border border-input bg-background px-3 font-sans tabular-nums text-sm font-medium text-muted-foreground">
                  {expenseCurrency.symbol || group.currency}
                </span>
              )}
              <div className="min-w-0 flex-1">
                {isMultiPayer ? (
                  // Only several payers make the total a derived figure: it is their sum,
                  // so there is nothing to type into it. An itemised bill is not such a
                  // case — the total is what was paid, the lines are how it was shared,
                  // and the difference between them is the tax the strip below offers to
                  // split. This used to be derived for itemised expenses too, which left
                  // the one number the reader typed invisible and uneditable on every
                  // itemised expense they reopened.
                  <span
                    data-testid="derived-total"
                    className="flex h-12 items-center justify-center px-1 text-4xl font-bold tabular-nums"
                  >
                    {formatCurrency(
                      expenseCurrency,
                      effectiveTotal,
                      locale,
                      true,
                    ).replace(/^[^\d-]+/, '')}
                  </span>
                ) : (
                  <FormControl>
                    <CalculatorInput
                      placeholder="0.00"
                      // The box around this field already answers focus with a ring. InputGroup draws its
                      // own on top, so a tap on the amount lit two rings, one inside the other.
                      className="h-12 w-full border-0 bg-transparent shadow-none has-[[data-slot=input-group-control]:focus-visible]:ring-0"
                      inputClassName="h-12 w-full border-0 bg-transparent px-1 text-center text-4xl sm:text-4xl font-bold tabular-nums shadow-none focus-visible:ring-0"
                      {...field}
                      onValueChange={(val) => onAmountChange(val)}
                    />
                  </FormControl>
                )}
              </div>
            </div>
            {conversionRequired && (
              <p
                data-testid="converted-total"
                className="mt-1 text-center text-sm tabular-nums text-muted-foreground"
              >
                ≈{' '}
                {formatCurrency(
                  groupCurrency,
                  effectiveRate ? effectiveTotal * effectiveRate : 0,
                  locale,
                  true,
                )}
              </p>
            )}
            {isMultiPayer && (
              <p className="mt-1 text-center text-xs text-muted-foreground">
                {t('derivedFromPayers', {
                  count: payerCount,
                })}
              </p>
            )}
          </div>
          <FormMessage className="mt-1" />
          {/* "The lines do not add up to the total" is an argument about this figure,
                        and it used to be made at the foot of the itemisation block — past every
                        row and past the strip offering to fix it. The strip still colours itself;
                        the sentence belongs next to the number it disputes. */}
          {splitControl === 'ITEMS' && (
            <FormField
              control={form.control}
              name="items"
              // Only what is wrong with the lines as a set. A row's own complaint —
              // a missing name — belongs to that row, which shows it and takes a
              // destructive border; surfaced here it appeared under the amount and
              // pointed at the one field that was not the problem.
              render={() => <FormMessage className="mt-1" ownErrorOnly />}
            />
          )}
        </FormItem>
      )}
    />
  )
}
