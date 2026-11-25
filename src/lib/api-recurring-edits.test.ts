import { PrismaClient } from '@prisma/client'
import { createExpense, createRecurringExpenses, updateExpense } from './api'
import { expenseFormSchema } from './schemas'

jest.mock('nanoid', () => ({
  nanoid: () => Math.random().toString(36).substring(2, 15),
}))

const prisma = new PrismaClient()
const id = () => Math.random().toString(36).substring(2, 15)
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

/**
 * A recurring expense's next occurrence is one period after it, until that occurrence exists. Editing
 * the date or the rule has to move it; catching up has to repeat the expense as it is, lines
 * included.
 */
describe('recurring expenses after an edit', () => {
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
        name: 'Recurring',
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

  const values = (overrides: Record<string, unknown>) =>
    expenseFormSchema.parse({
      expenseDate: day('2099-01-15'),
      title: 'Rent',
      category: 0,
      paidBy: [{ participant: a, amount: '100' }],
      paidFor: [
        { participant: a, shares: '1' },
        { participant: b, shares: '1' },
      ],
      splitMode: 'EVENLY',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      notes: '',
      recurrenceRule: 'MONTHLY',
      items: [],
      ...overrides,
    })

  const nextDate = async (expenseId: string) =>
    (
      await prisma.recurringExpenseLink.findFirstOrThrow({
        where: { currentFrameExpenseId: expenseId },
      })
    ).nextExpenseDate

  it('a new date moves the next occurrence', async () => {
    const expense = await createExpense(values({}), groupId)
    expect(await nextDate(expense.id)).toEqual(day('2099-02-15'))

    await updateExpense(
      groupId,
      expense.id,
      values({ expenseDate: day('2099-01-20') }),
    )
    expect(await nextDate(expense.id)).toEqual(day('2099-02-20'))
  })

  it('a new rule counts from the new date', async () => {
    const expense = await createExpense(values({}), groupId)
    await updateExpense(
      groupId,
      expense.id,
      values({ expenseDate: day('2099-03-01'), recurrenceRule: 'WEEKLY' }),
    )
    expect(await nextDate(expense.id)).toEqual(day('2099-03-08'))
  })

  it('stopping the recurrence still removes the schedule', async () => {
    const expense = await createExpense(values({}), groupId)
    await updateExpense(groupId, expense.id, values({ recurrenceRule: 'NONE' }))
    expect(
      await prisma.recurringExpenseLink.count({
        where: { currentFrameExpenseId: expense.id },
      }),
    ).toBe(0)
  })

  it('an itemised expense recurs with its lines', async () => {
    const started = new Date()
    started.setUTCMonth(started.getUTCMonth() - 2)
    started.setUTCHours(0, 0, 0, 0)
    await createExpense(
      values({
        expenseDate: started,
        paidFor: [{ participant: a, shares: '1' }],
        items: [
          { name: 'Internet', price: '40', participantIds: [a, b] },
          { name: 'Phone', price: '60', participantIds: [b] },
        ],
      }),
      groupId,
    )
    await createRecurringExpenses(groupId)

    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: { items: true, paidFor: true },
      orderBy: { expenseDate: 'asc' },
    })
    expect(expenses.length).toBeGreaterThanOrEqual(3)
    for (const expense of expenses) {
      expect(
        expense.items.map((i) => [i.name, i.price, i.participantIds]).sort(),
      ).toEqual([
        ['Internet', 4000, [a, b]],
        ['Phone', 6000, [b]],
      ])
    }
  })
})
