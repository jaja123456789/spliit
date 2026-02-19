'use client'

import { Button } from '@/components/ui/button'
import { CalculatorInput } from '@/components/ui/calculator-input'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Currency } from '@/lib/currency'
import { ExpenseFormValues } from '@/lib/schemas'
import { cn, formatCurrency } from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { Plus, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { UseFormReturn, useFieldArray } from 'react-hook-form'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>

type Props = {
  form: UseFormReturn<ExpenseFormValues>
  group: Group
  currency: Currency
  totalAmount: number
}

export function PaidBySection({ form, group, currency, totalAmount }: Props) {
  const t = useTranslations('ExpenseForm')
  const locale = useLocale()

  const {
    fields: payerFields,
    append: appendPayer,
    remove: removePayer,
  } = useFieldArray({
    control: form.control,
    name: 'paidBy',
  })

  // Improvement 1: Check if participant is already selected in another row
  const getIsParticipantSelected = (
    participantId: string,
    currentIndex: number,
  ) => {
    return payerFields.some(
      (field, index) =>
        index !== currentIndex &&
        form.watch(`paidBy.${index}.participant`) === participantId,
    )
  }

  // Improvement 2: Default to the first available participant who isn't paying
  const handleAddPayer = () => {
    const currentPayers = new Set(
      form.getValues('paidBy').map((p) => p.participant),
    )
    const nextAvailable = group.participants.find(
      (p) => !currentPayers.has(p.id),
    )
    const defaultId = nextAvailable?.id || group.participants[0].id

    appendPayer({ participant: defaultId, amount: 0 })
  }

  return (
    <div className="col-span-2 sm:order-5">
      <FormLabel>{t('Expense.paidByField.label')}</FormLabel>
      <div className="mt-2 flex flex-col gap-2">
        {payerFields.map((field, index) => (
          <div key={field.id} className="flex items-start gap-2">
            <FormField
              control={form.control}
              name={`paidBy.${index}.participant`}
              render={({ field }) => (
                <FormItem className="flex-1 space-y-0">
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {group.participants.map(({ id, name }) => (
                        <SelectItem
                          key={id}
                          value={id}
                          disabled={getIsParticipantSelected(id, index)}
                        >
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`paidBy.${index}.amount`}
              render={({ field }) => (
                <FormItem className="w-32 space-y-0">
                  <div className="flex items-center">
                    <span className="mr-2 text-sm text-muted-foreground">
                      {group.currency}
                    </span>
                    <FormControl>
                      <CalculatorInput
                        className="text-base"
                        placeholder="0.00"
                        {...field}
                        onValueChange={(val) => {
                          field.onChange(val)
                        }}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            {payerFields.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removePayer(index)}
                className="shrink-0"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleAddPayer}
          className="text-primary"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add payer
        </Button>
        {/* Improvement 4: Visual total with color cues */}
        {payerFields.length > 1 && (
          <div
            className={cn(
              'rounded-md bg-muted/50 px-3 py-2 text-right font-medium transition-colors',
              totalAmount <= 0 ? 'text-destructive' : 'text-foreground',
            )}
          >
            Total: {formatCurrency(currency, totalAmount, locale, true)}
          </div>
        )}
      </div>
    </div>
  )
}
