'use client'

import { CategorySelector } from '@/components/category-selector'
import { CurrencySelector } from '@/components/currency-selector'
import { ExpenseDocumentsInput } from '@/components/expense-documents-input'
import { ProfileAvatar } from '@/components/profile-avatar'
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
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
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
import { Label } from '@/components/ui/label' // <--- Add this line
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Locale } from '@/i18n/request'
import { readActiveUser } from '@/lib/active-user'
import { assignAvatarHues } from '@/lib/avatar-hue'
import {
  Currency,
  defaultCurrencyList,
  getCurrency,
  normalizeCurrencyCode,
} from '@/lib/currency'
import {
  clearExpenseDraft,
  createDraftScope,
  draftHasContent,
  editDraftScope,
  readExpenseDraft,
  saveExpenseDraft,
  touchExpenseDraft,
} from '@/lib/expense-draft'
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
  convertAmount,
  convertAmountParts,
  distributeMinorUnits,
  formatCurrency,
  getCurrencyFromGroup,
  randomId,
} from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { zodResolver } from '@hookform/resolvers/zod'
import { RecurrenceRule } from '@prisma/client'
import {
  Check,
  ChevronDown,
  Crown,
  Loader2,
  Plus,
  Receipt,
  Save,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import type React from 'react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {
  UseFormReturn,
  useFieldArray,
  useForm,
  useWatch,
} from 'react-hook-form'
import { match } from 'ts-pattern'
import { DeletePopup } from '../../../../components/delete-popup'
import { extractCategoryFromTitle } from '../../../../components/expense-form-actions'
import { CategoryIcon } from './category-icon'
import { CreateFromReceiptButton } from './create-from-receipt-button'
import { ItemizationBuilder } from './itemization-builder' // Import new component
import { SplitRows } from './split-rows'

// --- Helpers ---

/**
 * The amount an expense was originally entered for, in minor units of the currency it was entered
 * in. `originalAmount` used to be written in major units, so a value that is inconsistent with the
 * stored conversion rate is recomputed from the amount in the group currency instead.
 */
function getOriginalTotalInMinorUnits(
  expense: { amount: number; originalAmount: number | null },
  rate: number,
  groupCurrency: Currency,
  expenseCurrency: Currency,
) {
  const derived = amountAsMinorUnits(
    amountAsDecimal(expense.amount, groupCurrency) / rate,
    expenseCurrency,
  )
  const { originalAmount } = expense
  return originalAmount &&
    Math.abs(originalAmount - derived) <= Math.abs(derived) / 50
    ? originalAmount
    : derived
}

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
        shares: (parseFloat(paidFor.shares.toString()) / 100).toString() as any,
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

/**
 * The expense's name, at the size a name deserves — and wrapping like one.
 *
 * An `<input>` cannot wrap. At the size this field now carries, "Monday evening restaurant" ran
 * off the right edge of its box, and reopening a saved expense showed you half its own name with
 * no indication there was more. A textarea that grows to its content is the same field with the
 * one behaviour the size demands.
 *
 * Enter is swallowed rather than inserted: this is a title, not a paragraph, and the newline
 * would be stored and then rendered as a space everywhere the title is shown.
 */
const TitleTextarea = forwardRef<
  HTMLTextAreaElement,
  React.ComponentPropsWithoutRef<'textarea'>
