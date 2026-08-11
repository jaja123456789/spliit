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

export type ActivityChange = {
  /** Message key under `Activity.Changes`. */
  field: 'title' | 'amount' | 'date' | 'category' | 'paidBy' | 'paidFor'
  from: string
  to: string
}

type ActivityData = { title: string; changes: ActivityChange[] }

export function encodeActivityData(
  title: string,
  changes: ActivityChange[],
): string {
  if (changes.length === 0) return title
  return JSON.stringify({ title, changes } satisfies ActivityData)
}

export function decodeActivityData(data: string | null | undefined): {
  title: string
  changes: ActivityChange[]
} {
  if (!data) return { title: '', changes: [] }
  if (!data.startsWith('{')) return { title: data, changes: [] }
  try {
    const parsed = JSON.parse(data) as Partial<ActivityData>
    if (typeof parsed?.title !== 'string' || !Array.isArray(parsed.changes)) {
      return { title: data, changes: [] }
    }
    return { title: parsed.title, changes: parsed.changes }
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
