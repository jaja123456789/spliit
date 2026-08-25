import type { ExpenseFormValues } from '@/lib/schemas'
import { draftHasContent } from './expense-draft'

/**
 * The banner said "You have an unsaved expense from earlier" for drafts that held no expense.
 *
 * Every case below was reproduced in a browser first: each is a sequence someone performs and
 * undoes, leaving the form changed and empty. What the form kept was bookkeeping — a category the
 * extractor guessed, an amount that had round-tripped from `0` to `""`, a `paidFor` array rebuilt
 * in a different order — and the old test for "is this worth keeping" was only ever "has anything
 * changed", which all of these answer yes to.
 */
const blank = (over: Partial<ExpenseFormValues> = {}) =>
  ({
    title: '',
    notes: '',
    category: 0,
    expenseDate: new Date('2026-08-25T00:00:00.000Z'),
    splitMode: 'EVENLY',
    isReimbursement: false,
    saveDefaultSplittingOptions: false,
    recurrenceRule: 'NONE',
    paidBy: [{ participant: 'alice', amount: 0 }],
    paidFor: [
      { participant: 'alice', shares: '1' },
      { participant: 'bob', shares: '1' },
    ],
    items: [],
    ...over,
  }) as unknown as ExpenseFormValues

describe('draftHasContent', () => {
  it('is false for a form nobody has written anything into', () => {
    expect(draftHasContent(blank())).toBe(false)
  })

  it('is false when a typed title has been deleted again, category residue and all', () => {
    // The extractor fills `category` from the title on blur, and clearing the title does not
    // put it back. That residue is a change; it is not an expense.
    expect(draftHasContent(blank({ category: 9 } as any))).toBe(false)
  })

  it('is false when an amount has been typed and cleared', () => {
    // The input hands back "" where the default was the number 0 — different values, same nothing.
    expect(
      draftHasContent(
        blank({ paidBy: [{ participant: 'alice', amount: '' }] } as any),
      ),
    ).toBe(false)
  })

  it('is false when the people were reordered but nothing was entered', () => {
    expect(
      draftHasContent(
        blank({
          paidFor: [
            { participant: 'bob', shares: '1' },
            { participant: 'alice', shares: '1' },
          ],
        } as any),
      ),
    ).toBe(false)
  })

  it('is false for receipt lines that are still empty', () => {
    expect(
      draftHasContent(
        blank({ items: [{ name: '', price: 0, participantIds: [] }] } as any),
      ),
    ).toBe(false)
  })

  it('keeps a title', () => {
    expect(draftHasContent(blank({ title: 'Taxi to airport' }))).toBe(true)
  })

  it('keeps a note', () => {
    expect(draftHasContent(blank({ notes: 'split with Dana later' }))).toBe(
      true,
    )
  })

  it('keeps an amount with no title — the figure is the expense', () => {
    expect(
      draftHasContent(
        blank({ paidBy: [{ participant: 'alice', amount: 12.75 }] } as any),
      ),
    ).toBe(true)
  })

  it('keeps a negative amount, because that is what income is', () => {
    expect(
      draftHasContent(
        blank({ paidBy: [{ participant: 'alice', amount: -40 }] } as any),
      ),
    ).toBe(true)
  })

  it('keeps an amount typed into the second payer', () => {
    expect(
      draftHasContent(
        blank({
          paidBy: [
            { participant: 'alice', amount: 0 },
            { participant: 'bob', amount: 8 },
          ],
        } as any),
      ),
    ).toBe(true)
  })

  it('keeps a receipt line that has a name, even with no price yet', () => {
    expect(
      draftHasContent(
        blank({
          items: [{ name: 'Gambas ao alhinho', price: 0, participantIds: [] }],
        } as any),
      ),
    ).toBe(true)
  })

  it('keeps a receipt line that has a price, even with no name yet', () => {
    expect(
      draftHasContent(
        blank({ items: [{ name: '', price: 18.5, participantIds: [] }] } as any),
      ),
    ).toBe(true)
  })

  it('treats whitespace as nothing', () => {
    expect(draftHasContent(blank({ title: '   ' }))).toBe(false)
  })

  it('survives values that are missing or the wrong shape', () => {
    expect(draftHasContent({} as ExpenseFormValues)).toBe(false)
    expect(draftHasContent(undefined as unknown as ExpenseFormValues)).toBe(
      false,
    )
    expect(
      draftHasContent({ paidBy: 'nonsense' } as unknown as ExpenseFormValues),
    ).toBe(false)
  })
})
