import { Currency } from '@/lib/currency'
import { ExpenseFormValues, SplittingOptions } from '@/lib/schemas'
import {
  amountAsDecimal,
  amountAsMinorUnits,
  toDateInputValue,
  todayAsDateOnly,
} from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'

/**
 * The amount an expense was originally entered for, in minor units of the currency it was entered
 * in. `originalAmount` used to be written in major units, so a value that is inconsistent with the
 * stored conversion rate is recomputed from the amount in the group currency instead.
 */
export function getOriginalTotalInMinorUnits(
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

export const enforceCurrencyPattern = (value: string) =>
  value
    .replace(/^\s*-/, '_')
    .replace(/[.,]/, '#')
    .replace(/[-.,]/g, '')
    .replace(/_/, '-')
    .replace(/#/, '.')
    .replace(/[^-\d.]/g, '')

export const getDefaultSplittingOptions = (
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

    // Stored as the form had them — 50 for 50%, 2 for two shares — except Evenly, which is stored
    // as 100 apiece. Reading every mode back divided by 100 turned a saved 50/25/25 into
    // 0.5/0.25/0.25, which can never add up to 100, and two shares into "0.02". Evenly is one
    // share each whatever was stored; every other mode comes back as it was typed.
    const isEvenly = parsedDefaultSplitMode.splitMode === 'EVENLY'
    return {
      splitMode: parsedDefaultSplitMode.splitMode,
      paidFor: parsedDefaultSplitMode.paidFor.map((paidFor) => ({
        participant: paidFor.participant,
        shares: (isEvenly
          ? '1'
          : String(parseFloat(paidFor.shares.toString()))) as any,
      })),
    }
  } catch (e) {
    return defaultValue
  }
}

export async function persistDefaultSplittingOptions(
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
 * What counts as the same form, for deciding whether anything has been edited.
 *
 * A plain `JSON.stringify` of the values compares two things it should not: the order of the rows
 * and the type they happen to be carrying. `paidFor` is rebuilt whenever someone is added or
 * dropped, so taking a person off and putting them back reordered the array and the form counted
 * as changed forever after; amounts round-trip between numbers and the strings the inputs hold, so
 * `0` and `"0"` read as an edit. Sort the rows by who they are about and compare their figures as
 * figures. `conversionRate` is excluded: the exchange-rate effect fills it in on its own, which is
 * not the user typing anything.
 */
export const fingerprintValues = (values: unknown) => {
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
    items: (Array.isArray(rest.items) ? rest.items : []).map((item: any) => ({
      name: String(item?.name ?? ''),
      price: figure(item?.price),
      participantIds: [...(item?.participantIds ?? [])].sort(),
    })),
  })
}

export function formatDate(date?: Date) {
  if (!date || isNaN(date as any)) date = todayAsDateOnly()
  return toDateInputValue(date)
}
