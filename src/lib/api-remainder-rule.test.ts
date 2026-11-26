import { PrismaClient } from '@prisma/client'
import {
  createExpense,
  createRecurringExpenses,
  deleteExpense,
  restoreExpense,
} from './api'
import { expenseFormSchema } from './schemas'

jest.mock('nanoid', () => ({
  nanoid: () => Math.random().toString(36).substring(2, 15),
}))

const prisma = new PrismaClient()
const id = () => Math.random().toString(36).substring(2, 15)

/**
 * The fairer spare-cent rule is for expenses made from now on. Everything that already exists keeps
 * the rule it was split with, so no balance moves when this is deployed.
 */
describe('which spare-cent rule an expense is stored with', () => {
  let groupId: string
  let a: string
  let b: string

  beforeEach(async () => {
    groupId = id()
    a = id()
    b = id()
    await prisma.group.create({
      data: {
        id: groupId,
        name: 'Rules',
        currency: '€',
        currencyCode: 'EUR',
        participants: {
          create: [
            { id: a, name: 'A' },
            { id: b, name: 'B' },
          ],
        },
      },
    })
  })

  afterEach(async () => {
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  const values = (overrides: Record<string, unknown> = {}) =>
    expenseFormSchema.parse({
      expenseDate: new Date('2026-11-26'),
      title: 'Pizza',
      category: 0,
      paidBy: [{ participant: a, amount: '10.01' }],
      paidFor: [
        { participant: a, shares: '1' },
        { participant: b, shares: '1' },
      ],
      splitMode: 'EVENLY',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      notes: '',
      recurrenceRule: 'NONE',
      items: [],
      ...overrides,
    })

  const ruleOf = async (expenseId: string) =>
    (await prisma.expense.findUniqueOrThrow({ where: { id: expenseId } }))
      .remainderRule

  it('an expense from before the column keeps rule 1', async () => {
    const old = await prisma.expense.create({
      data: {
        id: id(),
        groupId,
        title: 'Old',
        amount: 1001,
        expenseDate: new Date('2026-01-01'),
        splitMode: 'EVENLY',
      },
    })
    expect(old.remainderRule).toBe(1)
  })

  it('a new expense takes rule 2', async () => {
    const expense = await createExpense(values(), groupId)
    expect(await ruleOf(expense.id)).toBe(2)
  })

  it('a restored expense keeps the rule it had', async () => {
    const old = await prisma.expense.create({
      data: {
        id: id(),
        groupId,
        title: 'Old',
        amount: 1001,
        expenseDate: new Date('2026-01-01'),
        splitMode: 'EVENLY',
        paidBy: { create: [{ participantId: a, amount: 1001 }] },
        paidFor: {
          create: [
            { participantId: a, shares: 100 },
            { participantId: b, shares: 100 },
          ],
        },
      },
    })
    const { activityId } = await deleteExpense(groupId, old.id)
    await restoreExpense(groupId, activityId)
    expect(await ruleOf(old.id)).toBe(1)
  })

  it('a recurring occurrence is a new expense, with rule 2', async () => {
    const start = new Date()
    start.setUTCMonth(start.getUTCMonth() - 1)
    start.setUTCHours(0, 0, 0, 0)
    const first = await createExpense(
      values({ expenseDate: start, recurrenceRule: 'MONTHLY' }),
      groupId,
    )
    // As if made before the column: its occurrences are still new expenses.
    await prisma.expense.update({
      where: { id: first.id },
      data: { remainderRule: 1 },
    })
    await createRecurringExpenses(groupId)
    const occurrences = await prisma.expense.findMany({
      where: { groupId, id: { not: first.id } },
    })
    expect(occurrences.length).toBeGreaterThan(0)
    for (const o of occurrences) expect(o.remainderRule).toBe(2)
  })
})
