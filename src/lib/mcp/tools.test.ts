import type { McpUser } from './tokens'
import { addExpense, listExpenses } from './tools'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    syncedGroup: { findFirst: jest.fn(), findMany: jest.fn() },
    expense: { findFirst: jest.fn() },
  },
}))
jest.mock('@/lib/api', () => ({
  createExpense: jest.fn(),
  getGroup: jest.fn(),
  getGroupExpenses: jest.fn(),
}))
jest.mock('@/lib/currency-rates', () => {
  class ExchangeRateError extends Error {}
  return { ExchangeRateError, getExchangeRate: jest.fn() }
})

const { prisma } = jest.requireMock('@/lib/prisma')
const api = jest.requireMock('@/lib/api')
const rates = jest.requireMock('@/lib/currency-rates')

const user: McpUser = {
  id: 'user-1',
  email: 'a@b.c',
  name: null,
  syncProfileId: 'profile-1',
}

const participants = [
  { id: 'p1', name: 'Ada' },
  { id: 'p2', name: 'Grace' },
  { id: 'p3', name: 'Alan' },
]

const usdGroup = {
  id: 'g1',
  name: 'Trip',
  currency: '$',
  currencyCode: 'USD',
  simplifyDebts: true,
  participants,
}

function grantAccess(activeParticipantId: string | null = 'p1') {
  prisma.syncedGroup.findFirst.mockResolvedValue({ activeParticipantId })
  api.getGroup.mockResolvedValue(usdGroup)
}

beforeEach(() => {
  jest.clearAllMocks()
  prisma.expense.findFirst.mockResolvedValue(null)
  api.createExpense.mockImplementation(async (values: any) => ({
    id: 'e1',
    title: values.title,
    expenseDate: values.expenseDate,
    amount: Math.round(Number(values.amount) * 100),
  }))
})

// The authorization boundary: a token is scoped to its owner's synced groups. Without this a
// token could read or write any group in the instance, since groups are ID-addressable.
describe('group access', () => {
  it('refuses a group that is not in the user’s synced groups', async () => {
    prisma.syncedGroup.findFirst.mockResolvedValue(null)

    await expect(
      listExpenses(user, { groupId: 'someone-elses-group' }),
    ).rejects.toThrow(/not in your synced groups|No group/i)
    expect(api.getGroup).not.toHaveBeenCalled()
  })

  it('refuses to add an expense to a group the user has not synced', async () => {
    prisma.syncedGroup.findFirst.mockResolvedValue(null)

    await expect(
      addExpense(user, { groupId: 'g-other', title: 'x', amount: 10 }),
    ).rejects.toThrow()
    expect(api.createExpense).not.toHaveBeenCalled()
  })
})

