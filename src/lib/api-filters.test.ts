import { PrismaClient } from '@prisma/client'
import {
  getAllGroupExpenses,
  getGroupExpenseFacets,
  getGroupExpenses,
} from './api'
import { ExpenseFilters } from './expense-filters'

jest.mock('nanoid', () => ({
  nanoid: () => Math.random().toString(36).substring(2, 15),
}))

const prisma = new PrismaClient()
const id = () => Math.random().toString(36).substring(2, 15)

describe('narrowing a group’s expenses', () => {
  let groupId: string
  let alice: string
  let bob: string

  const expense = (
    title: string,
    amount: number,
    {
      payer = alice,
      date = '2026-10-01',
      categoryId = 0,
      notes,
      originalAmount,
    }: {
      payer?: string
      date?: string
      categoryId?: number
      notes?: string
      originalAmount?: number
    } = {},
  ) =>
    prisma.expense.create({
      data: {
        id: id(),
        groupId,
        title,
        amount,
        notes,
        originalAmount,
        originalCurrency: originalAmount ? 'USD' : undefined,
        expenseDate: new Date(date),
        categoryId,
        paidBy: { create: { participantId: payer, amount } },
        paidFor: {
          createMany: {
            data: [alice, bob].map((participantId) => ({
              participantId,
              shares: 1,
            })),
          },
        },
      },
    })

  beforeEach(async () => {
    groupId = id()
    alice = id()
    bob = id()
    await prisma.group.create({
      data: {
        id: groupId,
        name: 'Filters',
        currency: '€',
        currencyCode: 'EUR',
        participants: {
          createMany: {
            data: [
              { id: alice, name: 'Alice Martin' },
              { id: bob, name: 'Bob' },
            ],
          },
        },
      },
    })
  })

  afterAll(() => prisma.$disconnect())

  const titles = async (filters: ExpenseFilters) =>
    (await getGroupExpenses(groupId, { filters }))
      .map((expense) => expense.title)
      .sort()

  it('matches the title anywhere, and every word has to match', async () => {
    await expense('Lidl', 4520)
    await expense('Lidl', 1200)
    await expense('Breakfast', 800)

    expect(await titles({ search: 'fast' })).toEqual(['Breakfast'])
    expect(await titles({ search: 'lidl 45' })).toEqual(['Lidl'])
    expect(await titles({ search: 'lidl' })).toEqual(['Lidl', 'Lidl'])
  })

  it('matches notes, category and payer', async () => {
    await expense('Shop', 1000, { notes: 'Birthday candles' })
    await expense('Bus', 300, { categoryId: 29 }) // Transportation / Bus/Train
    await expense('Cinema', 2400, { payer: bob })

    expect(await titles({ search: 'candles' })).toEqual(['Shop'])
    expect(await titles({ search: 'train' })).toEqual(['Bus'])
    expect(await titles({ search: 'transport' })).toEqual(['Bus'])
    expect(await titles({ search: 'bob' })).toEqual(['Cinema'])
    // From the start of a word in a name, not from inside one.
    expect(await titles({ search: 'martin' })).toEqual(['Bus', 'Shop'])
    expect(await titles({ search: 'artin' })).toEqual([])
  })

  it('does not answer a fragment with every uncategorised expense', async () => {
    // "General" contains "al"; a category matches from the start of a word only.
    await expense('Rent', 50000, { payer: bob })
    expect(await titles({ search: 'al' })).toEqual([])
    expect(await titles({ search: 'gen' })).toEqual(['Rent'])
  })

  it('reads a number as an amount, either sign, original amount too', async () => {
    await expense('Shop', 4520)
    await expense('Refund', -4599)
    await expense('Abroad', 3890, { originalAmount: 4500 })
    await expense('Other', 4600)

    expect(await titles({ search: '45' })).toEqual(['Abroad', 'Refund', 'Shop'])
    expect(await titles({ search: '45.20' })).toEqual(['Shop'])
    expect(await titles({ search: '45,99' })).toEqual(['Refund'])
  })

  it('keeps to the month, at both ends', async () => {
    await expense('Last of August', 100, { date: '2026-08-31' })
    await expense('First of September', 100, { date: '2026-09-01' })
    await expense('Last of September', 100, { date: '2026-09-30' })
    await expense('First of October', 100, { date: '2026-10-01' })

    expect(await titles({ month: '2026-09' })).toEqual([
      'First of September',
      'Last of September',
    ])
  })

  it('narrows by payer and category, combined with the rest', async () => {
    await expense('Groceries', 3000, { categoryId: 9 })
    await expense('Groceries', 2000, { categoryId: 9, payer: bob })
    await expense('Groceries', 1000, { categoryId: 9, date: '2026-09-15' })
    await expense('Pizza', 2500, { categoryId: 8 })

    expect(await titles({ paidBy: bob })).toEqual(['Groceries'])
    expect(await titles({ categoryId: 9 })).toHaveLength(3)
    expect(
      await titles({ categoryId: 9, paidBy: alice, month: '2026-10' }),
    ).toEqual(['Groceries'])
  })

  it('gives the summary the same rows as the list', async () => {
    await expense('Lidl', 4520)
    await expense('Lidl', 1200, { payer: bob })
    await expense('Aldi', 4500)

    for (const filters of [
      { search: 'lidl' },
      { search: '45' },
      { paidBy: bob },
      {},
    ]) {
      const list = await getGroupExpenses(groupId, { filters })
      const all = await getAllGroupExpenses(groupId, filters)
      expect(all.map((e) => e.id).sort()).toEqual(list.map((e) => e.id).sort())
    }
  })

  it('offers the months and categories in use, with counts', async () => {
    await expense('A', 100, { date: '2026-10-01', categoryId: 9 })
    await expense('B', 100, { date: '2026-10-20', categoryId: 9 })
    await expense('C', 100, { date: '2026-09-30' })
    await expense('D', 100, { date: '2025-12-31' })

    expect(await getGroupExpenseFacets(groupId)).toEqual({
      months: [
        { month: '2026-10', count: 2 },
        { month: '2026-09', count: 1 },
        { month: '2025-12', count: 1 },
      ],
      // Most used first; a tie goes by id so the menu does not reshuffle between visits.
      categories: [
        { id: 0, count: 2 },
        { id: 9, count: 2 },
      ],
    })
  })
})
