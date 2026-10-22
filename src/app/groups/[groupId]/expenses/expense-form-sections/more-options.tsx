'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  FormControl,
  FormDescription,
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
import { Textarea } from '@/components/ui/textarea'
import { Locale } from '@/i18n/request'
import { Currency } from '@/lib/currency'
import { useCurrencyRate } from '@/lib/hooks'
import { ExpenseFormValues } from '@/lib/schemas'
import { cn, formatCurrency } from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { ChevronDown } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { UseFormReturn } from 'react-hook-form'
import { enforceCurrencyPattern } from './helpers'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>
type Form = UseFormReturn<ExpenseFormValues>
type Wording = 'Expense' | 'Income'

/**
 * The secondary facts: a converted total and its rate, notes, recurrence, "this is a payment", and
 * "remember this split". Collapsed unless asked for.
 */
export function MoreOptions({
  form,
  open,
  onOpenChange,
  sExpense,
  group,
  groupCurrency,
  expenseCurrency,
  originalCurrency,
  conversionRequired,
  effectiveRate,
  effectiveTotal,
  exchangeRate,
  usingCustomConversionRate,
  onUsingCustomConversionRateChange,
  isIncome,
  isMultiPayer,
}: {
  form: Form
  open: boolean
  onOpenChange: (open: boolean) => void
  sExpense: Wording
  group: Group
  groupCurrency: Currency
  expenseCurrency: Currency
  originalCurrency: string | null | undefined
  conversionRequired: boolean
  effectiveRate: number
  effectiveTotal: number
  exchangeRate: ReturnType<typeof useCurrencyRate>
  usingCustomConversionRate: boolean
  onUsingCustomConversionRateChange: (custom: boolean) => void
  isIncome: boolean
  isMultiPayer: boolean
}) {
  const t = useTranslations('ExpenseForm')
  const locale = useLocale() as Locale

  let conversionRateMessage = ''
  if (exchangeRate.isLoading) {
    conversionRateMessage = t('conversionRateState.loading')
  } else if (exchangeRate.error) {
    conversionRateMessage = t('conversionRateState.error')
  } else if (exchangeRate.data) {
    conversionRateMessage = `${t(
      'conversionRateState.success',
    )} ${originalCurrency}\xa01\xa0=\xa0${group.currencyCode}\xa0${
      exchangeRate.data
    }`
  } else {
    conversionRateMessage = t('conversionRateState.currencyNotFound')
  }

  return (
    <>
      {/* Optional, and it closes the run of facts about the expense: what it was, how
                much, who paid, when. Everything past this point is about how the money divides,
                which is a second question and deserves the bottom of the form to itself — the
                collapsible used to sit under the split, so opening it pushed Save off a screen
                the reader had already scrolled to the end of. */}
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full justify-between rounded-none px-6 text-sm font-normal text-muted-foreground hover:text-foreground sm:h-10"
          >
            {t('moreOptions')}
            <ChevronDown
              className={cn(
                'h-4 w-4 opacity-40 transition-transform',
                open && 'rotate-180',
              )}
            />
          </Button>
        </CollapsibleTrigger>
        {/* `data-[state=closed]:pt-0` because `grid` quietly defeats the `hidden` attribute
                  Radix sets when this closes — a class beats a UA attribute selector — so the
                  collapsed section kept rendering as a grid and reserving its 16px of top padding
                  under a rule with nothing beneath it. */}
        <CollapsibleContent className="flex flex-col gap-1 pt-1">
          {/* The category control is the icon beside the title now. Two controls writing
                    one field is the mistake 09841a4 fixed for the split mode. */}

          {/* The currency control is the symbol beside the amount now. Two controls
                    writing one field is the mistake 09841a4 fixed for the split mode; it does
                    not become a different mistake one section further down. */}
          <div
            className={cn(
              'space-y-2 px-6 py-2',
              !conversionRequired && 'hidden sm:block sm:invisible',
            )}
          >
            <FormItem>
              <FormLabel className="text-sm font-normal text-muted-foreground">
                {t('convertedTotalField.label', {
                  currency: group.currencyCode ?? group.currency,
                })}
              </FormLabel>
              <div className="flex items-baseline gap-2 h-10">
                <span className="text-base font-medium">
                  {formatCurrency(
                    groupCurrency,
                    effectiveRate ? effectiveTotal * effectiveRate : 0,
                    locale,
                    true,
                  )}
                </span>
              </div>
              <FormDescription>
                {isNaN(form.getValues('expenseDate').getTime()) ? (
                  t('conversionRateState.noDate')
                ) : form.getValues('expenseDate') &&
                  !usingCustomConversionRate ? (
                  <>
                    {conversionRateMessage}
                    {!exchangeRate.isLoading && (
                      <Button
                        className="h-auto py-0"
                        variant="link"
                        type="button"
                        onClick={() => exchangeRate.refresh()}
                      >
                        {t('conversionRateState.refresh')}
                      </Button>
                    )}
                  </>
                ) : (
                  t('conversionRateState.customRate')
                )}
              </FormDescription>
            </FormItem>
            <Collapsible
              open={usingCustomConversionRate}
              onOpenChange={onUsingCustomConversionRateChange}
            >
              <CollapsibleTrigger asChild>
                <Button variant="link" type="button" className="-mx-4">
                  {usingCustomConversionRate
                    ? t('conversionRateField.useApi')
                    : t('conversionRateField.useCustom')}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <FormField
                  control={form.control}
                  name="conversionRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-normal text-muted-foreground">
                        {t('conversionRateField.label')}
                      </FormLabel>
                      <div className="flex items-baseline gap-2">
                        <span>
                          {expenseCurrency.symbol} 1 = {group.currency}
                        </span>
                        <FormControl>
                          <Input
                            className="text-base sm:text-base max-w-"
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) =>
                              field.onChange(
                                enforceCurrencyPattern(e.target.value),
                              )
                            }
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CollapsibleContent>
            </Collapsible>
          </div>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="space-y-1 px-6 py-2">
                <FormLabel className="text-sm font-normal text-muted-foreground">
                  {t('notesField.label')}
                </FormLabel>
                {/* A line field like every other place you type on this form. It was a
                          rounded bordered box filled with `--background`, which is the *ground*
                          colour sitting on a `--card` sheet — a faintly grey panel on white, and
                          the only field here that had one. */}
                <div className="rounded-md bg-muted transition-shadow focus-within:ring-2 focus-within:ring-primary">
                  <FormControl>
                    <Textarea
                      className="min-h-[60px] resize-none rounded-[8px] border-0 bg-transparent px-2.5 py-2 text-base sm:text-base shadow-none focus-visible:ring-0"
                      {...field}
                    />
                  </FormControl>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="recurrenceRule"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-2 space-y-0 px-6 py-1">
                {/* One choice, one value: the same row as Paid by and the date rather than
                          a full-width combobox under a heading. */}
                <FormLabel className="text-sm font-normal text-muted-foreground">
                  {t(`${sExpense}.recurrenceRule.label`)}
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <SelectTrigger className="h-11 w-auto justify-end gap-1 rounded-md border-0 bg-muted px-3 font-medium shadow-none focus:ring-0 sm:h-10 [&>svg]:opacity-40">
                    <SelectValue placeholder="NONE" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">
                      {t(`${sExpense}.recurrenceRule.none`)}
                    </SelectItem>
                    <SelectItem value="DAILY">
                      {t(`${sExpense}.recurrenceRule.daily`)}
                    </SelectItem>
                    <SelectItem value="WEEKLY">
                      {t(`${sExpense}.recurrenceRule.weekly`)}
                    </SelectItem>
                    <SelectItem value="MONTHLY">
                      {t(`${sExpense}.recurrenceRule.monthly`)}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {!isIncome && !isMultiPayer && (
            <FormField
              control={form.control}
              name="isReimbursement"
              render={({ field }) => (
                // The label already carried the click — what it did not carry was the
                // 176px of dead row between the end of the words and a 16px box pinned to
                // the right edge. Stretching the label across that gap makes the whole row
                // the target, which is what a row like this looks like it is.
                <FormItem className="flex min-h-11 flex-row items-center justify-between gap-2 space-y-0 px-6 sm:min-h-10">
                  <FormLabel className="flex-1 cursor-pointer py-3 text-sm font-normal text-muted-foreground">
                    {t('isReimbursementField.label')}
                  </FormLabel>
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          )}

          {/* Deliberately out here rather than in the split sheet: this applies to any
                    split, and the sheet is only reachable from the third position — so putting it
                    there would make it impossible to remember an even split. */}
          <FormField
            control={form.control}
            name="saveDefaultSplittingOptions"
            render={({ field }) => (
              <FormItem className="flex min-h-11 flex-row items-center justify-between gap-2 space-y-0 px-6 sm:min-h-10">
                <FormLabel className="flex-1 cursor-pointer py-3 text-sm font-normal text-muted-foreground">
                  {t('SplitModeField.saveAsDefault')}
                </FormLabel>
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </CollapsibleContent>
      </Collapsible>
    </>
  )
}
