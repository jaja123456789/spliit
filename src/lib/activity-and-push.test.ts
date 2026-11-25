import { describeExpenseChanges } from './activity-changes'
import { shouldNotify } from './push'

jest.mock('@/lib/prisma', () => ({ prisma: {} }))
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}))

describe('activity: payers', () => {
  const base = {
    title: 'Dinner',
    amount: 1000,
    expenseDate: new Date('2026-11-26'),
    categoryName: 'Food',
    paidFor: ['Alice', 'Bob'],
  }

  it('does not log the same payers in another order as a change', () => {
    expect(
      describeExpenseChanges(
        { ...base, paidBy: ['Alice', 'Bob'] },
        { ...base, paidBy: ['Bob', 'Alice'] },
      ),
    ).toEqual([])
  })

  it('still logs a different payer', () => {
    expect(
      describeExpenseChanges(
        { ...base, paidBy: ['Alice'] },
        { ...base, paidBy: ['Bob'] },
      ).map((change) => change.field),
    ).toEqual(['paidBy'])
  })
})

describe('push: who hears about a change', () => {
  it('skips the person who made it', () => {
    expect(shouldNotify('alice', 'alice')).toBe(false)
    expect(shouldNotify('bob', 'alice')).toBe(true)
    expect(shouldNotify(null, 'alice')).toBe(true)
  })

  it('tells everyone when nobody is known to have made it', () => {
    expect(shouldNotify(null, undefined)).toBe(true)
    expect(shouldNotify('alice', undefined)).toBe(true)
  })
})
