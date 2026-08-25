import type { ExpenseFormValues } from '@/lib/schemas'

/**
 * A half-typed expense, kept so that leaving the form does not throw the work away.
 *
 * Nothing guarded this before: browser back, the hardware back button, tapping another tab and the
 * Cancel link all discarded everything silently, and going forward again returned a blank form.
 * A draft beats a "discard changes?" dialog on a phone, because it also survives the things a
 * dialog cannot see — the OS killing a backgrounded PWA, a crash, a reload, a detour through the
 * share sheet — and it adds no friction to an intentional cancel.
 */

const draftKey = (scope: string) => `${scope}-expenseDraft`

/** Create and edit are separate drafts: an unsaved new expense must not overwrite an edit. */
export const createDraftScope = (groupId: string) => `group-${groupId}`
export const editDraftScope = (expenseId: string) => `expense-${expenseId}`

/**
 * Whether a draft holds anything a person would want back.
 *
 * "The form has changed" and "there is an unsaved expense" are not the same question, and treating
 * them as one is what made the banner appear nearly every time. Typing a title and deleting it
 * leaves a category the extractor filled in; typing an amount and clearing it leaves `""` where a
 * `0` used to be; taking a payer off again leaves a rebuilt array. Each of those is a change, and
 * none of them is an expense — so the form would offer to restore a blank one.
 *
 * A person's own words and figures are the test: a title, a note, an amount on any payer, or a
 * receipt line with a name or a price. Amounts are compared against zero rather than tested for
 * truth, because an expense can legitimately be negative — that is what income is.
 */
export function draftHasContent(values: ExpenseFormValues): boolean {
  const written = (value: unknown) =>
    typeof value === 'string' && value.trim() !== ''
  const nonZero = (value: unknown) => {
    const amount = Number(value)
    return Number.isFinite(amount) && amount !== 0
  }
  const rows = (value: unknown): any[] => (Array.isArray(value) ? value : [])

  if (written(values?.title)) return true
  if (written(values?.notes)) return true
  if (rows(values?.paidBy).some((payer) => nonZero(payer?.amount))) return true
  const items = rows((values as { items?: unknown })?.items)
  if (items.some((item) => written(item?.name) || nonZero(item?.price)))
    return true
  return false
}

export function saveExpenseDraft(scope: string, values: ExpenseFormValues) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(draftKey(scope), JSON.stringify(values))
  } catch {
    // A full or unavailable storage quota must never take the form down with it.
  }
}

export function clearExpenseDraft(scope: string) {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(draftKey(scope))
}

/**
 * `expenseDate` is a `Date` on the way in and a string on the way back out of JSON; react-hook-form
 * would happily accept the string and the date input would then render empty. Revive it, and treat
 * anything unparseable as no draft at all rather than half-restoring a form.
 */
export function readExpenseDraft(scope: string): ExpenseFormValues | null {
  if (typeof localStorage === 'undefined') return null
  const stored = localStorage.getItem(draftKey(scope))
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored) as ExpenseFormValues
    const date = new Date(parsed.expenseDate as unknown as string)
    if (isNaN(date.getTime())) return null
    const revived = { ...parsed, expenseDate: date }
    // Also the migration path: drafts of nothing written before this was checked stop being
    // offered the first time they are read, rather than following someone around forever.
    if (!draftHasContent(revived)) {
      clearExpenseDraft(scope)
      return null
    }
    return revived
  } catch {
    clearExpenseDraft(scope)
    return null
  }
}
