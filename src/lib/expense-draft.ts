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
    return { ...parsed, expenseDate: date }
  } catch {
    clearExpenseDraft(scope)
    return null
  }
}
