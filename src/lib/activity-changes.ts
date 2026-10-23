/**
 * What actually changed in an expense, recorded alongside the activity entry.
 *
 * The activity feed used to say only "Expense *Dinner* updated by Bob" — true, but useless in an
 * app about shared money, where the question three weeks later is always *what* changed. This
 * records the before/after so the feed can answer it.
 *
 * It rides inside the existing nullable `Activity.data` column rather than a new one, so no
 * migration is needed and no running instance has to be migrated before the new code works. Rows
 * written before this existed hold a bare title string; `decodeActivityData` treats anything that
 * is not the expected JSON shape as exactly that.
 */

import type { RecurrenceRule, SplitMode } from '@prisma/client'

export type ActivityChange = {
  /** Message key under `Activity.Changes`. */
  field: 'title' | 'amount' | 'date' | 'category' | 'paidBy' | 'paidFor'
  from: string
  to: string
}

/**
 * An expense as it stood when it was deleted — everything needed to put it back exactly, under its
 * own id, so that links to it and its earlier history entries work again. Kept in the deletion's
 * activity entry, which is what makes a deletion undoable from the toast and, later, from the feed.
 * Dates are ISO strings and the conversion rate a decimal string, as JSON has no better.
 */
export type DeletedExpenseSnapshot = {
  id: string
  title: string
  amount: number
  categoryId: number
  expenseDate: string
  createdAt: string
  isReimbursement: boolean
  splitMode: SplitMode
  notes: string | null
  originalAmount: number | null
  originalCurrency: string | null
  conversionRate: string | null
  recurrenceRule: RecurrenceRule | null
  recurringExpenseLinkId: string | null
  paidBy: { participantId: string; amount: number }[]
  paidFor: { participantId: string; shares: number }[]
  items: { id: string; name: string; price: number; participantIds: string[] }[]
  /** Documents outlive their expense (the relation only clears), so ids are enough. */
  documentIds: string[]
  recurringLink: {
    id: string
    nextExpenseCreatedAt: string | null
    nextExpenseDate: string
  } | null
}

type ActivityData = {
  title: string
  changes: ActivityChange[]
  /** Set when a recurring expense caught up: how many occurrences were added at once. */
  occurrences?: number
  /** Set on a deletion: the expense, so it can be restored. */
  deleted?: DeletedExpenseSnapshot
  /** Set on the creation a restore records. */
  restored?: true
}

export function encodeActivityData(
  title: string,
  changes: ActivityChange[],
): string {
  if (changes.length === 0) return title
  return JSON.stringify({ title, changes } satisfies ActivityData)
}

/**
 * One activity line for a recurring expense that caught up, however many occurrences that was.
 * Those used to be added with no line at all — 365 expenses could appear in a group overnight and
 * the feed said nothing — and a line apiece would bury everything else in the feed.
 */
export function encodeRecurringActivityData(
  title: string,
  occurrences: number,
): string {
  return JSON.stringify({
    title,
    changes: [],
    occurrences,
  } satisfies ActivityData)
}

export function encodeDeletedActivityData(
  snapshot: DeletedExpenseSnapshot,
): string {
  return JSON.stringify({
    title: snapshot.title,
    changes: [],
    deleted: snapshot,
  } satisfies ActivityData)
}

export function encodeRestoredActivityData(title: string): string {
  return JSON.stringify({
    title,
    changes: [],
    restored: true,
  } satisfies ActivityData)
}

export function decodeActivityData(data: string | null | undefined): {
  title: string
  changes: ActivityChange[]
  occurrences?: number
  deleted?: DeletedExpenseSnapshot
  restored?: true
} {
  if (!data) return { title: '', changes: [] }
  if (!data.startsWith('{')) return { title: data, changes: [] }
  try {
    const parsed = JSON.parse(data) as Partial<ActivityData>
    if (typeof parsed?.title !== 'string' || !Array.isArray(parsed.changes)) {
      return { title: data, changes: [] }
    }
    return {
      title: parsed.title,
      changes: parsed.changes,
      ...(typeof parsed.occurrences === 'number'
        ? { occurrences: parsed.occurrences }
        : {}),
      ...(typeof parsed.deleted?.id === 'string'
        ? { deleted: parsed.deleted }
        : {}),
      ...(parsed.restored === true ? { restored: true as const } : {}),
    }
  } catch {
    // A title that merely happens to start with "{" is not a crash.
    return { title: data, changes: [] }
  }
}

type ExpenseSide = {
  title: string
  amount: number
  expenseDate: Date
  categoryName?: string
  /** Names only: per-payer amounts are not compared, and carrying them here invited a
   *  minor-vs-major unit mismatch between the two sides. */
  paidBy: string[]
  paidFor: string[]
}

const formatDay = (date: Date) => date.toISOString().slice(0, 10)

const payerList = (payers: string[]) => payers.join(', ') || '—'

/**
 * Amounts stay in minor units so the renderer can format them in the group's currency; everything
 * else is already display text.
 */
export function describeExpenseChanges(
  before: ExpenseSide,
  after: ExpenseSide,
): ActivityChange[] {
  const changes: ActivityChange[] = []

  if (before.title !== after.title)
    changes.push({ field: 'title', from: before.title, to: after.title })

  if (before.amount !== after.amount)
    changes.push({
      field: 'amount',
      from: String(before.amount),
      to: String(after.amount),
    })

  if (formatDay(before.expenseDate) !== formatDay(after.expenseDate))
    changes.push({
      field: 'date',
      from: formatDay(before.expenseDate),
      to: formatDay(after.expenseDate),
    })

  if ((before.categoryName ?? '') !== (after.categoryName ?? ''))
    changes.push({
      field: 'category',
      from: before.categoryName ?? '—',
      to: after.categoryName ?? '—',
    })

  const beforePayers = payerList(before.paidBy)
  const afterPayers = payerList(after.paidBy)
  if (beforePayers !== afterPayers)
    changes.push({ field: 'paidBy', from: beforePayers, to: afterPayers })

  const beforeFor = [...before.paidFor].sort().join(', ')
  const afterFor = [...after.paidFor].sort().join(', ')
  if (beforeFor !== afterFor)
    changes.push({ field: 'paidFor', from: beforeFor, to: afterFor })

  return changes
}
