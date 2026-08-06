import { distributeItems } from './expense-items'
import { expenseFormSchema } from './schemas'

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

describe('distributeItems', () => {
  it('splits each item between the people sharing it', () => {
    const result = distributeItems(
      [
        { name: 'Pizza', price: 24, participantIds: ['a', 'b'] },
        { name: 'Pasta', price: 30, participantIds: ['b'] },
      ],
      [{ participant: 'a', amount: 54 }],
    )

    expect(result.amount).toBe(54)
    expect(result.paidFor).toEqual([
      { participant: 'a', shares: 12 },
      { participant: 'b', shares: 42 },
    ])
    expect(sum(result.paidFor.map((p) => p.shares))).toBe(result.amount)
  })

  // The personal-item case: the wine one person drank on a shared tab. It stays part of the bill
  // but not of what the group splits, so the payer's contribution scales down with it.
  it('excludes items nobody is sharing and scales the payer down', () => {
    const result = distributeItems(
      [
        { name: 'Pizza', price: 24, participantIds: ['a', 'b'] },
        { name: 'Pasta', price: 30, participantIds: ['a', 'b'] },
        { name: 'Wine', price: 20, participantIds: [] },
      ],
      [{ participant: 'a', amount: 74 }],
    )

    expect(result.amount).toBe(54)
    expect(result.items).toHaveLength(2)
    expect(result.items.map((i) => i.name)).toEqual(['Pizza', 'Pasta'])
    expect(result.paidBy[0].amount).toBeCloseTo(54, 10)
    expect(sum(result.paidFor.map((p) => p.shares))).toBeCloseTo(54, 10)
  })

  it('keeps multiple payers in proportion', () => {
    const result = distributeItems(
      [
        { name: 'Shared', price: 60, participantIds: ['a', 'b'] },
        { name: 'Personal', price: 40, participantIds: [] },
      ],
      [
        { participant: 'a', amount: 70 },
        { participant: 'b', amount: 30 },
      ],
    )

    // 60 of a 100 bill is shared, so each payer counts for 60% of what they put in.
    expect(result.paidBy.map((p) => p.amount)).toEqual([42, 18])
    expect(sum(result.paidBy.map((p) => p.amount))).toBeCloseTo(
      result.amount,
      10,
    )
  })

  it('handles every item being personal', () => {
    const result = distributeItems(
      [{ name: 'Mine', price: 10, participantIds: [] }],
      [{ participant: 'a', amount: 10 }],
    )

    expect(result.amount).toBe(0)
    expect(result.items).toEqual([])
    expect(result.paidFor).toEqual([])
  })

  it('accepts prices and amounts given as strings', () => {
    const result = distributeItems(
      [{ name: 'Thing', price: '12.50', participantIds: ['a', 'b'] }],
      [{ participant: 'a', amount: '12.50' }],
    )

    expect(result.amount).toBe(12.5)
    expect(result.paidFor).toEqual([
      { participant: 'a', shares: 6.25 },
      { participant: 'b', shares: 6.25 },
    ])
  })
})

// The form reaches this logic through the schema's transform. These pin that path down, so
// extracting the shared function cannot quietly change how the form splits a bill.
describe('expenseFormSchema itemisation', () => {
  const baseExpense = {
    expenseDate: new Date('2026-01-01T00:00:00.000Z'),
    title: 'Dinner',
    category: 0,
    originalCurrency: '',
    paidBy: [{ participant: 'a', amount: 74 }],
    paidFor: [{ participant: 'a', shares: 1 }],
    splitMode: 'EVENLY',
    saveDefaultSplittingOptions: false,
    isReimbursement: false,
    documents: [],
    recurrenceRule: 'NONE',
  }

  it('derives the split from the items and drops the personal ones', () => {
    const result = expenseFormSchema.safeParse({
      ...baseExpense,
      items: [
        { name: 'Pizza', price: 24, participantIds: ['a', 'b'] },
        { name: 'Pasta', price: 30, participantIds: ['a', 'b'] },
        { name: 'Wine', price: 20, participantIds: [] },
      ],
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.amount).toBe(54)
    expect(result.data.splitMode).toBe('BY_AMOUNT')
    expect(result.data.items.map((i) => i.name)).toEqual(['Pizza', 'Pasta'])
    expect(result.data.paidBy[0].amount).toBeCloseTo(54, 10)
    expect(sum(result.data.paidFor.map((p) => Number(p.shares)))).toBeCloseTo(
      54,
      10,
    )
  })

  it('rejects items that do not add up to what was paid', () => {
    const result = expenseFormSchema.safeParse({
      ...baseExpense,
      items: [{ name: 'Pizza', price: 10, participantIds: ['a'] }],
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(JSON.stringify(result.error.issues)).toContain('itemTotalMismatch')
  })
})
