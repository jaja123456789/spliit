import { Prisma } from '@prisma/client'
import { z } from 'zod'

/**
 * What the expense list can be narrowed to. Every part is optional, and an expense has to satisfy
 * all of the ones given.
 */
export type ExpenseFilters = {
  /**
   * Free text. Each word has to match something on the expense: its title or notes, its category,
   * or the name of someone who paid it — and a word that reads as a number also matches the
   * amount. "lidl 45" finds the Lidl shop of €45-something.
   */
  search?: string
  /** Only what this participant paid, alone or with others. */
  paidBy?: string
  categoryId?: number
  /** A calendar month, `YYYY-MM`. */
  month?: string
}

export const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

/** The filters as procedure input, shared so that every query narrowing the list reads the same. */
export const expenseFiltersInput = {
  search: z.string().optional(),
  paidBy: z.string().min(1).optional(),
  categoryId: z.number().int().optional(),
  month: z.string().regex(MONTH_PATTERN).optional(),
}

export function hasActiveFilters(filters: ExpenseFilters) {
  return (
    !!filters.search?.trim() ||
    !!filters.paidBy ||
    filters.categoryId !== undefined ||
    !!filters.month
  )
}

/** The first day of the month and the first day of the next, as the UTC midnights dates are kept in. */
export function monthRange(month: string) {
  const match = MONTH_PATTERN.exec(month)
  if (!match) return null
  const year = Number(match[1])
  const index = Number(match[2]) - 1
  return {
    start: new Date(Date.UTC(year, index, 1)),
    end: new Date(Date.UTC(year, index + 1, 1)),
  }
}

/**
 * The amounts a search word can mean, in minor units, or `null` when it is not a number.
 *
 * A whole number covers everything up to the next one — "45" is 45.00 to 45.99, because nobody
 * remembers the cents — and a number with decimals is exactly that amount. A currency sign around
 * the digits is ignored. `.` and `,` are both read as the decimal separator when no more digits
 * follow than the currency has decimals, and as a thousands separator when three do: "45,5",
 * "1,250" and "1.250,00" all mean what they say in a two-decimal currency.
 */
export function parseAmountSearch(
  word: string,
  decimals: number,
): { min: number; max: number } | null {
  const match = /^[^\p{L}\d]*(\d[\d.,]*)[^\p{L}\d]*$/u.exec(word)
  if (!match) return null
  const number = match[1].replace(/[.,]$/, '')
  const separator = Math.max(number.lastIndexOf('.'), number.lastIndexOf(','))
  const digitsAfter = separator === -1 ? 0 : number.length - separator - 1

  let whole: string
  let fraction: string | null = null
  if (separator === -1) {
    whole = number
  } else if (digitsAfter >= 1 && digitsAfter <= decimals) {
    whole = number.slice(0, separator).replace(/[.,]/g, '')
    fraction = number.slice(separator + 1)
  } else if (digitsAfter === 3) {
    whole = number.replace(/[.,]/g, '')
  } else {
    return null
  }
  if (!/^\d{1,12}$/.test(whole)) return null

  const unit = 10 ** decimals
  if (fraction === null) {
    const min = Number(whole) * unit
    return { min, max: min + unit - 1 }
  }
  const exact = Number(whole) * unit + Number(fraction.padEnd(decimals, '0'))
  return { min: exact, max: exact }
}

/** A word at the start of a name or of any word in it: "train" finds "Bus/Train", "al" not "General". */
function startsAWord(word: string) {
  const mode = 'insensitive' as const
  return [
    { startsWith: word, mode },
    { contains: ` ${word}`, mode },
    { contains: `/${word}`, mode },
  ]
}

function wordConditions(
  word: string,
  decimals: number,
): Prisma.ExpenseWhereInput[] {
  const anywhere = { contains: word, mode: 'insensitive' as const }
  const conditions: Prisma.ExpenseWhereInput[] = [
    { title: anywhere },
    { notes: anywhere },
    // Category and people match from the start of a word only. Every expense nobody categorised
    // is "General", and a substring match would have answered "al" with all of them.
    ...startsAWord(word).flatMap((name) => [
      { category: { name } },
      { category: { grouping: name } },
      { paidBy: { some: { participant: { name } } } },
    ]),
  ]

  const amount = parseAmountSearch(word, decimals)
  if (amount) {
    // Either sign: money received is stored negative but shown as the same figure.
    for (const range of [
      { gte: amount.min, lte: amount.max },
      { gte: -amount.max, lte: -amount.min },
    ]) {
      conditions.push({ amount: range }, { originalAmount: range })
    }
  }
  return conditions
}

/**
 * The `where` for a group's expenses under these filters. One builder for every query that narrows
 * the list, so the rows, their count and their total can never disagree about what matched.
 *
 * @param decimals The group currency's, to know what amount a number in the search means.
 */
export function expenseFiltersWhere(
  groupId: string,
  filters: ExpenseFilters,
  decimals: number,
): Prisma.ExpenseWhereInput {
  const words = (filters.search ?? '').trim().split(/\s+/).filter(Boolean)
  const month = filters.month ? monthRange(filters.month) : null

  return {
    groupId,
    categoryId: filters.categoryId,
    expenseDate: month ? { gte: month.start, lt: month.end } : undefined,
    AND: [
      ...words.map((word) => ({ OR: wordConditions(word, decimals) })),
      ...(filters.paidBy
        ? [{ paidBy: { some: { participantId: filters.paidBy } } }]
        : []),
    ],
  }
}