describe('addExpense', () => {
  it('defaults the payer to the user’s participant and splits evenly', async () => {
    grantAccess('p2')

    const result = await addExpense(user, {
      groupId: 'g1',
      title: 'Dinner',
      amount: 30,
    })

    expect(result).toMatchObject({ created: true, paidBy: 'Grace' })
    const values = api.createExpense.mock.calls[0][0]
    expect(values.paidBy).toEqual([{ participant: 'p2', amount: 30 }])
    expect(values.splitMode).toBe('EVENLY')
    expect(values.paidFor).toHaveLength(3)
  })

  it('resolves participants by name', async () => {
    grantAccess()

    await addExpense(user, {
      groupId: 'g1',
      title: 'Taxi',
      amount: 12,
      paidBy: 'Alan',
      paidFor: ['Ada', 'Alan'],
    })

    const values = api.createExpense.mock.calls[0][0]
    expect(values.paidBy[0].participant).toBe('p3')
    expect(values.paidFor.map((p: any) => p.participant)).toEqual(['p1', 'p3'])
  })

  it('rejects an unknown participant rather than guessing', async () => {
    grantAccess()

    await expect(
      addExpense(user, {
        groupId: 'g1',
        title: 'x',
        amount: 5,
        paidBy: 'Nobody',
      }),
    ).rejects.toThrow(/no participant matching/i)
    expect(api.createExpense).not.toHaveBeenCalled()
  })

  it('converts a foreign currency and stores what the form would store', async () => {
    grantAccess()
    rates.getExchangeRate.mockResolvedValue(1.1)

    const result = await addExpense(user, {
      groupId: 'g1',
      title: 'Hotel',
      amount: 100,
      currency: 'eur',
      date: '2026-03-04',
    })

    const values = api.createExpense.mock.calls[0][0]
    expect(values.amount).toBeCloseTo(110, 10)
    expect(values.originalAmount).toBe(100)
    expect(values.originalCurrency).toBe('EUR')
    expect(values.conversionRate).toBe(1.1)
    // The payer's amount is in the group currency, matching the converted total.
    expect(values.paidBy[0].amount).toBeCloseTo(110, 10)
    expect(result).toMatchObject({
      originalCurrency: 'EUR',
      conversionRate: 1.1,
    })
  })

  it('uses an explicit rate without calling the rate service', async () => {
    grantAccess()

    await addExpense(user, {
      groupId: 'g1',
      title: 'Hotel',
      amount: 100,
      currency: 'EUR',
      conversionRate: 2,
    })

    expect(rates.getExchangeRate).not.toHaveBeenCalled()
    expect(api.createExpense.mock.calls[0][0].amount).toBeCloseTo(200, 10)
  })

  it('refuses to store anything when the rate cannot be found', async () => {
    grantAccess()
    rates.getExchangeRate.mockRejectedValue(
      new rates.ExchangeRateError('no rates'),
    )

    await expect(
      addExpense(user, {
        groupId: 'g1',
        title: 'Hotel',
        amount: 100,
        currency: 'EUR',
      }),
    ).rejects.toThrow(/conversion_rate/)
    expect(api.createExpense).not.toHaveBeenCalled()
  })

  it('rejects a currency the app does not support', async () => {
    grantAccess()

    await expect(
      addExpense(user, {
        groupId: 'g1',
        title: 'x',
        amount: 5,
        currency: 'XYZ',
      }),
    ).rejects.toThrow(/not a currency this app supports/i)
  })

  it('keeps exact split amounts adding up to the total', async () => {
    grantAccess()

    await addExpense(user, {
      groupId: 'g1',
      title: 'Groceries',
      amount: 30,
      amountsPerParticipant: [
        { participant: 'Ada', amount: 20 },
        { participant: 'Grace', amount: 10 },
      ],
    })

    const values = api.createExpense.mock.calls[0][0]
    expect(values.splitMode).toBe('BY_AMOUNT')
    expect(
      values.paidFor.reduce((s: number, p: any) => s + Number(p.shares), 0),
    ).toBeCloseTo(30, 10)
  })

  it('rejects exact split amounts that do not match the total', async () => {
    grantAccess()

    await expect(
      addExpense(user, {
        groupId: 'g1',
        title: 'Groceries',
        amount: 30,
        amountsPerParticipant: [{ participant: 'Ada', amount: 25 }],
      }),
    ).rejects.toThrow(/adds up to/)
  })

  // A retried tool call arrives with identical arguments moments after the first.
  it('does not create a second expense for an apparent retry', async () => {
    grantAccess()
    prisma.expense.findFirst.mockResolvedValue({
      id: 'existing',
      createdAt: new Date(),
    })

    const result = await addExpense(user, {
      groupId: 'g1',
      title: 'Dinner',
      amount: 30,
    })

    expect(result).toMatchObject({ created: false, expenseId: 'existing' })
    expect(api.createExpense).not.toHaveBeenCalled()
  })

  it('creates the duplicate anyway when explicitly allowed', async () => {
    grantAccess()
    prisma.expense.findFirst.mockResolvedValue({
      id: 'existing',
      createdAt: new Date(),
    })

    const result = await addExpense(user, {
      groupId: 'g1',
      title: 'Dinner',
      amount: 30,
      allowDuplicate: true,
    })

    expect(result).toMatchObject({ created: true })
    expect(api.createExpense).toHaveBeenCalled()
  })

  it('rejects a zero amount', async () => {
    grantAccess()
    await expect(
      addExpense(user, { groupId: 'g1', title: 'x', amount: 0 }),
    ).rejects.toThrow(/non-zero/)
  })

  it('rejects a malformed date', async () => {
    grantAccess()
    await expect(
      addExpense(user, {
        groupId: 'g1',
        title: 'x',
        amount: 5,
        date: '4 March',
      }),
    ).rejects.toThrow(/YYYY-MM-DD/)
  })
})
