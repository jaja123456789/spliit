import { PrismaClient } from '@prisma/client'
import { createExpense, updateExpense } from './api'
import { expenseFormSchema } from './schemas'

jest.mock('nanoid', () => ({
  nanoid: () => Math.random().toString(36).substring(2, 15),
}))

const prisma = new PrismaClient()
const id = () => Math.random().toString(36).substring(2, 15)

/**
 * What is stored has to add up: the payers to the amount, the shares to the amount, the lines to
 * the amount. Each of these used to be a cent (or the whole income) off, through the same path the
 * expense form takes — the schema, then `createExpense`.
 */
describe('stored figures add up to the amount', () => {
  let groupId: string
  let a: string
  let b: string
  let c: string

  beforeEach(async () => {
    groupId = id()
    a = id()
    b = id()
    c = id()
    await prisma.group.create({
      data: {
        id: groupId,
        name: 'Sums',
        currency: '€',
        currencyCode: 'EUR',
        participants: {
          create: [
            { id: a, name: 'A' },
            { id: b, name: 'B' },
            { id: c, name: 'C' },
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

  const base = {
    expenseDate: new Date('2026-11-26'),
    title: 'Dinner',
    category: 0,
    splitMode: 'EVENLY',
    saveDefaultSplittingOptions: false,
    isReimbursement: false,
    documents: [],
    notes: '',
    recurrenceRule: 'NONE',
  }

  async function storedSums(expenseId: string) {
    const expense = await prisma.expense.findUniqueOrThrow({
      where: { id: expenseId },
      include: { paidBy: true, paidFor: true, items: true },
    })
    const sum = (values: number[]) => values.reduce((s, v) => s + v, 0)
    return {
      amount: expense.amount,
      paidBy: sum(expense.paidBy.map((p) => p.amount)),
      paidFor: sum(expense.paidFor.map((p) => p.shares)),
      items: sum(expense.items.map((i) => i.price)),
    }
  }

  it('an itemised bill with a personal line and two payers', async () => {
    const values = expenseFormSchema.parse({
      ...base,
      paidBy: [
        { participant: a, amount: '15.15' },
        { participant: b, amount: '15.15' },
      ],
      paidFor: [{ participant: a, shares: '1' }],
      items: [
        { name: 'Shared', price: '15.15', participantIds: [a, b, c] },
        { name: 'Mine', price: '15.15', participantIds: [] },
      ],
    })
    const expense = await createExpense(values, groupId)
    expect(await storedSums(expense.id)).toEqual({
      amount: 1515,
      paidBy: 1515,
      paidFor: 1515,
      items: 1515,
    })
  })

  it('an itemised income keeps its payer', async () => {
    const values = expenseFormSchema.parse({
      ...base,
      paidBy: [{ participant: a, amount: '-30' }],
      paidFor: [{ participant: a, shares: '1' }],
      items: [{ name: 'Refund', price: '-30', participantIds: [a, b] }],
    })
    const expense = await createExpense(values, groupId)
    expect(await storedSums(expense.id)).toEqual({
      amount: -3000,
      paidBy: -3000,
      paidFor: -3000,
      items: -3000,
    })
  })

  it('an update stores the same exact figures', async () => {
    const first = await createExpense(
      expenseFormSchema.parse({
        ...base,
        paidBy: [{ participant: a, amount: '10' }],
        paidFor: [{ participant: a, shares: '1' }],
      }),
      groupId,
    )
    await updateExpense(
      groupId,
      first.id,
      expenseFormSchema.parse({
        ...base,
        paidBy: [
          { participant: a, amount: '10.005' },
          { participant: b, amount: '10.005' },
        ],
        paidFor: [{ participant: a, shares: '1' }],
        items: [{ name: 'Bill', price: '20.01', participantIds: [a, b, c] }],
      }),
    )
    expect(await storedSums(first.id)).toEqual({
      amount: 2001,
      paidBy: 2001,
      paidFor: 2001,
      items: 2001,
    })
  })
})
