'use client'

import {
  clearExpenseDraft,
  draftHasContent,
  readExpenseDraft,
  saveExpenseDraft,
  touchExpenseDraft,
} from '@/lib/expense-draft'
import { ExpenseFormValues } from '@/lib/schemas'
import { useEffect, useRef, useState } from 'react'
import { UseFormReturn } from 'react-hook-form'
import { fingerprintValues } from './helpers'

/**
 * The draft of this expense: offered back when one exists, kept while the form is on screen, and
 * saved whenever the values differ from what the form opened with.
 *
 * The effects run in the order they always have — the pristine values are taken before anything
 * else on mount writes to the form — so call this where the form's draft effects used to begin:
 * after the receipt hand-off, before the effects that adjust values on their own.
 */
export function useExpenseDraft({
  form,
  draftScope,
  prefilled,
  onRestored,
}: {
  form: UseFormReturn<ExpenseFormValues>
  draftScope: string
  /**
   * The form opened already filled in — from a receipt, or as a copy of another expense. That is a
   * more specific intent than a leftover draft, so no draft is offered over it.
   */
  prefilled: boolean
  /**
   * Called after a draft has been poured back in, with the draft. The form's own state beside the
   * values — whether it is itemised, which rows were typed by hand — is the form's to set from it.
   */
  onRestored: (draft: ExpenseFormValues) => void
}) {
  // Restored, not offered. Being asked "you have an unsaved expense — restore or discard?" makes
  // you read and decide, every time, about something you almost always want; the form simply comes
  // back as you left it and says so quietly, with a way out for the time you did not want it.
  const [pendingDraft, setPendingDraft] = useState<ExpenseFormValues | null>(
    null,
  )
  const pristineValuesRef = useRef<ExpenseFormValues | null>(null)

  // The form opens as a new expense and *offers* the draft, rather than arriving already filled
  // in. Leaving deliberately is the common case and coming back to your own half-typed expense is
  // the rare one, so the rare one asks and the common one costs nothing.
  //
  // The draft is held in state as well as in storage, because typing into the blank form
  // immediately overwrites what is stored — which is right, that is a new expense — but must not
  // take away the thing still being offered on screen.
  useEffect(() => {
    if (prefilled) return
    if (pristineValuesRef.current === null) {
      pristineValuesRef.current = form.getValues()
    }
    const draft = readExpenseDraft(draftScope)
    if (!draft) return
    setPendingDraft(draft)
  }, [draftScope, prefilled, form])

  const restoreDraft = () => {
    if (!pendingDraft) return
    // No validation on the way in: a half-typed expense is exactly what this holds, and greeting
    // someone with a wall of red for the parts they had not reached yet helps nobody.
    form.reset(pendingDraft)
    // The baseline moves with it. Without this the restored values read as an edit against the
    // blank form they replaced, so leaving again immediately — having changed nothing — would
    // count as a change and re-stamp the draft's two-minute clock.
    initialValuesRef.current = fingerprintValues(pendingDraft)
    onRestored(pendingDraft)
    setPendingDraft(null)
  }

  const discardDraft = () => {
    clearExpenseDraft(draftScope)
    savedThisMountRef.current = false
    setPendingDraft(null)
  }

  // Keep the draft alive while its form is on screen — see `touchExpenseDraft`. Only while
  // visible: a backgrounded tab is someone who has left, and their two minutes should be running.
  useEffect(() => {
    if (prefilled) return
    const touch = () => {
      if (document.visibilityState === 'visible') touchExpenseDraft(draftScope)
    }
    const timer = window.setInterval(touch, 30_000)
    document.addEventListener('visibilitychange', touch)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', touch)
    }
  }, [draftScope, prefilled])

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
    if (initialValuesRef.current === null) {
      initialValuesRef.current = fingerprintValues(form.getValues())
    }
    const subscription = form.watch((values) => {
      const unchanged = fingerprintValues(values) === initialValuesRef.current
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

  return { pendingDraft, restoreDraft, discardDraft }
}
