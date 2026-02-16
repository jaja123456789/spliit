'use client'

import { CategorySelector } from '@/components/category-selector'
import { CurrencySelector } from '@/components/currency-selector'
import { ExpenseDocumentsInput } from '@/components/expense-documents-input'
import { SubmitButton } from '@/components/submit-button'
import { Button } from '@/components/ui/button'
import { CalculatorInput } from '@/components/ui/calculator-input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Form,
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
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label' // <--- Add this line
import { Locale } from '@/i18n/request'
import { defaultCurrencyList, getCurrency } from '@/lib/currency'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { useActiveUser, useCurrencyRate } from '@/lib/hooks'
import {
  ExpenseFormValues,
  SplittingOptions,
  expenseFormSchema,
} from '@/lib/schemas'
import { calculateShare } from '@/lib/totals'
import {
  amountAsDecimal,
  amountAsMinorUnits,
  cn,
  formatCurrency,
  getCurrencyFromGroup,
} from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { zodResolver } from '@hookform/resolvers/zod'
import { RecurrenceRule } from '@prisma/client'
import { Plus, Save, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { match } from 'ts-pattern'
import { DeletePopup } from '../../../../components/delete-popup'
import { extractCategoryFromTitle } from '../../../../components/expense-form-actions'
import { ItemizationBuilder } from './itemization-builder' // Import new component
import { Crown } from 'lucide-react' // Add a subtle icon
import { Badge } from '@/components/ui/badge'



// --- Helpers ---

const enforceCurrencyPattern = (value: string) =>
  value
    .replace(/^\s*-/, '_')
    .replace(/[.,]/, '#')
    .replace(/[-.,]/g, '')
    .replace(/_/, '-')
    .replace(/#/, '.')
    .replace(/[^-\d.]/g, '')

const getDefaultSplittingOptions = (
  group: NonNullable<AppRouterOutput['groups']['get']['group']>,
) => {
  const defaultValue = {
    splitMode: 'EVENLY' as const,
    paidFor: group.participants.map(({ id }) => ({
      participant: id,
      shares: '1' as any,
    })),
  }
  if (typeof localStorage === 'undefined') return defaultValue
  const defaultSplitMode = localStorage.getItem(
    `${group.id}-defaultSplittingOptions`,
  )
  if (defaultSplitMode === null) return defaultValue

  try {
    const parsedDefaultSplitMode = JSON.parse(
      defaultSplitMode,
    ) as SplittingOptions

    if (parsedDefaultSplitMode.paidFor) {
      for (const parsedPaidFor of parsedDefaultSplitMode.paidFor) {
        if (
          !group.participants.some(({ id }) => id === parsedPaidFor.participant)
        ) {
          localStorage.removeItem(`${group.id}-defaultSplittingOptions`)
          return defaultValue
        }
      }
    } else {
      parsedDefaultSplitMode.paidFor = defaultValue.paidFor
    }

    return {
      splitMode: parsedDefaultSplitMode.splitMode,
      paidFor: parsedDefaultSplitMode.paidFor.map((paidFor) => ({
        participant: paidFor.participant,
        shares: (paidFor.shares / 100).toString() as any,
      })),
    }
  } catch (e) {
    return defaultValue
  }
}

async function persistDefaultSplittingOptions(
  groupId: string,
  expenseFormValues: ExpenseFormValues,
) {
  if (localStorage && expenseFormValues.saveDefaultSplittingOptions) {
    const computePaidFor = (): SplittingOptions['paidFor'] => {
      if (expenseFormValues.splitMode === 'EVENLY') {
        return expenseFormValues.paidFor.map(({ participant }) => ({
          participant,
          shares: 100,
        }))
      } else if (expenseFormValues.splitMode === 'BY_AMOUNT') {
        return null
      } else {
        return expenseFormValues.paidFor
      }
    }
    const splittingOptions = {
      splitMode: expenseFormValues.splitMode,
      paidFor: computePaidFor(),
    } satisfies SplittingOptions
    localStorage.setItem(
      `${groupId}-defaultSplittingOptions`,
      JSON.stringify(splittingOptions),
    )
  }
}

function formatDate(date?: Date) {
  if (!date || isNaN(date as any)) date = new Date()
  return date.toISOString().substring(0, 10)
}

// --- Main Component ---

export function ExpenseForm({
  group,
  categories,
  expense,
  onSubmit,
  onDelete,
  runtimeFeatureFlags,
}: {
  group: NonNullable<AppRouterOutput['groups']['get']['group']>
  categories: AppRouterOutput['categories']['list']['categories']
  expense?: AppRouterOutput['groups']['expenses']['get']['expense']
  onSubmit: (value: ExpenseFormValues, participantId?: string) => Promise<void>
  onDelete?: (participantId?: string) => Promise<void>
  runtimeFeatureFlags: RuntimeFeatureFlags
}) {
  const t = useTranslations('ExpenseForm')
  const locale = useLocale() as Locale
  const isCreate = expense === undefined
  const searchParams = useSearchParams()
  const groupCurrency = getCurrencyFromGroup(group)
  const activeUserId = useActiveUser(group.id)

  const getSelectedPayer = (field?: { value: string }) => {
    if (isCreate && typeof window !== 'undefined') {
      const activeUser = localStorage.getItem(`${group.id}-activeUser`)
      if (activeUser && activeUser !== 'None' && field?.value === undefined) {
        return activeUser
      }
    }
    return field?.value
  }

  const defaultSplittingOptions = getDefaultSplittingOptions(group)
  const defaultPayerId = getSelectedPayer() ?? group.participants[0].id
  const initialAmount = searchParams.get('amount') || '0'

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    mode: 'onChange',
    defaultValues: expense
      ? {
          title: expense.title,
          expenseDate: expense.expenseDate ?? new Date(),
          originalCurrency: expense.originalCurrency ?? group.currencyCode,
          originalAmount: expense.originalAmount ?? undefined,
          conversionRate: expense.conversionRate?.toNumber(),
          category: expense.categoryId,
          paidBy: expense.paidBy.map((pb) => ({
            participant: pb.participantId,
            amount: amountAsDecimal(pb.amount, groupCurrency),
          })),
          paidFor: expense.paidFor.map(({ participantId, shares }) => ({
            participant: participantId,
            shares: (expense.splitMode === 'BY_AMOUNT'
              ? amountAsDecimal(shares, groupCurrency)
              : (shares / 100).toString()) as any,
          })),
          splitMode: expense.splitMode,
          saveDefaultSplittingOptions: false,
          isReimbursement: expense.isReimbursement,
          documents: expense.documents,
          notes: expense.notes ?? '',
          recurrenceRule: expense.recurrenceRule ?? undefined,
          items: expense?.items.map(i => ({
            id: i.id,
            name: i.name,
            price: amountAsDecimal(i.price, groupCurrency),
            participantIds: i.participantIds
          })) ?? [],
        }
      : searchParams.get('reimbursement')
        ? {
            title: t('reimbursement'),
            expenseDate: new Date(),
            originalCurrency: group.currencyCode,
            originalAmount: undefined,
            conversionRate: undefined,
            category: 1,
            paidBy: [
              {
                participant: searchParams.get('from') ?? defaultPayerId,
                amount: amountAsDecimal(
                  Number(searchParams.get('amount')) || 0,
                  groupCurrency,
                ),
              },
            ],
            paidFor: [
              searchParams.get('to')
                ? {
                    participant: searchParams.get('to')!,
                    shares: '1' as any,
                  }
                : undefined,
            ],
            isReimbursement: true,
            splitMode: defaultSplittingOptions.splitMode,
            saveDefaultSplittingOptions: false,
            documents: [],
            notes: '',
            recurrenceRule: RecurrenceRule.NONE,
          }
        : {
            title: searchParams.get('title') ?? '',
            expenseDate: searchParams.get('date')
              ? new Date(searchParams.get('date') as string)
              : new Date(),
            originalCurrency: group.currencyCode ?? undefined,
            originalAmount: undefined,
            conversionRate: undefined,
            category: searchParams.get('categoryId')
              ? Number(searchParams.get('categoryId'))
              : 0,
            paidFor: defaultSplittingOptions.paidFor,
            paidBy: [
              {
                participant: defaultPayerId,
                amount: amountAsDecimal(Number(initialAmount), groupCurrency),
              },
            ],
            isReimbursement: false,
            splitMode: defaultSplittingOptions.splitMode,
            saveDefaultSplittingOptions: false,
            documents: searchParams.get('imageUrl')
              ? [
                  {
                    id: randomId(),
                    url: searchParams.get('imageUrl') as string,
                    width: Number(searchParams.get('imageWidth')),
                    height: Number(searchParams.get('imageHeight')),
                  },
                ]
              : [],
            notes: '',
            recurrenceRule: RecurrenceRule.NONE,
          },
  })
  const { trigger, setValue, getValues, watch } = form; // Destructure for convenience

  // Dynamic fields for multiple payers
  const { fields: payerFields, append: appendPayer, remove: removePayer } = useFieldArray({
    control: form.control,
    name: 'paidBy',
  })

  const { fields: itemFields, append: itemAppend, remove: itemRemove, replace: itemReplace } = useFieldArray({
    control: form.control,
    name: 'items',
  })

  // Watches
  const paidByValues = useWatch({ control: form.control, name: 'paidBy' })
  const splitMode = useWatch({ control: form.control, name: 'splitMode' })
  const expenseDate = useWatch({ control: form.control, name: 'expenseDate' })
  const originalCurrencyVal = useWatch({
    control: form.control,
    name: 'originalCurrency',
  })
  
  // Derived state
  const totalAmount = paidByValues.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0,
  )
  const isIncome = totalAmount < 0
  const isMultiPayer = payerFields.length > 1
  const sExpense = isIncome ? 'Income' : 'Expense'
  const maxAmount = Math.max(...paidByValues.map((p) => Number(p.amount) || 0))

  const originalCurrency = getCurrency(originalCurrencyVal, locale, 'Custom')
  const exchangeRate = useCurrencyRate(
    expenseDate,
    originalCurrencyVal ?? '',
    groupCurrency.code,
  )
  const conversionRequired =
    group.currencyCode &&
    group.currencyCode.length &&
    originalCurrency.code.length &&
    originalCurrency.code !== group.currencyCode

  const [usingCustomConversionRate, setUsingCustomConversionRate] = useState(
    !!form.formState.defaultValues?.conversionRate,
  )
  const [isCategoryLoading, setCategoryLoading] = useState(false)
  
  // Track manual edits for BY_AMOUNT mode
  const [manuallyEditedParticipants, setManuallyEditedParticipants] = useState<
    Set<string>
  >(() => {
    if (expense?.splitMode === 'BY_AMOUNT') {
      return new Set(group.participants.map((p) => p.id))
    }
    return new Set()
  })

  const [isItemized, setIsItemized] = useState(form.getValues('items')?.length > 0)

  const getIsParticipantPaying = (participantId: string, currentIndex: number) => {
    return paidByValues.some((field, index) => 
      index !== currentIndex && field.participant === participantId
    )
  }

  const handleAddPayer = () => {
    const currentPayers = new Set(form.getValues('paidBy').map(p => p.participant))
    // Find first participant not in the set
    const nextAvailable = group.participants.find(p => !currentPayers.has(p.id))
    // Default to the first person if everyone is already listed 
    const defaultId = nextAvailable?.id || group.participants[0].id
    appendPayer({ participant: defaultId, amount: 0 })
  }

  // Helper to recalculate BY_AMOUNT distribution ensuring sum(shares) == totalAmount
  // This handles the "missing cent" issue by adding the remainder to the first unedited person.
  const recalculateByAmount = useCallback((
    currentTotal: number, 
    currentPaidFor: ExpenseFormValues['paidFor'], 
    editedSet: Set<string>
  ) => {
    let remainingAmount = currentTotal
    let newPaidFor = [...currentPaidFor]

    // 1. Subtract locked amounts
    newPaidFor = newPaidFor.map((participant) => {
      if (editedSet.has(participant.participant)) {
        const participantShare = Number(participant.shares) || 0
        remainingAmount -= participantShare
      }
      return participant
    })

    // 2. Distribute remainder among unlocked participants
    const uneditedParticipants = newPaidFor.filter(p => !editedSet.has(p.participant))
    const count = uneditedParticipants.length

    if (count > 0) {
      // Calculate precision factor (e.g. 100 for 2 decimals)
      const precision = Math.pow(10, groupCurrency.decimal_digits)
      
      // Convert remaining amount to integer units to handle distribution cleanly
      // We use round to avoid floating point artifacts before distribution
      let remainingUnits = Math.round(remainingAmount * precision)
      
      // Base share per person (integer division)
      // Math.trunc works better for potential negative numbers (income)
      const baseShareUnits = Math.trunc(remainingUnits / count)
      
      // Remainder units to distribute
      let remainderUnits = remainingUnits - (baseShareUnits * count)

      let seed = Math.abs(Math.round(currentTotal * 100))

      newPaidFor = newPaidFor.map((participant, idx) => {
        if (!editedSet.has(participant.participant)) {
          let currentUnits = baseShareUnits
          
          // Distribute remainder pseudo-randomly but deterministically based on input
          // This prevents the "cursor jumping" or values changing while typing
          // but satisfies the "random participant" requirement visually.
          const isTarget = (seed + idx) % count < Math.abs(remainderUnits)
          
          if (isTarget) {
            if (remainderUnits > 0) {
              currentUnits += 1
            } else {
              currentUnits -= 1
            }
          }
          return {
            ...participant,
            shares: (currentUnits / precision).toFixed(groupCurrency.decimal_digits) as any
          }
        }
        return participant
      })
    }
    
    return newPaidFor
  }, [groupCurrency.decimal_digits])

  const handlePayerAmountChange = (index: number, newValue: string) => {
    setValue(`paidBy.${index}.amount`, newValue as any, { 
      shouldDirty: true, 
      shouldTouch: true 
    });

    if (isItemized) {
      // CORRECT: Use 'trigger' from the form object
      trigger('items');
    } else if (splitMode === 'BY_AMOUNT') {
      const currentPaidFor = getValues('paidFor');
      const currentPayers = getValues('paidBy');
      // Recalculate total. Note: we need to handle string inputs safely here for calculation
      const newTotal = currentPayers.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const redistributed = recalculateByAmount(newTotal, currentPaidFor, manuallyEditedParticipants);
      setValue('paidFor', redistributed, { shouldValidate: true });
    }
    
    // Always trigger paidBy validation to ensure cross-field rules re-run
    trigger('paidBy');
  };

  // --- Effects ---

  useEffect(() => {
    if (isCreate && searchParams.get('fromReceipt') === 'true') {
      try {
        const storedData = sessionStorage.getItem('pendingReceiptData')
        if (storedData) {
          const data = JSON.parse(storedData)
          sessionStorage.removeItem('pendingReceiptData');

          const formItems = (data.items || []).map((item: any) => ({
            name: item.name || 'Unknown Item',
            price: Number(item.price) || 0,
            participantIds: [] 
          }))

          const currentValues = form.getValues()

          // Reset the WHOLE form at once
          form.reset({
            ...currentValues, // Keep current values
            title: data.title || '',
            expenseDate: data.date ? new Date(data.date) : new Date(),
            category: data.categoryId ? Number(data.categoryId) : undefined,
            documents: data.documents || [],
            items: formItems, // This replaces useFieldArray automatically
            paidBy: [
              {
                ...currentValues.paidBy?.[0], // Keep the userId or other props
                amount: Number(data.amount) || 0
              }
            ]
          })

          setIsItemized(formItems.length > 0)
        }
      } catch (e) {
        console.error("Failed to load receipt data", e)
      }
    }
  }, [isCreate, searchParams, itemReplace])

  useEffect(() => {
    if (totalAmount < 0) form.setValue('isReimbursement', false)
  }, [totalAmount, form])

  // Conversion rate logic
  useEffect(() => {
    if (!usingCustomConversionRate && exchangeRate.data) {
      form.setValue('conversionRate', exchangeRate.data)
    }
  }, [exchangeRate.data, usingCustomConversionRate, form])

  // Auto-convert original amount (Single Payer)
  useEffect(() => {
    if (isMultiPayer) return
    const originalAmount = form.getValues('originalAmount')
    const conversionRate = form.getValues('conversionRate')

    if (
      form.getFieldState('originalAmount').isTouched &&
      conversionRate &&
      originalAmount
    ) {
      const rate = Number(conversionRate)
      const converted = originalAmount * rate
      if (!Number.isNaN(converted)) {
        const formatted = enforceCurrencyPattern(
          converted.toFixed(groupCurrency.decimal_digits),
        )
        form.setValue(`paidBy.0.amount`, Number(formatted), { shouldValidate: true })
      }
    }
  }, [
    form.watch('originalAmount'),
    form.watch('conversionRate'),
    isMultiPayer,
    groupCurrency.decimal_digits,
    form,
  ])

  // Recalculate BY_AMOUNT if total changes (e.g. Payer Added/Removed)
  useEffect(() => {
    const currentSplitMode = form.getValues('splitMode')
    if (currentSplitMode === 'BY_AMOUNT') {
      const paidFor = form.getValues('paidFor')
      const newPaidFor = recalculateByAmount(totalAmount, paidFor, manuallyEditedParticipants)

      const current = JSON.stringify(paidFor)
      const next = JSON.stringify(newPaidFor)
      
      if (current !== next) {
          form.setValue('paidFor', newPaidFor, { shouldValidate: true })
      } else {
          // Force validation even if values didn't change (e.g. total changed but shares match accidentally)
          form.trigger('paidFor') 
      }
    }
  }, [
    manuallyEditedParticipants,
    totalAmount, // This dependency ensures we recalculate when payer amounts change
    form,
    recalculateByAmount
  ])

  useEffect(() => {
    if (isItemized) {
      // When switching TO itemized, we don't necessarily change splitMode immediately
      // but the Schema transform will force it to BY_AMOUNT on submit.
    } else {
      // Clear items when switching off
      form.setValue('items', [])
    }
  }, [isItemized, form])

  useEffect(() => {
    if (isItemized) {
      // Force splitMode to BY_AMOUNT internally when itemizing
      // This makes sure the validation rules for BY_AMOUNT are active
      form.setValue('splitMode', 'BY_AMOUNT', { shouldValidate: true });
    }
  }, [isItemized, form]);

  // Trigger validation on PaidFor when splitMode changes to clear stale errors
  const handleSplitModeChange = (newMode: string) => {
    // 1. Reset manual edits so we get a fresh distribution (optional, but usually desired on mode switch)
    setManuallyEditedParticipants(new Set())
    
    // 2. Perform distribution if switching TO By Amount immediately
    if (newMode === 'BY_AMOUNT') {
        const paidFor = form.getValues('paidFor')
        const newPaidFor = recalculateByAmount(totalAmount, paidFor, new Set())
        form.setValue('paidFor', newPaidFor) // Set value first without validation
    }

    // 3. Update Mode
    form.setValue('splitMode', newMode as any, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    })
    
    // 4. Force validation on the array to ensure errors (like "totals don't match") update/clear
    setTimeout(() => form.trigger('paidFor'), 0)
  }

  const submit = async (values: ExpenseFormValues) => {
    if (isItemized && values.items.length > 0) {
        values.splitMode = 'BY_AMOUNT';
    }

    await persistDefaultSplittingOptions(group.id, values)

    const validPayers = values.paidBy.filter((pb) => Number(pb.amount) > 0)
    // Fallback if all are 0 (validation catches this, but to be safe)
    if (validPayers.length === 0 && values.paidBy.length > 0) {
        values.paidBy = [values.paidBy[0]]
    } else {
        values.paidBy = validPayers
    }

    if (!conversionRequired) {
      delete values.originalAmount
      delete values.originalCurrency
    }

    return onSubmit(values, activeUserId ?? undefined)
  }

  // --- Rendering Helpers ---

  let conversionRateMessage = ''
  if (exchangeRate.isLoading) {
    conversionRateMessage = t('conversionRateState.loading')
  } else if (exchangeRate.error) {
    conversionRateMessage = t('conversionRateState.error')
  } else if (exchangeRate.data) {
    conversionRateMessage = `${t('conversionRateState.success')} ${
      originalCurrencyVal
    }\xa01\xa0=\xa0${group.currencyCode}\xa0${exchangeRate.data}`
  } else {
    conversionRateMessage = t('conversionRateState.currencyNotFound')
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)}>
        <Card>
          <CardHeader>
            <CardTitle>
              {t(`${sExpense}.${isCreate ? 'create' : 'edit'}`)}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`${sExpense}.TitleField.label`)}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t(`${sExpense}.TitleField.placeholder`)}
                      className="text-base"
                      {...field}
                      onBlur={async () => {
                        field.onBlur()
                        if (
                          runtimeFeatureFlags.enableCategoryExtract &&
                          field.value
                        ) {
                          setCategoryLoading(true)
                          try {
                            const { categoryId } =
                              await extractCategoryFromTitle(field.value)
                            form.setValue('category', categoryId)
                          } finally {
                            setCategoryLoading(false)
                          }
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(`${sExpense}.TitleField.description`)}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expenseDate"
              render={({ field }) => (
                <FormItem className="sm:order-1">
                  <FormLabel>{t(`${sExpense}.DateField.label`)}</FormLabel>
                  <FormControl>
                    <Input
                      className="date-base"
                      type="date"
                      value={formatDate(field.value)}
                      onChange={(e) =>
                        field.onChange(new Date(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    {t(`${sExpense}.DateField.description`)}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Paid By Section */}
            <div className="sm:order-5 col-span-2">
                <FormLabel className="flex items-center gap-2">
                  {t(`${sExpense}.paidByField.label`)}
                  {isMultiPayer && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1 uppercase tracking-tighter">
                      Multi-Payer Mode
                    </Badge>
                  )}
                </FormLabel>
                
                <div className="flex flex-col gap-2 mt-2">
                  {payerFields.map((field, index) => {
                    // Determine if this specific row is the highest payer
                    const currentAmount = Number(paidByValues[index]?.amount) || 0
                    const isHighest = isMultiPayer && currentAmount > 0 && currentAmount === maxAmount

                    return (
                      <div 
                        key={field.id} 
                        className={cn(
                          "flex gap-2 items-start p-2 rounded-lg transition-all border border-transparent",
                          // If they are the highest, give them a subtle background and border
                          isHighest ? "bg-primary/5 border-primary/20 shadow-sm" : "bg-transparent"
                        )}
                      >
                        <FormField
                          control={form.control}
                          name={`paidBy.${index}.participant`}
                          render={({ field }) => (
                            <FormItem className="flex-1 space-y-0">
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className={cn(isHighest && "border-primary/30")}>
                                    <div className="flex items-center gap-2">
                                      {/* Optional: Add a subtle icon for the lead payer */}
                                      {isHighest && <Crown className="w-3 h-3 text-primary" />}
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
                                <span className={cn(
                                  "mr-2 text-sm transition-colors",
                                  isHighest ? "text-primary font-bold" : "text-muted-foreground"
                                )}>
                                  {group.currency}
                                </span>
                                <FormControl>
                                  <CalculatorInput
                                    className={cn("text-base", isHighest && "border-primary/30 font-medium")}
                                    placeholder="0.00"
                                    {...field}
                                    onValueChange={(val) => {
                                      // Use the synchronized handler we discussed in the previous step
                                      handlePayerAmountChange(index, val);
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
                            className="shrink-0 hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
                
                <div className="flex justify-between items-center mt-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleAddPayer}
                        className="text-primary"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        {t('addPayer')}
                    </Button>
                    {payerFields.length > 1 && (
                    <div className={cn(
                        "text-right font-medium px-3 py-2 bg-muted/50 rounded-md transition-colors",
                        totalAmount <= 0 ? "text-destructive" : "text-foreground"
                    )}>
                        {t('total')}: {formatCurrency(groupCurrency, totalAmount, locale, true)}
                    </div>
                )}
                </div>
            </div>

            <div className="flex items-center justify-end space-x-2 my-4">
              <Label htmlFor="itemize-mode" className="text-sm text-muted-foreground">Itemize Mode</Label>
              <Switch
                id="itemize-mode"
                checked={isItemized}
                onCheckedChange={setIsItemized}
              />
            </div>


            {!isMultiPayer && (
              <>
                <FormField
                  control={form.control}
                  name="originalCurrency"
                  render={({ field }) => (
                    <FormItem className="sm:order-3">
                      <FormLabel>
                        {t(`${sExpense}.currencyField.label`)}
                      </FormLabel>
                      <FormControl>
                        {group.currencyCode ? (
                          <CurrencySelector
                            currencies={defaultCurrencyList(locale, '')}
                            defaultValue={field.value ?? ''}
                            isLoading={false}
                            onValueChange={field.onChange}
                          />
                        ) : (
                          <Input
                            className="text-base"
                            disabled
                            {...field}
                            placeholder={group.currency}
                          />
                        )}
                      </FormControl>
                      <FormDescription>
                        {t(`${sExpense}.currencyField.description`)}{' '}
                        {!group.currencyCode && t('conversionUnavailable')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div
                  className={`sm:order-4 ${
                    !conversionRequired ? 'max-sm:hidden sm:invisible' : ''
                  } col-span-2 md:col-span-1 space-y-2`}
                >
                  <FormField
                    control={form.control}
                    name="originalAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('originalAmountField.label')}</FormLabel>
                        <div className="flex items-baseline gap-2">
                          <span>{originalCurrency.symbol}</span>
                          <FormControl>
                            <Input
                              className="text-base max-w-[120px]"
                              type="text"
                              inputMode="decimal"
                              placeholder="0.00"
                              {...field}
                              onChange={(e) =>
                                field.onChange(
                                  enforceCurrencyPattern(e.target.value),
                                )
                              }
                              onFocus={(e) => {
                                setTimeout(() => e.target.select(), 1)
                              }}
                            />
                          </FormControl>
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
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Collapsible
                    open={usingCustomConversionRate}
                    onOpenChange={setUsingCustomConversionRate}
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
                            <FormLabel>
                              {t('conversionRateField.label')}
                            </FormLabel>
                            <div className="flex items-baseline gap-2">
                              <span>
                                {originalCurrency.symbol} 1 = {group.currency}
                              </span>
                              <FormControl>
                                <Input
                                  className="text-base max-w-[120px]"
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  {...field}
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
              </>
            )}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem className="order-3 sm:order-2">
                  <FormLabel>{t('categoryField.label')}</FormLabel>
                  <CategorySelector
                    categories={categories}
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                    isLoading={isCategoryLoading}
                  />
                  <FormDescription>
                    {t(`${sExpense}.categoryFieldDescription`)}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!isIncome && !isMultiPayer && (
              <FormField
                control={form.control}
                name="isReimbursement"
                render={({ field }) => (
                  <FormItem className="sm:order-5 flex flex-row gap-2 items-center space-y-0 pt-8">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div>
                      <FormLabel>{t('isReimbursementField.label')}</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="sm:order-6">
                  <FormLabel>{t('notesField.label')}</FormLabel>
                  <FormControl>
                    <Textarea className="text-base" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="recurrenceRule"
              render={({ field }) => (
                <FormItem className="sm:order-5">
                  <FormLabel>{t(`${sExpense}.recurrenceRule.label`)}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <SelectTrigger>
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
                  <FormDescription>
                    {t(`${sExpense}.recurrenceRule.description`)}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>
        {isItemized ? (
          <Card className="mt-4 border-dashed border-2">
            <CardHeader>
              <CardTitle>Itemization</CardTitle>
              <CardDescription>Break down the receipt. Totals will be auto-calculated.</CardDescription>
            </CardHeader>
            <CardContent>
              <ItemizationBuilder 
                group={group} 
                currency={groupCurrency}
                totalAmount={totalAmount}
                fields={itemFields}
                append={itemAppend}
                remove={itemRemove}
                activeUserId={activeUserId} 
              />
            </CardContent>
          </Card>
        ) : (
          // Standard "Paid For" Card
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex justify-between">
                <span>{t(`${sExpense}.paidFor.title`)}</span>
                <Button
                  variant="link"
                  type="button"
                  className="-my-2 -mx-4"
                  onClick={() => {
                    const currentPaidFor = form.getValues('paidFor')
                    const allSelected =
                      currentPaidFor.length === group.participants.length
                    const newPaidFor = allSelected
                      ? []
                      : group.participants.map((p) => {
                          const existing = currentPaidFor.find(
                            (pf) => pf.participant === p.id,
                          )
                          return {
                            participant: p.id,
                            shares: existing?.shares ?? '1',
                          }
                        })
                    form.setValue('paidFor', newPaidFor as any, {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: true,
                    })
                    if (!allSelected) {
                      setManuallyEditedParticipants(new Set())
                    }
                  }}
                >
                  {form.watch('paidFor').length === group.participants.length ? (
                    <>{t('selectNone')}</>
                  ) : (
                    <>{t('selectAll')}</>
                  )}
                </Button>
              </CardTitle>
              <CardDescription>
                {t(`${sExpense}.paidFor.description`)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* 
                We bind the FormField to "paidFor" (the array root).
              */}
              <FormField
                control={form.control}
                name="paidFor"
                render={({ fieldState }) => {
                  return (
                    <FormItem className="sm:order-4 row-span-2 space-y-0">
                        <PaidForList
                            form={form}
                            group={group}
                            groupCurrency={groupCurrency}
                            totalAmount={totalAmount}
                            splitMode={splitMode}
                            manuallyEditedParticipants={manuallyEditedParticipants}
                            setManuallyEditedParticipants={setManuallyEditedParticipants}
                            recalculateByAmount={recalculateByAmount}
                        />
                        <FormMessage />
                    </FormItem>
                  )
                }}
              />

              <Collapsible
                className="mt-5"
                defaultOpen={splitMode !== 'EVENLY'}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="link" type="button" className="-mx-4">
                    {t('advancedOptions')}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid sm:grid-cols-2 gap-6 pt-3">
                    <FormField
                      control={form.control}
                      name="splitMode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('SplitModeField.label')}</FormLabel>
                          <FormControl>
                            <Select
                              onValueChange={handleSplitModeChange}
                              defaultValue={field.value}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="EVENLY">
                                  {t('SplitModeField.evenly')}
                                </SelectItem>
                                <SelectItem value="BY_SHARES">
                                  {t('SplitModeField.byShares')}
                                </SelectItem>
                                <SelectItem value="BY_PERCENTAGE">
                                  {t('SplitModeField.byPercentage')}
                                </SelectItem>
                                <SelectItem value="BY_AMOUNT">
                                  {t('SplitModeField.byAmount')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormDescription>
                            {t(`${sExpense}.splitModeDescription`)}
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="saveDefaultSplittingOptions"
                      render={({ field }) => (
                        <FormItem className="flex flex-row gap-2 items-center space-y-0 pt-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div>
                            <FormLabel>
                              {t('SplitModeField.saveAsDefault')}
                            </FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        )}
        {runtimeFeatureFlags.enableExpenseDocuments && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex justify-between">
                <span>{t('attachDocuments')}</span>
              </CardTitle>
              <CardDescription>
                {t(`${sExpense}.attachDescription`)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="documents"
                render={({ field }) => (
                  <ExpenseDocumentsInput
                    documents={field.value}
                    updateDocuments={field.onChange}
                  />
                )}
              />
            </CardContent>
          </Card>
        )}
        
        {/* Global Error Fallback */}
        {form.formState.errors.root && (
          <div className="mt-4 text-sm font-medium text-destructive">
            {form.formState.errors.root.message}
          </div>
        )}
        
        <div className="flex mt-4 gap-2">
          <SubmitButton loadingContent={t(isCreate ? 'creating' : 'saving')}>
            <Save className="w-4 h-4 mr-2" />
            {t(isCreate ? 'create' : 'save')}
          </SubmitButton>
          {!isCreate && onDelete && (
            <DeletePopup
              onDelete={() => onDelete(activeUserId ?? undefined)}
            ></DeletePopup>
          )}
          <Button variant="ghost" asChild>
            <Link href={`/groups/${group.id}`}>{t('cancel')}</Link>
          </Button>
        </div>
      </form>
    </Form>
  )
}

function PaidForList({
  form,
  group,
  groupCurrency,
  totalAmount,
  splitMode,
  manuallyEditedParticipants,
  setManuallyEditedParticipants,
  recalculateByAmount
}: {
  form: any 
  group: NonNullable<AppRouterOutput['groups']['get']['group']>
  groupCurrency: any
  totalAmount: number
  splitMode: string
  manuallyEditedParticipants: Set<string>
  setManuallyEditedParticipants: (s: Set<string>) => void
  recalculateByAmount: (total: number, paidFor: any, edited: Set<string>) => any
}) {
  const t = useTranslations('ExpenseForm')
  const locale = useLocale() as Locale
  const paidForValues = useWatch({ control: form.control, name: 'paidFor' })
  const paidByValues = useWatch({ control: form.control, name: 'paidBy' })
  const isReimbursement = useWatch({
    control: form.control,
    name: 'isReimbursement',
  })
  const expenseDate = useWatch({ control: form.control, name: 'expenseDate' })

  const getCalculatedShare = (participantId: string) => {
    return calculateShare(participantId, {
      amount: amountAsMinorUnits(totalAmount, groupCurrency),
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
            return amountAsMinorUnits(numShares, groupCurrency)
          return numShares
        })(),
      })),
      splitMode: splitMode as any,
      isReimbursement: isReimbursement,
      paidBy: paidByValues.map((pb: any) => ({
        participantId: pb.participant,
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
        : p
    );

    // 3. If in BY_AMOUNT mode, trigger the redistribution logic synchronously
    //    so the user sees the numbers balance out as they type.
    if (splitMode === 'BY_AMOUNT') {
      currentPaidFor = recalculateByAmount(totalAmount, currentPaidFor, newEditedSet);
    }

    // 4. Update form
    form.setValue('paidFor', currentPaidFor, { shouldValidate: true, shouldDirty: true })

    form.trigger('paidBy');
  }

  return (
    <>
      {group.participants.map(({ id, name }) => {
        const isSelected = paidForValues.some((p: any) => p.participant === id)
        const currentShare = paidForValues.find((p: any) => p.participant === id)?.shares || ''

        return (
          <div
            key={id}
            data-id={`${id}/${splitMode}/${group.currency}`}
            className="flex flex-wrap gap-y-4 items-center border-t last-of-type:border-b last-of-type:!mb-4 -mx-6 px-6 py-3"
          >
            <FormItem className="flex-1 flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => {
                    const currentPaidFor = form.getValues('paidFor')
                    const options = {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: true,
                    }
                    if (checked) {
                      form.setValue(
                        'paidFor',
                        [
                          ...currentPaidFor,
                          { participant: id, shares: '1' },
                        ] as any,
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
                  }}
                />
              </FormControl>
              <FormLabel className="text-sm font-normal flex-1">
                {name}
                {isSelected &&
                  !isReimbursement &&
                  splitMode !== 'BY_AMOUNT' && (
                    <span className="text-muted-foreground ml-2">
                      (
                      {formatCurrency(
                        groupCurrency,
                        getCalculatedShare(id),
                        locale,
                      )}
                      )
                    </span>
                  )}
              </FormLabel>
            </FormItem>

            <div className="flex">
              {splitMode !== 'EVENLY' && isSelected && (
                  <div className="space-y-0">
                    <div className="flex gap-1 items-center">
                      {splitMode === 'BY_AMOUNT' && (
                        <span className={cn('text-sm text-muted-foreground')}>
                          {group.currency}
                        </span>
                      )}
                      <FormControl>
                        <CalculatorInput
                          inputClassName="text-base w-[80px] -my-2"
                          placeholder="0.00"
                          value={currentShare}
                          onValueChange={(val) => handleShareChange(id, val)}
                          disallowEmpty={false}
                        />
                      </FormControl>
                      {[
                        'BY_SHARES',
                        'BY_PERCENTAGE',
                      ].includes(splitMode) && (
                        <span className={cn('text-sm text-muted-foreground')}>
                          {match(splitMode)
                            .with('BY_SHARES', () => <>{t('shares')}</>)
                            .with('BY_PERCENTAGE', () => <>%</>)
                            .otherwise(() => <></>)}
                        </span>
                      )}
                    </div>
                  </div>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}