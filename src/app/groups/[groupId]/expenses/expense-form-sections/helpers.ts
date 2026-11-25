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

/**
 * By exact amount: what is left of the total after the rows someone typed, spread over the rows
 * nobody has touched, in whole minor units so the split always adds up to the total.
 *
 * The spare units go to a seeded selection of the untouched rows — stable while typing, so a
 * figure does not hop from row to row with every keystroke. The selection used to count *every*
 * row, typed ones included, so it could land a spare cent on a typed row (where it was dropped) or
 * miss — €10.01 three ways with the middle row typed as 3.00 came out 3.50 + 3.00 + 3.50, €10.00,
 * which the form then refused to save.
 */
export function redistributeByAmount<
  P extends { participant: string; shares: unknown },
>(
  total: number,
  paidFor: P[],
  edited: Set<string>,
  decimalDigits: number,
): P[] {
  const precision = Math.pow(10, decimalDigits)
  const toUnits = (value: unknown) =>
    Math.round((Number(value) || 0) * precision)
  const untouched = paidFor.filter((p) => !edited.has(p.participant))
  const count = untouched.length
  if (count === 0) return [...paidFor]

  // Whole units throughout: 10.01 − 3.00 in floating point is 7.009999…
  const remainingUnits =
    toUnits(total) -
    paidFor
      .filter((p) => edited.has(p.participant))
      .reduce((sum, p) => sum + toUnits(p.shares), 0)
  // Truncation, not floor, so an income (negative) splits symmetrically.
  const baseUnits = Math.trunc(remainingUnits / count)
  const spareUnits = remainingUnits - baseUnits * count
  const seed = Math.abs(toUnits(total))

  let position = 0
  return paidFor.map((p) => {
    if (edited.has(p.participant)) return p
    // `position` counts untouched rows only, so (seed + position) % count visits each of
    // 0…count−1 exactly once and exactly |spareUnits| rows get a unit.
    const takesSpare = (seed + position++) % count < Math.abs(spareUnits)
    const units = baseUnits + (takesSpare ? Math.sign(spareUnits) : 0)
    return { ...p, shares: (units / precision).toFixed(decimalDigits) }
  })
}
