'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Form } from '@/components/ui/form'
import { Locale } from '@/i18n/request'
import { readActiveUser } from '@/lib/active-user'
import { getCurrency, normalizeCurrencyCode } from '@/lib/currency'
import {
  clearExpenseDraft,
  createDraftScope,
  editDraftScope,
} from '@/lib/expense-draft'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { useActiveUser, useCurrencyRate } from '@/lib/hooks'
import { ExpenseFormValues, expenseFormSchema } from '@/lib/schemas'
import {
  amountAsMinorUnits,
  cn,
  convertAmount,
  convertAmountParts,
  convertAmountPartsBack,
  formatAmountAsDecimal,
  getCurrencyFromGroup,
  randomId,
  todayAsDateOnly,
} from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { zodResolver } from '@hookform/resolvers/zod'
import { RecurrenceRule } from '@prisma/client'
import { ScanLine } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { CreateFromReceiptButton } from './create-from-receipt-button'
import { AmountField } from './expense-form-sections/amount-field'
import { DocumentsSection } from './expense-form-sections/documents-section'
import { DraftOffer } from './expense-form-sections/draft-offer'
import {
  getDefaultSplittingOptions,
  getOriginalTotalInMinorUnits,
  persistDefaultSplittingOptions,
  redistributeByAmount,
} from './expense-form-sections/helpers'
import { MoreOptions } from './expense-form-sections/more-options'
import { OffscreenErrors } from './expense-form-sections/offscreen-errors'
import { PayersAndDate } from './expense-form-sections/payers-and-date'
import { RecentShortcuts } from './expense-form-sections/recent-shortcuts'
import { RecipientField } from './expense-form-sections/recipient-field'
import { ShareIdentityContext } from './expense-form-sections/share-identity'
import {
  SplitModeSheet,
  SplitSection,
} from './expense-form-sections/split-section'
import { SubmitBar } from './expense-form-sections/submit-bar'
import { TitleField } from './expense-form-sections/title-field'
import { useExpenseDraft } from './expense-form-sections/use-expense-draft'