>(function TitleTextarea({ className, value, onChange, ...props }, ref) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null)
  const grow = useCallback(() => {
    const el = innerRef.current
    if (!el) return
    // Collapse first: without it the box only ever grows, because `scrollHeight` on an element
    // already tall enough to hold its content is that taller height.
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])
  // Layout rather than effect, so the height is right in the frame the value lands in and a
  // restored draft does not flash at one line before settling at two.
  useLayoutEffect(grow, [value, grow])

  return (
    <textarea
      {...props}
      rows={1}
      value={value}
      ref={(el) => {
        innerRef.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
      onChange={(event) => {
        onChange?.(event)
        grow()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.preventDefault()
      }}
      className={cn('resize-none overflow-hidden', className)}
    />
  )
})

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
  const tReceipt = useTranslations('CreateFromReceipt')
  // The category trigger is an icon; its name has to come from the Categories namespace.
  const tCategories = useTranslations('Categories')
  const locale = useLocale() as Locale
  const isCreate = expense === undefined
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
  const initialRate = expense?.conversionRate?.toNumber()
  // Without a rate the stored amounts cannot be read back in the original currency, so such an
  // expense opens in the group currency.
  const isConvertedExpense =
    conversionAvailable &&
    !!initialRate &&
    !!expense?.originalCurrency &&
    expense.originalCurrency !== group.currencyCode
  const initialCurrencyCode =
    (isConvertedExpense ? expense?.originalCurrency : group.currencyCode) ?? ''
  const initialExpenseCurrency =
    conversionAvailable && initialCurrencyCode
      ? getCurrency(initialCurrencyCode, locale)
      : groupCurrency

  // Amounts are stored in the group currency, but the form works entirely in the currency the
  // expense was entered in, so every part is scaled back to it. They are distributed over the
  // original total so that they keep adding up to it exactly.
  const originalTotalInMinorUnits =
    expense && isConvertedExpense
      ? getOriginalTotalInMinorUnits(
          expense,
          initialRate!,
          groupCurrency,
          initialExpenseCurrency,
        )
      : 0
  const toFormAmounts = (amountsInMinorUnits: number[]) =>
    isConvertedExpense
      ? distributeMinorUnits(
          amountsInMinorUnits,
          originalTotalInMinorUnits,
        ).map((amount) => amountAsDecimal(amount, initialExpenseCurrency))
      : amountsInMinorUnits.map((amount) =>
          amountAsDecimal(amount, groupCurrency),
        )

  const paidByAmounts = toFormAmounts(
    expense?.paidBy.map((pb) => pb.amount) ?? [],
  )
  const itemPrices = toFormAmounts(expense?.items.map((i) => i.price) ?? [])
  const paidForAmounts =
    expense?.splitMode === 'BY_AMOUNT'
      ? toFormAmounts(expense.paidFor.map((pf) => pf.shares))
      : []

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    mode: 'onChange',
    defaultValues: expense
      ? {
          title: expense.title,
          expenseDate: expense.expenseDate ?? new Date(),
          originalCurrency: initialCurrencyCode,
          // Derived from the amounts on submit, never entered directly.
          originalAmount: undefined,
          conversionRate: initialRate,
          category: expense.categoryId,
          paidBy: expense.paidBy.map((pb, index) => ({
            participant: pb.participantId,
            amount: paidByAmounts[index],
          })),
          paidFor: expense.paidFor.map(({ participantId, shares }, index) => ({
            participant: participantId,
            shares: (expense.splitMode === 'BY_AMOUNT'
              ? paidForAmounts[index]
              : (shares / 100).toString()) as any,
          })),
          splitMode: expense.splitMode,
          saveDefaultSplittingOptions: false,
          isReimbursement: expense.isReimbursement,
          documents: expense.documents,
          notes: expense.notes ?? '',
          recurrenceRule: expense.recurrenceRule ?? undefined,
          items:
            expense?.items.map((i, index) => ({
              id: i.id,
              name: i.name,
              price: itemPrices[index],
              participantIds: i.participantIds,
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

  // Derived state
  const totalAmount = paidByValues.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0,
  )
  const isIncome = totalAmount < 0
  const isMultiPayer = payerFields.length > 1
  // Not a participant id, and it never reaches the form: `onValueChange` intercepts it.
  const MULTI_PAYER_OPTION = '__multiple_payers__'
  const sExpense = isIncome ? 'Income' : 'Expense'
  const maxAmount = Math.max(...paidByValues.map((p) => Number(p.amount) || 0))

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
  const [isCategoryLoading, setCategoryLoading] = useState(false)
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
  const draftScope = isCreate
    ? createDraftScope(group.id)
    : editDraftScope(expense.id)
  // Restored, not offered. Being asked "you have an unsaved expense — restore or discard?" makes
  // you read and decide, every time, about something you almost always want; the form simply comes
  // back as you left it and says so quietly, with a way out for the time you did not want it.
  const [restoredDraft, setRestoredDraft] = useState(false)
  const pristineValuesRef = useRef<ExpenseFormValues | null>(null)
  const lastExtractedTitleRef = useRef<string | null>(null)

  // Track manual edits for BY_AMOUNT mode
  const [manuallyEditedParticipants, setManuallyEditedParticipants] = useState<
    Set<string>
  >(() => {
    if (expense?.splitMode === 'BY_AMOUNT') {
      return new Set(group.participants.map((p) => p.id))
    }
    return new Set()
  })

  const [isItemized, setIsItemized] = useState(
    form.getValues('items')?.length > 0,
  )

  const watchedItems = useWatch({ control: form.control, name: 'items' }) || []
  // The category's *name*, for the label row above the title field. The icon in the trigger says
  // which one is selected only to someone who already knows the icon set; on a phone it is a
  // 20px glyph in a grey square, and there was nothing anywhere on the form that spelled it out.
  const watchedCategory = useWatch({ control: form.control, name: 'category' })
  const selectedCategory = categories.find(
    (category) => category.id === Number(watchedCategory),
  )
  const groupSplitSum = watchedItems.reduce((sum, item) => {
    if (!item.participantIds || item.participantIds.length === 0) return sum
    return sum + (Number(item.price) || 0)
  }, 0)

  const effectiveTotal = isItemized ? groupSplitSum : totalAmount

  const totalExcluded = isItemized ? totalAmount - groupSplitSum : 0
  const hasExcludedItems = isItemized && totalExcluded > 0.009

  const getIsParticipantPaying = (
    participantId: string,
    currentIndex: number,
  ) => {
    return paidByValues.some(
      (field, index) =>
        index !== currentIndex && field.participant === participantId,
    )
  }

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
      const uneditedParticipants = newPaidFor.filter(
        (p) => !editedSet.has(p.participant),
      )
      const count = uneditedParticipants.length

      if (count > 0) {
        // Calculate precision factor (e.g. 100 for 2 decimals)
        const precision = Math.pow(10, expenseCurrency.decimal_digits)

        // Convert remaining amount to integer units to handle distribution cleanly
        // We use round to avoid floating point artifacts before distribution
        let remainingUnits = Math.round(remainingAmount * precision)

        // Base share per person (integer division)
        // Math.trunc works better for potential negative numbers (income)
        const baseShareUnits = Math.trunc(remainingUnits / count)

        // Remainder units to distribute
        let remainderUnits = remainingUnits - baseShareUnits * count

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
              shares: (currentUnits / precision).toFixed(
                expenseCurrency.decimal_digits,
              ) as any,
            }
          }
          return participant
        })
      }

      return newPaidFor
    },
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
        expenseDate: data.date ? new Date(data.date) : new Date(),
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

  // Restore before the fingerprint below is taken, which is why this effect is declared first:
  // the baseline then *is* the restored draft, so merely opening the form does not count as an
  // edit and does not re-stamp the draft's clock.
  useEffect(() => {
    if (importingReceipt) return
    if (pristineValuesRef.current === null) {
      pristineValuesRef.current = form.getValues()
    }
    const draft = readExpenseDraft(draftScope)
    if (!draft) return
    // No validation on the way in: a half-typed expense is exactly what this holds, and greeting
    // someone with a wall of red for the parts they had not reached yet helps nobody.
    form.reset(draft)
    setRestoredDraft(true)
    setShowMoreOptions(true)
  }, [draftScope, importingReceipt, form])

  // Keep the draft alive while its form is on screen — see `touchExpenseDraft`. Only while
  // visible: a backgrounded tab is someone who has left, and their two minutes should be running.
  useEffect(() => {
    if (importingReceipt) return
    const touch = () => {
      if (document.visibilityState === 'visible') touchExpenseDraft(draftScope)
    }
    const timer = window.setInterval(touch, 30_000)
    document.addEventListener('visibilitychange', touch)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', touch)
    }
  }, [draftScope, importingReceipt])

  // Deciding when a draft is worth keeping is fiddlier than it looks. `formState.isDirty` is
  // useless — the amount round-trips through a string, so the form reports itself dirty on mount
  // with no input at all. The watch callback's `type === 'change'` is too strict in the other
  // direction: the amount and the BY_AMOUNT shares are written with `setValue`, not through a
  // registered change event, so filtering on it silently dropped every amount the user typed.
  //
  // Comparing against the values the form started with covers every input path. `conversionRate`
  // is excluded because the exchange-rate effect fills it in on its own, which is not the user
  // typing anything.
  const initialValuesRef = useRef<string | null>(null)
  const savedThisMountRef = useRef(false)
  useEffect(() => {
    // A plain `JSON.stringify` of the values compares two things it should not: the order of the
    // rows and the type they happen to be carrying. `paidFor` is rebuilt whenever someone is
    // added or dropped, so taking a person off and putting them back reordered the array and the
    // form counted as changed forever after; amounts round-trip between numbers and the strings
    // the inputs hold, so `0` and `"0"` read as an edit. Sort the rows by who they are about and
    // compare their figures as figures.
    const fingerprint = (values: unknown) => {
      const { conversionRate, ...rest } = (values ?? {}) as Record<string, any>
      const figure = (value: unknown) => Number(value) || 0
      const byParticipant = (rows: unknown) =>
        (Array.isArray(rows) ? rows : [])
          .map((row: any) => ({
            participant: String(row?.participant ?? ''),
            amount: figure(row?.amount),
            shares: figure(row?.shares),
          }))
          .sort((a, b) => a.participant.localeCompare(b.participant))
      return JSON.stringify({
        ...rest,
        // The clock is not an edit: only the day someone picked is.
        expenseDate: new Date(rest.expenseDate ?? NaN).toDateString(),
        paidBy: byParticipant(rest.paidBy),
        paidFor: byParticipant(rest.paidFor),
        items: (Array.isArray(rest.items) ? rest.items : []).map(
          (item: any) => ({
            name: String(item?.name ?? ''),
            price: figure(item?.price),
            participantIds: [...(item?.participantIds ?? [])].sort(),
          }),
        ),
      })
    }
    if (initialValuesRef.current === null) {
      initialValuesRef.current = fingerprint(form.getValues())
    }
    const subscription = form.watch((values) => {
      const unchanged = fingerprint(values) === initialValuesRef.current
      // Changed, but changed into nothing: a cleared title leaves behind the category the
      // extractor guessed from it, a cleared amount leaves `""` where a `0` was. Neither is an
      // expense, and offering to restore one is how the banner came to appear nearly every time.
      const empty = !draftHasContent(values as ExpenseFormValues)
      if (unchanged || empty) {
        // Only discard a draft this mount actually wrote. Clearing unconditionally would delete
        // the draft being offered for restore, since a freshly opened form starts out equal to
        // its own defaults.
        if (savedThisMountRef.current) {
          clearExpenseDraft(draftScope)
          savedThisMountRef.current = false
        }
        return
      }
      savedThisMountRef.current = true
      saveExpenseDraft(draftScope, values as ExpenseFormValues)
    })
    return () => subscription.unsubscribe()
  }, [form, draftScope])

  // Catches the cases a draft cannot: closing the tab, reloading, typing a new URL. In-app
  // navigation does not fire this, which is precisely why the draft exists.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!readExpenseDraft(draftScope)) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [draftScope])

  useEffect(() => {
    if (totalAmount < 0) form.setValue('isReimbursement', false)
  }, [totalAmount, form])

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

  /**
   * Short names for the overflow modes. The `SplitModeField.*` strings say "Unevenly – By shares",
   * a prefix that existed to group them inside a Select; in a sheet headed "How to split" it is
   * noise, and it does not fit on a chip. Those strings are left alone — they are translated in 22
   * other locales and asserted on by the e2e suite.
   */
  const shortSplitModeLabel = (mode: string) =>
    match(mode)
      .with('BY_SHARES', () => t('SplitMode.byShares'))
      .with('BY_PERCENTAGE', () => t('SplitMode.byPercentage'))
      .with('BY_AMOUNT', () => t('SplitMode.byAmount'))
      .otherwise(() => t('SplitMode.more'))

  /** What the chosen mode asks of you, for the line under the control. */
  const splitModeHint = (mode: string) =>
    match(mode)
      .with('BY_SHARES', () => t('SplitMode.bySharesHint'))
      .with('BY_PERCENTAGE', () => t('SplitMode.byPercentageHint'))
      .with('BY_AMOUNT', () => t('SplitMode.byAmountHint'))
      .otherwise(() => t('SplitMode.description'))

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
          price: totalAmount || 0,
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
    await onSubmit(values, activeUserId ?? undefined)
    clearExpenseDraft(draftScope)
  }

  // --- Rendering Helpers ---

  let conversionRateMessage = ''
  if (exchangeRate.isLoading) {
    conversionRateMessage = t('conversionRateState.loading')
  } else if (exchangeRate.error) {
    conversionRateMessage = t('conversionRateState.error')
  } else if (exchangeRate.data) {
    conversionRateMessage = `${t(
      'conversionRateState.success',
    )} ${originalCurrencyVal}\xa01\xa0=\xa0${group.currencyCode}\xa0${
      exchangeRate.data
    }`
  } else {
    conversionRateMessage = t('conversionRateState.currencyNotFound')
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)}>
        {restoredDraft && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            <span className="min-w-0 truncate">{t('Draft.restored')}</span>
            <button
              type="button"
              data-testid="draft-start-fresh"
              className="shrink-0 font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => {
                clearExpenseDraft(draftScope)
                if (pristineValuesRef.current) {
                  form.reset(pristineValuesRef.current)
                }
                setRestoredDraft(false)
              }}
            >
              {t('Draft.startFresh')}
            </button>
          </div>
        )}

        <Card bleed>
          {/* Closed, the last thing in this card is the "More options" row — a ruled row that runs
              the full width — and the card's own 24px of bottom padding left it floating above an
              empty band, reading as a list that had been cut off. Let its rule be the card's edge.
              Open, the last thing is ordinary content, which does want the padding. */}
          <CardContent className={cn('flex flex-col gap-6 pb-0 pt-6')}>
            {/* Title over amount, each with the control that qualifies it in a tinted square to
                its left, over a rule. The amount used to be a 48px figure centred on its own line
                with the title centred under it — which is the concept's hero, and the concept's
                hero is a statement of a total already agreed, not a field you are filling in. On
                a form it read as a display, and it left the two things you actually type
                competing for the middle of the screen.

                The category and the currency each sit beside the field they qualify. Both were a
                row apiece further down before, the category behind More options — two taps and a
                scroll from the words that determine it. */}
            <div className="flex min-w-0 flex-col gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <FormLabel className="mb-1 block text-sm font-normal text-muted-foreground">
                      {t(`${sExpense}.TitleField.label`)}
                    </FormLabel>
                    {/* The category's name used to sit at the right of the label row, which put it
                        a full row away from the glyph it names and left the two ends of that line
                        unrelated. It reads as a caption under the title now — the same relation
                        the conversion has to the amount one box down. */}
                    <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3 transition-shadow focus-within:ring-2 focus-within:ring-primary">
                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field: categoryField }) => (
                          <CategorySelector
                            categories={categories}
                            defaultValue={categoryField.value}
                            onValueChange={categoryField.onChange}
                            isLoading={isCategoryLoading}
                            renderTrigger={(category) => (
                              <button
                                type="button"
                                data-testid="category-trigger"
                                title={tCategories(
                                  `${category.grouping}.${category.name}`,
                                )}
                                aria-label={`${t(
                                  'categoryField.label',
                                )}: ${tCategories(
                                  `${category.grouping}.${category.name}`,
                                )}`}
                                // A glyph in a square is a picture; the chevron is what makes
                                // it a control. Tinted with the accent, as the concept draws it:
                                // it is the one control inside these two boxes, and a grey plate
                                // on a white box had nothing to separate it from the box.
                                className="flex h-12 w-14 shrink-0 items-center justify-center gap-0.5 rounded-lg bg-primary/10 px-1 text-primary transition-colors hover:bg-primary/20"
                              >
                                {isCategoryLoading ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CategoryIcon
                                    category={category}
                                    className="h-4 w-4"
                                  />
                                )}
                                <ChevronDown className="h-4 w-4 opacity-40" />
                              </button>
                            )}
                          />
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <FormControl>
                          <TitleTextarea
                            placeholder={t(
                              `${sExpense}.TitleField.placeholder`,
                            )}
                            className="block w-full border-0 bg-transparent px-1 py-0 text-2xl font-bold leading-tight shadow-none outline-none placeholder:text-xl placeholder:font-normal placeholder:text-subtle-foreground focus-visible:ring-0"
                            {...field}
                            onBlur={async () => {
                              field.onBlur()
                              // Guessing the category costs a round trip to a model, so it
                              // should happen when there is a new title to guess from and not
                              // merely whenever the field loses focus: clicking into the amount
                              // and back used to re-ask about a title nobody had touched.
                              const title = field.value?.trim() ?? ''
                              if (
                                !runtimeFeatureFlags.enableCategoryExtract ||
                                !title ||
                                title === lastExtractedTitleRef.current
                              ) {
                                return
                              }
                              lastExtractedTitleRef.current = title
                              setCategoryLoading(true)
                              try {
                                const { categoryId } =
                                  await extractCategoryFromTitle(title)
                                form.setValue('category', categoryId)
                              } finally {
                                setCategoryLoading(false)
                              }
                            }}
                          />
                        </FormControl>
                        {selectedCategory && (
                          <p
                            data-testid="category-name"
                            className="truncate px-1 pt-1 text-xs text-muted-foreground"
                          >
                            {tCategories(
                              `${selectedCategory.grouping}.${selectedCategory.name}`,
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <FormMessage className="mt-1" />
                  </FormItem>
                )}
              />

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
                    <div className="rounded-xl border bg-card px-3 py-3 transition-shadow focus-within:ring-2 focus-within:ring-primary">
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
                                    className="flex h-12 shrink-0 items-center gap-1 rounded-lg border bg-background px-2.5 font-mono text-sm font-medium text-foreground transition-colors hover:bg-muted"
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
                          <span className="grid h-12 shrink-0 place-items-center rounded-lg border bg-background px-3 font-mono text-sm font-medium text-muted-foreground">
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
                                onValueChange={(val) =>
                                  handlePayerAmountChange(0, val)
                                }
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
                            count: payerFields.length,
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
                        render={() => <FormMessage className="mt-1" />}
                      />
                    )}
                  </FormItem>
                )}
              />
            </div>

            {/* Paid By Section. */}
            {/* Full-bleed so a row's hover runs to the sheet's edge; the rules that used to
                close each of these are gone. What separates one row from the next is the space
                between them, and what says a control is a control is its fill. */}
            <div className="-mx-6">
              <div
                className={cn(
                  !isMultiPayer &&
                    'grid grid-cols-2 items-start gap-3 px-6 py-2',
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
                      const currentAmount =
                        Number(paidByValues[index]?.amount) || 0
                      const isHighest =
                        isMultiPayer &&
                        currentAmount > 0 &&
                        currentAmount === maxAmount

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
                                      handleAddPayer()
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
                                      <div className="flex items-center gap-2">
                                        {/* Optional: Add a subtle icon for the lead payer */}
                                        {isHighest && (
                                          <Crown className="w-3 h-3 text-primary" />
                                        )}
                                        <SelectValue />
                                      </div>
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {group.participants.map(({ id, name }) => (
                                      <SelectItem
                                        key={id}
                                        value={id}
                                        disabled={getIsParticipantPaying(
                                          id,
                                          index,
                                        )}
                                      >
                                        {name}
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
                                  <div className="flex h-11 items-center gap-1 rounded-md border bg-card pl-2 transition-shadow focus-within:ring-2 focus-within:ring-primary [&_button]:h-8 [&_button]:w-8">
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
                                          handlePayerAmountChange(index, val)
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
                              onClick={() => removePayer(index)}
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
                      onClick={handleAddPayer}
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
                            onChange={(e) =>
                              field.onChange(new Date(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Optional, and it closes the run of facts about the expense: what it was, how
                much, who paid, when. Everything past this point is about how the money divides,
                which is a second question and deserves the bottom of the form to itself — the
                collapsible used to sit under the split, so opening it pushed Save off a screen
                the reader had already scrolled to the end of. */}
              <Collapsible
                open={showMoreOptions}
                onOpenChange={setShowMoreOptions}
              >
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
                        showMoreOptions && 'rotate-180',
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

              {!form.watch('isReimbursement') && (
                <div className="px-6 py-3" data-testid="split-control">
                  <Label className="text-sm font-normal text-muted-foreground">
                    {t('SplitMode.title')}
                  </Label>
                  <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
                    {(
                      [
                        ['EVENLY', 'evenly', t('SplitMode.evenly')],
                        ['ITEMS', 'items', t('SplitMode.byItem')],
                      ] as const
                    ).map(([value, testId, label]) => (
                      <button
                        key={value}
                        type="button"
                        data-testid={`split-mode-${testId}`}
                        aria-pressed={splitControl === value}
                        onClick={() => selectSplitControl(value)}
                        className={cn(
                          'min-h-11 rounded-md px-2 text-sm font-medium transition-colors',
                          splitControl === value
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      type="button"
                      data-testid="split-mode-more"
                      aria-pressed={splitControl === 'OTHER'}
                      onClick={() => setSplitSheetOpen(true)}
                      className={cn(
                        'min-h-11 rounded-md px-2 text-sm font-medium transition-colors',
                        splitControl === 'OTHER'
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {/* Carries the chosen mode's name once one is active, so the third position
                        never reads as "something unspecified is going on". */}
                      {splitControl === 'OTHER'
                        ? shortSplitModeLabel(splitMode)
                        : t('SplitMode.custom')}
                    </button>
                  </div>
                  {splitControl !== 'EVENLY' && (
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {splitControl === 'ITEMS'
                        ? t('itemizeField.description')
                        : splitModeHint(splitMode)}
                    </p>
                  )}
                  {/* The hint directly above says "enter each line of the receipt", and until now
                    this screen had no way to reach the thing that reads receipts — the scanner's
                    only entry point in the whole app was an icon in the expense list's header. The
                    itemised path is the one that most wants OCR, so it is the one that gets the
                    offer, and it fills the lines in place rather than navigating anywhere. */}
                  {/* Evenly is most expenses, and who is in is the thing people actually change on
                    it. It used to live in a second card at the far end of a page one and a half
                    screens long; here it is under the control that decides it, each chip carrying
                    that person's share. */}
                  {splitControl === 'OTHER' && (
                    <div className="mt-2">
                      <FormField
                        control={form.control}
                        name="paidFor"
                        render={() => (
                          <FormItem className="space-y-0">
                            <PaidForList
                              form={form}
                              group={group}
                              expenseCurrency={expenseCurrency}
                              totalAmount={totalAmount}
                              splitMode={splitMode}
                              manuallyEditedParticipants={
                                manuallyEditedParticipants
                              }
                              setManuallyEditedParticipants={
                                setManuallyEditedParticipants
                              }
                              recalculateByAmount={recalculateByAmount}
                            />
                            <FormMessage className="mt-1" />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="mt-1 h-auto min-h-11 px-0 text-xs font-normal text-muted-foreground"
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
                        {form.watch('paidFor').length ===
                        group.participants.length
                          ? t('selectNone')
                          : t('selectAll')}
                      </Button>
                    </div>
                  )}
                  {splitControl === 'EVENLY' && (
                    <SplitRows
                      form={form}
                      group={group}
                      currency={expenseCurrency}
                      totalAmount={effectiveTotal}
                      activeUserId={activeUserId}
                    />
                  )}
                  {isCreate &&
                    splitControl === 'ITEMS' &&
                    runtimeFeatureFlags.enableReceiptExtract && (
                      <CreateFromReceiptButton
                        onExtracted={applyReceiptData}
                        trigger={
                          <Button
                            type="button"
                            variant="secondary"
                            className="mt-2 h-11 w-full sm:h-10"
                            data-testid="scan-receipt-in-form"
                          >
                            <Receipt className="mr-2 h-4 w-4" />
                            {tReceipt('scanEntry')}
                          </Button>
                        }
                      />
                    )}
                  {isItemized && (
                    <div className="mt-3">
                      <ItemizationBuilder
                        group={group}
                        currency={expenseCurrency}
                        totalAmount={totalAmount}
                        fields={itemFields}
                        append={itemAppend}
                        remove={itemRemove}
                        activeUserId={activeUserId}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        {/* A plain sheet. The dashed double border framed the lines as a foreign object pasted
            into the form, and the header repeated, word for word, the hint the split control
            directly above it already shows. */}

        {runtimeFeatureFlags.enableExpenseDocuments && (
          <Card bleed className="mt-4">
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

        {/* The overflow half of the split control. A sheet rather than a menu: these are three
            mutually exclusive answers to one question, and the question deserves a title. */}
        <Drawer open={splitSheetOpen} onOpenChange={setSplitSheetOpen}>
          <DrawerContent data-testid="split-mode-sheet">
            <DrawerHeader className="text-left">
              <DrawerTitle>{t('SplitMode.title')}</DrawerTitle>
              <DrawerDescription>{t('SplitMode.sheetHint')}</DrawerDescription>
            </DrawerHeader>
            {/* Rows big enough to hit, each saying what the mode actually does, and a way out that
                is not "guess that the backdrop is tappable". The first version was three bare
                12px-tall lines with no description and no dismiss. */}
            <div className="flex flex-col gap-2 px-4">
              {(['BY_SHARES', 'BY_PERCENTAGE', 'BY_AMOUNT'] as const).map(
                (mode) => {
                  const active = splitControl === 'OTHER' && splitMode === mode
                  const hint = match(mode)
                    .with('BY_SHARES', () => t('SplitMode.bySharesHint'))
                    .with('BY_PERCENTAGE', () =>
                      t('SplitMode.byPercentageHint'),
                    )
                    .otherwise(() => t('SplitMode.byAmountHint'))
                  return (
                    <button
                      key={mode}
                      type="button"
                      data-testid={`split-mode-${mode}`}
                      onClick={() => {
                        selectSplitControl('OTHER', mode)
                        setSplitSheetOpen(false)
                      }}
                      className={cn(
                        'flex min-h-16 items-center justify-between gap-3 rounded-md px-4 py-3 text-left transition-colors',
                        active
                          ? 'bg-primary/10'
                          : 'bg-muted hover:bg-muted-foreground/15',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-base font-medium">
                          {shortSplitModeLabel(mode)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {hint}
                        </span>
                      </span>
                      {active && (
                        <Check className="h-5 w-5 shrink-0 text-primary" />
                      )}
                    </button>
                  )
                },
              )}
            </div>
            <DrawerFooter>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => setSplitSheetOpen(false)}
              >
                {t('SplitMode.close')}
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        {/* Global Error Fallback */}
        {form.formState.errors.root && (
          <div className="mt-4 text-sm font-medium text-destructive">
            {form.formState.errors.root.message}
          </div>
        )}

        {/* Sticky on a phone: the form is still a couple of screens tall once the split is open,
            and hunting for Save at the bottom was the last thing left of the old scroll. */}
        <div className="sticky bottom-0 z-30 -mx-4 mt-4 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
          <SubmitButton
            className="h-11 flex-1 sm:h-10 sm:flex-none"
            loadingContent={t(isCreate ? 'creating' : 'saving')}
          >
            <Save className="w-4 h-4 mr-2" />
            {t(isCreate ? 'create' : 'save')}
          </SubmitButton>
          {!isCreate && onDelete && (
            <DeletePopup
              onDelete={() => onDelete(activeUserId ?? undefined)}
            ></DeletePopup>
          )}
          {/* Cancel is gone. It duplicated the exit the chevron and the device's own back
              button already are, and it was the only one of the three that threw the draft away —
              so the same gesture meant "keep this" or "lose it" depending on which of two
              adjacent controls you reached for. Leaving now always keeps; discarding is offered
              on the way back in, on the banner that says a draft was found. */}
        </div>
      </form>
    </Form>
  )
}

function PaidForList({
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

  const getCalculatedShare = (participantId: string) => {
    return calculateShare(participantId, {
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
              className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                    className="h-9 w-[104px] rounded-md border bg-card shadow-none has-[[data-slot=input-group-control]:focus-visible]:ring-0"
                    inputClassName="h-9 w-full border-0 bg-transparent px-2 text-right font-mono text-base tabular-nums shadow-none focus-visible:ring-0"
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
