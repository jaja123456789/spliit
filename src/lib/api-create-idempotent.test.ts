import { PrismaClient } from '@prisma/client'
import { createExpense } from './api'
import { ExpenseFormValues } from './schemas'

jest.mock('nanoid', () => ({
  nanoid: () => Math.random().toString(36).substring(2, 15),
}))

const prisma = new PrismaClient()
const id = () => Math.random().toString(36).substring(2, 15)

/**
 * An expense added offline is retried until the server's answer gets back, so creating it must be
 * safe to repeat: the client chooses its id, and the same id makes one expense.
 */
describe('creating an expense with an id the client chose', () => {
  let groupId: string
  let alice: string

  const values = () =>
    ({
      expenseDate: new Date('2026-10-23'),
      title: 'Offline dinner',
      category: 0,
      amount: 20,
      paidBy: [{ participant: alice, amount: 20 }],
      paidFor: [{ participant: alice, shares: 1 }],
      splitMode: 'EVENLY',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      notes: '',
      recurrenceRule: 'NONE',
      items: [],
    }) as unknown as ExpenseFormValues

  const group = async () => {
    const groupId = id()
    const participantId = id()
    await prisma.group.create({
      data: {
        id: groupId,
        name: 'Outbox',
        currency: '$',
        currencyCode: 'USD',
        participants: { create: { id: participantId, name: 'Alice' } },
      },
    })
    return { groupId, participantId }
  }

  beforeEach(async () => {
    ;({ groupId, participantId: alice } = await group())
  })

  afterAll(() => prisma.$disconnect())

  const counts = async (expenseId: string) => ({
    expenses: await prisma.expense.count({ where: { id: expenseId } }),
    activities: await prisma.activity.count({
      where: { expenseId, activityType: 'CREATE_EXPENSE' },
    }),
  })

  it('creates it under that id, once, however often it is sent', async () => {
    const expenseId = `outbox-${id()}`
    const first = await createExpense(values(), groupId, alice, { expenseId })
    const again = await createExpense(values(), groupId, alice, { expenseId })

    expect(first.id).toBe(expenseId)
    expect(again.id).toBe(expenseId)
    expect(await counts(expenseId)).toEqual({ expenses: 1, activities: 1 })
  })

  it('creates it once when two copies arrive together', async () => {
    const expenseId = `outbox-${id()}`
    const results = await Promise.all([
      createExpense(values(), groupId, alice, { expenseId }),
      createExpense(values(), groupId, alice, { expenseId }),
    ])
    expect(results.map((expense) => expense.id)).toEqual([expenseId, expenseId])
    expect(await counts(expenseId)).toEqual({ expenses: 1, activities: 1 })
  })

  it('refuses an id another group already has', async () => {
    const expenseId = `outbox-${id()}`
    await createExpense(values(), groupId, alice, { expenseId })
    const other = await group()
    const otherValues = values()
    otherValues.paidBy = [{ participant: other.participantId, amount: 20 }]
    otherValues.paidFor = [{ participant: other.participantId, shares: 1 }]

    await expect(
      createExpense(otherValues, other.groupId, undefined, { expenseId }),
    ).rejects.toThrow('already in use')
    expect(
      await prisma.expense.findUnique({ where: { id: expenseId } }),
    ).toMatchObject({ groupId })
  })
})