export function ExpenseForm({
  group,
  categories,
  expense,
  template,
  onSubmit,
  onDelete,
  runtimeFeatureFlags,
  newExpenseId,
}: {
  group: NonNullable<AppRouterOutput['groups']['get']['group']>
  categories: AppRouterOutput['categories']['list']['categories']
  expense?: AppRouterOutput['groups']['expenses']['get']['expense']
  /**
   * A new expense that starts as a copy of this one: same title, amount, people, split, category
   * and items, dated today. Its receipts and its recurrence stay with the original.
   */
  template?: AppRouterOutput['groups']['expenses']['get']['expense']
  onSubmit: (value: ExpenseFormValues, participantId?: string) => Promise<void>
  onDelete?: (participantId?: string) => Promise<void>
  runtimeFeatureFlags: RuntimeFeatureFlags
  /** The id a new expense will be saved under, so its preview divides cents as it will. */
  newExpenseId?: string
}) {
  const t = useTranslations('ExpenseForm')
  const shareIdentity = expense
    ? { id: expense.id, remainderRule: expense.remainderRule }
    : { id: newExpenseId, remainderRule: 2 }
  const tReceipt = useTranslations('CreateFromReceipt')
  const locale = useLocale() as Locale
  const isCreate = expense === undefined
  // What the form's values come from: the expense being edited, or the one being copied.
  const source = expense ?? template
  const searchParams = useSearchParams()
  const groupCurrency = getCurrencyFromGroup(group)
  const activeUserId = useActiveUser(group.id)

  const getSelectedPayer = (field?: { value: string }) => {
    if (isCreate && field?.value === undefined) {
      const activeUser = readActiveUser(group.id)
      if (activeUser) return activeUser
    }
    return field?.value
  }

  const defaultSplittingOptions = getDefaultSplittingOptions(group)
  const defaultPayerId = getSelectedPayer() ?? group.participants[0].id
  const initialAmount = searchParams.get('amount') || '0'

  // An expense can be entered in another currency than the group's, as long as the group uses a
  // real currency code: a custom symbol has no exchange rate to convert from.
  const conversionAvailable = !!group.currencyCode
  const initialRate = source?.conversionRate?.toNumber()
  // Without a rate the stored amounts cannot be read back in the original currency, so such an
  // expense opens in the group currency.
  const isConvertedExpense =
    conversionAvailable &&
    !!initialRate &&
    !!source?.originalCurrency &&
    source.originalCurrency !== group.currencyCode
  const initialCurrencyCode =
    (isConvertedExpense ? source?.originalCurrency : group.currencyCode) ?? ''
  const initialExpenseCurrency =
    conversionAvailable && initialCurrencyCode
      ? getCurrency(initialCurrencyCode, locale)
      : groupCurrency

  // Amounts are stored in the group currency, but the form works entirely in the currency the
  // expense was entered in, so every part is scaled back to it. They are distributed over the
  // original total so that they keep adding up to it exactly.
  const originalTotalInMinorUnits =
    source && isConvertedExpense
      ? getOriginalTotalInMinorUnits(
          source,
          initialRate!,
          groupCurrency,
          initialExpenseCurrency,
        )
      : 0
  //
  // Written out in the currency's decimals — "37.90", not the 37.9 a number prints as — because
  // that is how an amount is read, and how the inputs hold what is typed into them. The schema
  // accepts the string; the type says number because that is what it parses to.
  const toFormAmounts = (amountsInMinorUnits: number[]) =>
    (isConvertedExpense
      ? convertAmountPartsBack(
          amountsInMinorUnits,
          initialRate!,
          groupCurrency,
          originalTotalInMinorUnits,
          initialExpenseCurrency,
        ).map((amount) => formatAmountAsDecimal(amount, initialExpenseCurrency))
      : amountsInMinorUnits.map((amount) =>
          formatAmountAsDecimal(amount, groupCurrency),
        )) as unknown as number[]

  const paidByAmounts = toFormAmounts(
    source?.paidBy.map((pb) => pb.amount) ?? [],
  )
  const itemPrices = toFormAmounts(source?.items.map((i) => i.price) ?? [])
  const paidForAmounts =
    source?.splitMode === 'BY_AMOUNT'
      ? toFormAmounts(source.paidFor.map((pf) => pf.shares))
      : []

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    mode: 'onChange',
    defaultValues: source
      ? {
          title: source.title,
          expenseDate: expense?.expenseDate ?? todayAsDateOnly(),
          originalCurrency: initialCurrencyCode,
          // Derived from the amounts on submit, never entered directly.
          originalAmount: undefined,
          // A copy is dated today, so it takes today's rate rather than the original's.
          conversionRate: expense ? initialRate : undefined,
          category: source.categoryId,
          paidBy: source.paidBy.map((pb, index) => ({
            participant: pb.participantId,
            amount: paidByAmounts[index],
          })),
          paidFor: source.paidFor.map(({ participantId, shares }, index) => ({
            participant: participantId,
            shares: (source.splitMode === 'BY_AMOUNT'
              ? paidForAmounts[index]
              : (shares / 100).toString()) as any,
          })),
          splitMode: source.splitMode,
          saveDefaultSplittingOptions: false,
          isReimbursement: source.isReimbursement,
          documents: expense?.documents ?? [],
          notes: source.notes ?? '',
          recurrenceRule: expense
            ? expense.recurrenceRule ?? undefined
            : RecurrenceRule.NONE,
          items: source.items.map((i, index) => ({
            id: expense ? i.id : randomId(),
            name: i.name,
            price: itemPrices[index],
            participantIds: i.participantIds,
          })),
        }
      : searchParams.get('reimbursement')
      ? {
          title: t('reimbursement'),
          expenseDate: todayAsDateOnly(),
          originalCurrency: group.currencyCode,
          originalAmount: undefined,
          conversionRate: undefined,
          category: 1,
          paidBy: [
            {
              participant: searchParams.get('from') ?? defaultPayerId,
              amount: formatAmountAsDecimal(
                Number(searchParams.get('amount')) || 0,
                groupCurrency,
              ) as unknown as number,
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
            : todayAsDateOnly(),
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
              // Left a bare 0 when nothing was passed in: the empty form shows "0", not "0.00".
              amount: Number(initialAmount)
                ? (formatAmountAsDecimal(
                    Number(initialAmount),
                    groupCurrency,
                  ) as unknown as number)
                : 0,
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
  const { trigger, setValue, getValues, watch } = form // Destructure for convenience

  // Dynamic fields for multiple payers
  const {
    fields: payerFields,
    append: appendPayer,
    remove: removePayer,
  } = useFieldArray({
    control: form.control,
    name: 'paidBy',
  })

  const {
    fields: itemFields,
    append: itemAppend,
    remove: itemRemove,
    replace: itemReplace,
  } = useFieldArray({
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
  const isReimbursement = useWatch({
    control: form.control,
    name: 'isReimbursement',
  })
  const title = useWatch({ control: form.control, name: 'title' })

  // Derived state
  const totalAmount = paidByValues.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0,
  )
  const isIncome = totalAmount < 0
  const isMultiPayer = payerFields.length > 1
  const sExpense = isIncome ? 'Income' : 'Expense'

  // Every amount in the form — payer amounts, shares, item prices — is in this currency. Only the
  // total is converted to the group currency, on submit.
  const expenseCurrency =
    conversionAvailable && originalCurrencyVal
      ? getCurrency(originalCurrencyVal, locale)
      : groupCurrency
  const exchangeRate = useCurrencyRate(
    expenseDate,
    originalCurrencyVal ?? '',
    groupCurrency.code,
  )
  const conversionRequired =
    conversionAvailable &&
    expenseCurrency.code.length > 0 &&
    expenseCurrency.code !== group.currencyCode

  const conversionRate = useWatch({
    control: form.control,
    name: 'conversionRate',
  })
  const effectiveRate = Number(conversionRate) || 0

  const [usingCustomConversionRate, setUsingCustomConversionRate] = useState(
    !!form.formState.defaultValues?.conversionRate,
  )
  const [rateCurrency, setRateCurrency] = useState(initialCurrencyCode)
  // Open by default when editing: an existing expense may already carry a note, a recurrence or a
  // non-group currency, and hiding those behind a collapsed section would look like data loss.
  // Closed on both create and edit. It used to open on edit, which put five secondary fields
  // between the amount and the split control on the screen people open to correct one number.
  // The draft-restore path still forces it open, because a restored draft may have values in there.
  const [showMoreOptions, setShowMoreOptions] = useState(false)

  // A receipt import is a more specific intent than a leftover draft, so it wins: the effect below
  // reads `pendingReceiptData` and resets the whole form, and restoring a draft over the top would
  // undo the extraction the user just waited for.
  const importingReceipt =
    isCreate && searchParams.get('fromReceipt') === 'true'
  const isCopy = isCreate && template !== undefined
  const draftScope = isCreate
    ? createDraftScope(group.id)
    : editDraftScope(expense.id)

  // Track manual edits for BY_AMOUNT mode
  const [manuallyEditedParticipants, setManuallyEditedParticipants] = useState<
    Set<string>
  >(() => {
    if (source?.splitMode === 'BY_AMOUNT') {
      return new Set(group.participants.map((p) => p.id))
    }
    return new Set()
  })

  const [isItemized, setIsItemized] = useState(
    form.getValues('items')?.length > 0,
  )

  const watchedItems = useWatch({ control: form.control, name: 'items' }) || []
  const groupSplitSum = watchedItems.reduce((sum, item) => {
    if (!item.participantIds || item.participantIds.length === 0) return sum
    return sum + (Number(item.price) || 0)
  }, 0)

  const effectiveTotal = isItemized ? groupSplitSum : totalAmount

  const totalExcluded = isItemized ? totalAmount - groupSplitSum : 0
  const hasExcludedItems = isItemized && totalExcluded > 0.009

  const handleAddPayer = () => {
    const currentPayers = new Set(
      form.getValues('paidBy').map((p) => p.participant),
    )
    // Find first participant not in the set
    const nextAvailable = group.participants.find(
      (p) => !currentPayers.has(p.id),
    )
    // Default to the first person if everyone is already listed
    const defaultId = nextAvailable?.id || group.participants[0].id
    appendPayer({ participant: defaultId, amount: 0 })
  }

  // Helper to recalculate BY_AMOUNT distribution ensuring sum(shares) == totalAmount
  // This handles the "missing cent" issue by adding the remainder to the first unedited person.
  const recalculateByAmount = useCallback(
    (
      currentTotal: number,
      currentPaidFor: ExpenseFormValues['paidFor'],
      editedSet: Set<string>,
    ) =>
      redistributeByAmount(
        currentTotal,
        currentPaidFor,
        editedSet,
        expenseCurrency.decimal_digits,
      ) as ExpenseFormValues['paidFor'],
    [expenseCurrency.decimal_digits],
  )

  const handlePayerAmountChange = (index: number, newValue: string) => {
    setValue(`paidBy.${index}.amount`, newValue as any, {
      shouldDirty: true,
      shouldTouch: true,
    })

    if (isItemized) {
      // CORRECT: Use 'trigger' from the form object
      trigger('items')
    } else if (splitMode === 'BY_AMOUNT') {
      const currentPaidFor = getValues('paidFor')
      const currentPayers = getValues('paidBy')
      // Recalculate total. Note: we need to handle string inputs safely here for calculation
      const newTotal = currentPayers.reduce(
        (sum, p) => sum + (Number(p.amount) || 0),
        0,
      )
      const redistributed = recalculateByAmount(
        newTotal,
        currentPaidFor,
        manuallyEditedParticipants,
      )
      setValue('paidFor', redistributed, { shouldValidate: true })
    }

    // Always trigger paidBy validation to ensure cross-field rules re-run
    trigger('paidBy')
  }

  // --- Effects ---

  /**
   * Pour an extracted receipt into the form.
   *
   * Lifted out of the `?fromReceipt=true` effect because the scanner can now be opened from inside
   * this form, where the old hand-off — write session storage, navigate to the create page — would
   * be a navigation to the screen you are already on.
   */
  const applyReceiptData = useCallback(
    (data: any) => {
      const allParticipantIds = group.participants.map((p) => p.id)

      const formItems = (data.items || []).map((item: any) => ({
        name: item.name || 'Unknown Item',
        price: Number(item.price) || 0,
        participantIds: allParticipantIds,
      }))

      const currentValues = form.getValues()

      // The receipt was paid in its own currency, so the whole expense is entered in it and
      // only the total gets converted to the group currency.
      const receiptCurrency = conversionAvailable
        ? normalizeCurrencyCode(data.currency)
        : undefined

      // Reset the WHOLE form at once
      form.reset({
        ...currentValues, // Keep current values
        title: data.title || '',
        expenseDate: data.date ? new Date(data.date) : todayAsDateOnly(),
        category: data.categoryId ? Number(data.categoryId) : undefined,
        documents: data.documents || [],
        items: formItems, // This replaces useFieldArray automatically
        originalCurrency:
          receiptCurrency ?? currentValues.originalCurrency ?? '',
        paidBy: [
          {
            ...currentValues.paidBy?.[0], // Keep the userId or other props
            amount: Number(data.amount) || 0,
          },
        ],
      })

      setIsItemized(formItems.length > 0)
    },
    [group.participants, form, conversionAvailable],
  )

  useEffect(() => {
    if (isCreate && searchParams.get('fromReceipt') === 'true') {
      try {
        const storedData = sessionStorage.getItem('pendingReceiptData')
        if (storedData) {
          sessionStorage.removeItem('pendingReceiptData')
          applyReceiptData(JSON.parse(storedData))
        }
      } catch (e) {
        console.error('Failed to load receipt data', e)
      }
    }
  }, [isCreate, searchParams, applyReceiptData])

  const { pendingDraft, restoreDraft, discardDraft } = useExpenseDraft({
    form,
    draftScope,
    prefilled: importingReceipt || isCopy,
    onRestored: (draft) => {
      setShowMoreOptions(true)
      // A reset sets the values, not this state beside them. An itemised draft came back with its
      // lines hidden and the control on "By exact amount", yet still saved itemised; Evenly could
      // not clear the lines either, since the switch was already off.
      setIsItemized(draft.items.length > 0)
      // The amounts in a By exact amount draft were typed. Treated as untouched, the jump from no
      // total to the draft's total spread them evenly again: 20 + 10 came back as 15 + 15.
      setManuallyEditedParticipants(
        draft.splitMode === 'BY_AMOUNT' && draft.items.length === 0
          ? new Set(draft.paidFor.map((p) => p.participant))
          : new Set(),
      )
    },
  })

  useEffect(() => {
    if (totalAmount < 0) form.setValue('isReimbursement', false)
  }, [totalAmount, form])

  // A payment goes to one person who is not its payer. Ticking "This is a reimbursement" on an
  // expense split among everyone used to keep that split, payer included, with no way to see it;
  // it now starts from someone else, and the recipient field shows who. Only on ticking: opening
  // an older payment leaves its recipients as they are, and changing the payer afterwards does not
  // move the recipient behind anyone's back — if the two end up the same, the field says so.
  const wasReimbursement = useRef(isReimbursement)
  useEffect(() => {
    const ticked = isReimbursement && !wasReimbursement.current
    wasReimbursement.current = isReimbursement
    if (!ticked) return
    const firstPayer = form.getValues('paidBy')[0]?.participant
    const paidFor = form.getValues('paidFor')
    if (paidFor.length === 1 && paidFor[0].participant !== firstPayer) return
    const recipient =
      paidFor.find((p) => p.participant !== firstPayer)?.participant ??
      group.participants.find((p) => p.id !== firstPayer)?.id
    if (!recipient) return
    setIsItemized(false)
    form.setValue('splitMode', 'EVENLY')
    form.setValue('paidFor', [{ participant: recipient, shares: '1' as any }])
  }, [isReimbursement, form, group.participants])

  // A rate only makes sense for the currency it was obtained (or entered) for, so picking another
  // currency drops it and goes back to the rate from the API.
  useEffect(() => {
    if ((originalCurrencyVal ?? '') !== rateCurrency) {
      setRateCurrency(originalCurrencyVal ?? '')
      setUsingCustomConversionRate(false)
      form.setValue('conversionRate', undefined)
      form.clearErrors('conversionRate')
    }
  }, [originalCurrencyVal, rateCurrency, form])

  // Conversion rate logic
  useEffect(() => {
    if (!usingCustomConversionRate && exchangeRate.data) {
      form.setValue('conversionRate', exchangeRate.data)
    }
  }, [exchangeRate.data, usingCustomConversionRate, form])

  // Recalculate BY_AMOUNT if total changes (e.g. Payer Added/Removed)
  useEffect(() => {
    const currentSplitMode = form.getValues('splitMode')
    if (currentSplitMode === 'BY_AMOUNT') {
      const paidFor = form.getValues('paidFor')
      const newPaidFor = recalculateByAmount(
        totalAmount,
        paidFor,
        manuallyEditedParticipants,
      )

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
    recalculateByAmount,
  ])

  // One effect, not two. These used to be a pair keyed on the same dependencies — one clearing
  // items, one forcing the split mode — which meant two writers racing to define what "itemised"
  // means. Itemising is implemented as BY_AMOUNT over the per-person item totals; that is an
  // implementation detail of the mode, so it is set in the same place the mode is.
  useEffect(() => {
    if (isItemized) {
      form.setValue('splitMode', 'BY_AMOUNT', { shouldValidate: true })
    } else {
      form.setValue('items', [])
    }
  }, [isItemized, form])

  /**
   * The split control has three positions; the form has two pieces of state behind them.
   *
   * `isItemized` and `splitMode` used to be steered independently — a Switch for one, a Select
   * buried under "Advanced splitting options…" for the other — and turning the Switch on silently
   * rewrote the Select's value to BY_AMOUNT. So the two controls could disagree, and the one that
   * looked authoritative was hidden while the mode it reported was being overridden.
   *
   * There is one control now, and it reads both. BY_AMOUNT means two different things — "itemised,
   * distributed into per-person amounts" and "someone typed exact amounts" — and `isItemized` is
   * what tells them apart. That is why it takes precedence here: without it, reopening an itemised
   * expense would light up "By exact amount".
   */
  const splitControl: 'EVENLY' | 'ITEMS' | 'OTHER' = isItemized
    ? 'ITEMS'
    : splitMode === 'EVENLY'
    ? 'EVENLY'
    : 'OTHER'

  const [splitSheetOpen, setSplitSheetOpen] = useState(false)

  const selectSplitControl = (
    next: 'EVENLY' | 'ITEMS' | 'OTHER',
    mode?: string,
  ) => {
    if (next === 'ITEMS') {
      // The effect above turns this into BY_AMOUNT; the mode is the itemisation's own business.
      setIsItemized(true)
      // Land on a line to type into rather than on an empty list with an "add" button. It also
      // keeps `isItemized` and `items.length > 0` saying the same thing, which is what makes the
      // mode survive a reload.
      if (form.getValues('items').length === 0) {
        itemAppend({
          name: '',
          // "48.20", in the expense currency's decimals, as the line's field shows an amount.
          price: (totalAmount
            ? formatAmountAsDecimal(
                amountAsMinorUnits(totalAmount, expenseCurrency),
                expenseCurrency,
              )
            : 0) as number,
          participantIds: group.participants.map((p) => p.id),
        })
      }
      return
    }
    setIsItemized(false)
    handleSplitModeChange(next === 'EVENLY' ? 'EVENLY' : mode ?? 'BY_SHARES')
  }

  // Trigger validation on PaidFor when splitMode changes to clear stale errors
  const handleSplitModeChange = (newMode: string) => {
    // 1. Reset manual edits so we get a fresh distribution (optional, but usually desired on mode switch)
    setManuallyEditedParticipants(new Set())

    // 2. Evenly has no per-person value to show, so whatever the custom rows last held would ride
    // along unseen: "0.00" from By amount before an amount was typed, or a 0 typed in a row,
    // failed `noZeroShares` with the rows that would say so hidden — Create did nothing at all.
    // Evenly means one share each, so that is what it gets.
    if (newMode === 'EVENLY') {
      form.setValue(
        'paidFor',
        form.getValues('paidFor').map((p) => ({
          ...p,
          shares: '1' as any,
          originalAmount: undefined,
        })),
      )
    }

    // 3. Perform distribution if switching TO By Amount immediately
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

  /**
   * The form works in the expense currency; the database stores every amount in the group
   * currency. The total is converted, and the parts it is made of are distributed over it so they
   * still add up to it exactly.
   */
  const convertToGroupCurrency = (values: ExpenseFormValues, rate: number) => {
    const total = Number(values.amount)
    const convert = (parts: number[]) =>
      convertAmountParts(parts, total, rate, groupCurrency)

    values.originalAmount = total
    values.originalCurrency = expenseCurrency.code
    values.conversionRate = rate
    values.amount = convertAmount(total, rate, groupCurrency)

    const paidByAmounts = convert(values.paidBy.map((pb) => Number(pb.amount)))
    values.paidBy = values.paidBy.map((pb, index) => ({
      ...pb,
      amount: paidByAmounts[index],
    }))

    if (values.splitMode === 'BY_AMOUNT') {
      const shares = convert(values.paidFor.map((pf) => Number(pf.shares)))
      values.paidFor = values.paidFor.map((pf, index) => ({
        ...pf,
        shares: shares[index],
      }))
    }

    if (values.items.length > 0) {
      const prices = convert(values.items.map((item) => Number(item.price)))
      values.items = values.items.map((item, index) => ({
        ...item,
        price: prices[index],
      }))
    }
  }

  const submit = async (values: ExpenseFormValues) => {
    if (isItemized && values.items.length > 0) {
      values.splitMode = 'BY_AMOUNT'
    }

    await persistDefaultSplittingOptions(group.id, values)

    // Keep negative amounts: an income has them, and dropping them would leave the payers adding
    // up to something other than the total.
    const validPayers = values.paidBy.filter((pb) => Number(pb.amount) !== 0)
    // Fallback if all are 0 (validation catches this, but to be safe)
    if (validPayers.length === 0 && values.paidBy.length > 0) {
      values.paidBy = [values.paidBy[0]]
    } else {
      values.paidBy = validPayers
    }

    if (!conversionRequired) {
      delete values.originalAmount
      delete values.originalCurrency
      delete values.conversionRate
    } else {
      const rate = Number(values.conversionRate)
      if (!rate || rate <= 0) {
        // Without a rate the amounts would be stored as if they were already in the group
        // currency, so ask for one instead of saving something wrong.
        setUsingCustomConversionRate(true)
        form.setError('conversionRate', {
          type: 'manual',
          message: 'rateRequired',
        })
        return
      }
      convertToGroupCurrency(values, rate)
    }

    // Only after a successful save: a draft that outlives its expense would haunt the next one.
    try {
      await onSubmit(values, activeUserId ?? undefined)
    } catch (error) {
      // The server refused it. Left to `handleSubmit`, the rejection went nowhere: the button
      // came back and nothing said why. What it refused is in the server's log; here, say so.
      console.error('Could not save the expense', error)
      form.setError('root', { type: 'server', message: t('saveFailed') })
      return
    }
    clearExpenseDraft(draftScope)
  }

  return (
    <ShareIdentityContext.Provider value={shareIdentity}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(submit)}>
          {pendingDraft && (
            <DraftOffer onRestore={restoreDraft} onDiscard={discardDraft} />
          )}

          <Card bleed>
            {/* Closed, the last thing in this card is the "More options" row — a ruled row that runs
              the full width — and the card's own 24px of bottom padding left it floating above an
              empty band, reading as a list that had been cut off. Let its rule be the card's edge.
              Open, the last thing is ordinary content, which does want the padding. */}
            <CardContent className={cn('flex flex-col gap-6 pb-0 pt-6')}>
              {/* Reading a receipt is not a thing you do to the split — it is how you fill the whole
                expense in. `applyReceiptData` calls `form.reset`, so it does not add lines to what
                you have written, it replaces what you have written. Offered from inside "By item",
                that arrived after the title and the amount had been typed by hand and threw both
                away without saying so: the highest cost the action has, at the moment it has the
                least left to give.
                Here it is the first thing on an empty form, which is the only moment "start from
                a receipt" is both true and free. Create only — there is nothing to start on an
                expense that already exists — and quiet, because most expenses are not receipts. */}
              {isCreate && runtimeFeatureFlags.enableReceiptExtract && (
                <CreateFromReceiptButton
                  onExtracted={applyReceiptData}
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      className="-mt-1 -mb-3 h-11 w-full justify-center gap-2 text-sm font-normal text-muted-foreground hover:text-foreground sm:h-10"
                      data-testid="scan-receipt-in-form"
                    >
                      <ScanLine className="h-4 w-4" />
                      {tReceipt('scanEntry')}
                    </Button>
                  }
                />
              )}
              {/* Title over amount, each with the control that qualifies it in a tinted square to
                its left, over a rule. The amount used to be a 48px figure centred on its own line
                with the title centred under it — which is the concept's hero, and the concept's
                hero is a statement of a total already agreed, not a field you are filling in. On
                a form it read as a display, and it left the two things you actually type
                competing for the middle of the screen.

                The category and the currency each sit beside the field they qualify. Both were a
                row apiece further down before, the category behind More options — two taps and a
                scroll from the words that determine it. */}
              {isCreate &&
                !isCopy &&
                !importingReceipt &&
                !isReimbursement &&
                !title &&
                totalAmount === 0 && (
                  <RecentShortcuts
                    groupId={group.id}
                    currency={groupCurrency}
                  />
                )}
              <div className="flex min-w-0 flex-col gap-4">
                <TitleField
                  form={form}
                  categories={categories}
                  sExpense={sExpense}
                  enableCategoryExtract={
                    runtimeFeatureFlags.enableCategoryExtract
                  }
                />

                <AmountField
                  form={form}
                  sExpense={sExpense}
                  group={group}
                  conversionAvailable={conversionAvailable}
                  expenseCurrency={expenseCurrency}
                  groupCurrency={groupCurrency}
                  isMultiPayer={isMultiPayer}
                  payerCount={payerFields.length}
                  effectiveTotal={effectiveTotal}
                  effectiveRate={effectiveRate}
                  conversionRequired={conversionRequired}
                  splitControl={splitControl}
                  onAmountChange={(val) => handlePayerAmountChange(0, val)}
                />
              </div>

              {/* Paid By Section. */}
              {/* Full-bleed so a row's hover runs to the sheet's edge; the rules that used to
                close each of these are gone. What separates one row from the next is the space
                between them, and what says a control is a control is its fill. */}
              <div className="-mx-6">
                <PayersAndDate
                  form={form}
                  sExpense={sExpense}
                  group={group}
                  isMultiPayer={isMultiPayer}
                  payerFields={payerFields}
                  paidByValues={paidByValues}
                  activeUserId={activeUserId}
                  expenseCurrency={expenseCurrency}
                  onAddPayer={handleAddPayer}
                  onRemovePayer={removePayer}
                  onPayerAmountChange={handlePayerAmountChange}
                />

                <MoreOptions
                  form={form}
                  open={showMoreOptions}
                  onOpenChange={setShowMoreOptions}
                  sExpense={sExpense}
                  group={group}
                  groupCurrency={groupCurrency}
                  expenseCurrency={expenseCurrency}
                  originalCurrency={originalCurrencyVal}
                  conversionRequired={conversionRequired}
                  effectiveRate={effectiveRate}
                  effectiveTotal={effectiveTotal}
                  exchangeRate={exchangeRate}
                  usingCustomConversionRate={usingCustomConversionRate}
                  onUsingCustomConversionRateChange={
                    setUsingCustomConversionRate
                  }
                  isIncome={isIncome}
                  isMultiPayer={isMultiPayer}
                />

                {isReimbursement ? (
                  <RecipientField
                    form={form}
                    group={group}
                    activeUserId={activeUserId}
                  />
                ) : (
                  <SplitSection
                    form={form}
                    group={group}
                    splitControl={splitControl}
                    splitMode={splitMode}
                    onSelect={selectSplitControl}
                    onOpenSheet={() => setSplitSheetOpen(true)}
                    expenseCurrency={expenseCurrency}
                    totalAmount={totalAmount}
                    effectiveTotal={effectiveTotal}
                    manuallyEditedParticipants={manuallyEditedParticipants}
                    setManuallyEditedParticipants={
                      setManuallyEditedParticipants
                    }
                    recalculateByAmount={recalculateByAmount}
                    activeUserId={activeUserId}
                    isItemized={isItemized}
                    itemFields={itemFields}
                    itemAppend={itemAppend}
                    itemRemove={itemRemove}
                  />
                )}
              </div>
            </CardContent>
          </Card>
          {/* A plain sheet. The dashed double border framed the lines as a foreign object pasted
            into the form, and the header repeated, word for word, the hint the split control
            directly above it already shows. */}

          {runtimeFeatureFlags.enableExpenseDocuments && (
            <DocumentsSection form={form} sExpense={sExpense} />
          )}

          {/* The overflow half of the split control. A sheet rather than a menu: these are three
            mutually exclusive answers to one question, and the question deserves a title. */}
          <SplitModeSheet
            open={splitSheetOpen}
            onOpenChange={setSplitSheetOpen}
            splitControl={splitControl}
            splitMode={splitMode}
            onSelect={selectSplitControl}
          />

          {/* What stops a save, when the field it is about is not on screen: the split's own
            message renders only beside the custom rows, the lines' only in By item, and the
            documents have none. A Create that did nothing, silently, was the result. */}
          <OffscreenErrors
            errors={form.formState.errors}
            showPaidFor={!isReimbursement && splitControl !== 'OTHER'}
            showItems={!isItemized}
          />

          {/* Global Error Fallback */}
          {form.formState.errors.root && (
            <div
              role="alert"
              className="mt-4 text-sm font-medium text-destructive"
            >
              {form.formState.errors.root.message}
            </div>
          )}

          <SubmitBar
            isCreate={isCreate}
            duplicateHref={
              expense
                ? `/groups/${group.id}/expenses/create?duplicate=${expense.id}`
                : undefined
            }
            onDelete={
              onDelete ? () => onDelete(activeUserId ?? undefined) : undefined
            }
          />
        </form>
      </Form>
    </ShareIdentityContext.Provider>
  )
}
