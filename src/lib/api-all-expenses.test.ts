import { PrismaClient } from '@prisma/client'
import {
  getAllGroupExpenses,
  getGroupExpenses,
  getGroupExpensesParticipants,
} from './api'

jest.mock('nanoid', () => ({
  nanoid: () => Math.random().toString(36).substring(2, 15),
}))

const prisma = new PrismaClient()
const id = () => Math.random().toString(36).substring(2, 15)

/** Keys sorted at every level, arrays kept in order — row order decides the spare cent. */
const canonical = (value: any): any =>
  Array.isArray(value)
    ? value.map(canonical)
    : value instanceof Date
    ? value.toISOString()
    : value &&
      typeof value === 'object' &&
      value.constructor?.name === 'Decimal'
    ? String(value)
    : value && typeof value === 'object'
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonical(value[key])]),
      )
    : value

describe('getAllGroupExpenses', () => {
  let groupId: string
  let people: string[]

  beforeEach(async () => {
    groupId = id()
    people = [id(), id(), id()]
    await prisma.group.create({
      data: {
        id: groupId,
        name: 'Loader',
        currency: '€',
        currencyCode: 'EUR',
        participants: {
          createMany: {
            data: people.map((pid, i) => ({ id: pid, name: `P${i}` })),
          },
        },
      },
    })
    const expense = (
      title: string,
      amount: number,
      splitMode: 'EVENLY' | 'BY_SHARES' | 'BY_AMOUNT' | 'BY_PERCENTAGE',
      payers: [number, number][],
      shares: [number, number][],
      extra: object = {},
    ) =>
      prisma.expense.create({
        data: {
          id: id(),
          groupId,
          title,
          amount,
          splitMode,
          expenseDate: new Date('2026-10-01'),
          categoryId: 5,
          paidBy: {
            createMany: {
              data: payers.map(([p, a]) => ({
                participantId: people[p],
                amount: a,
              })),
            },
          },
          paidFor: {
            createMany: {
              data: shares.map(([p, s]) => ({
                participantId: people[p],
                shares: s,
              })),
            },
          },
          ...extra,
        },
      })
    await expense(
      'Even, odd cent',
      1001,
      'EVENLY',
      [[0, 1001]],
      [
        [2, 100],
        [0, 100],
        [1, 100],
      ],
    )
    await expense(
      'Two payers',
      3000,
      'BY_SHARES',
      [
        [1, 2000],
        [2, 1000],
      ],
      [
        [0, 100],
        [1, 200],
      ],
    )
    await expense(
      'Exact',
      999,
      'BY_AMOUNT',
      [[2, 999]],
      [
        [0, 333],
        [1, 666],
      ],
    )
    await expense(
      'Percent',
      500,
      'BY_PERCENTAGE',
      [[0, 500]],
      [
        [1, 2500],
        [2, 7500],
      ],
    )
    await expense(
      'With a document',
      1200,
      'EVENLY',
      [[1, 1200]],
      [
        [0, 100],
        [1, 100],
      ],
      {
        isReimbursement: false,
        documents: {
          create: {
            id: id(),
            url: 'https://example.com/a.jpg',
            width: 1,
            height: 1,
          },
        },
      },
    )
  })

  afterEach(async () => {
    await prisma.expenseDocument.deleteMany({
      where: { Expense: { groupId } },
    })
    await prisma.group.delete({ where: { id: groupId } })
  })

  it('returns what getGroupExpenses returns, row order included', async () => {
    const [nested, flat] = await Promise.all([
      getGroupExpenses(groupId),
      getAllGroupExpenses(groupId),
    ])
    expect(flat).toHaveLength(5)
    expect(canonical(flat)).toEqual(canonical(nested))
  })

  it('counts documents and resolves categories and people', async () => {
    const flat = await getAllGroupExpenses(groupId)
    const withDoc = flat.find((e) => e.title === 'With a document')!
    expect(withDoc._count.documents).toBe(1)
    expect(withDoc.category?.id).toBe(5)
    expect(withDoc.paidBy[0].participant.name).toBe('P1')
  })

  it('returns nothing for an empty group', async () => {
    const emptyId = id()
    await prisma.group.create({
      data: { id: emptyId, name: 'Empty', currency: '€' },
    })
    expect(await getAllGroupExpenses(emptyId)).toEqual([])
    await prisma.group.delete({ where: { id: emptyId } })
  })

  it('names everyone who appears on an expense, once', async () => {
    const ids = await getGroupExpensesParticipants(groupId)
    expect([...ids].sort()).toEqual([...people].sort())
  })
})
