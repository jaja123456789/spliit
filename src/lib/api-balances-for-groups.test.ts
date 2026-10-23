import { PrismaClient } from '@prisma/client'
import { createExpense, getBalancesForGroups, getGroupExpenses } from './api'
import { getBalances } from './balances'
import { ExpenseFormValues } from './schemas'

jest.mock('nanoid', () => ({
  nanoid: () => Math.random().toString(36).substring(2, 15),
}))

const prisma = new PrismaClient()
const id = () => Math.random().toString(36).substring(2, 15)

/**
 * The groups home sums balances across groups without opening any of them. It has to agree with
 * what each group shows once opened, recurring expenses included: those are only written when they
 * come due, and only a read creates them.
 */
describe('getBalancesForGroups', () => {
  let groupIds: string[] = []

  const makeGroup = async () => {
    const groupId = id()
    const alice = id()
    const bob = id()
    await prisma.group.create({
      data: {
        id: groupId,
        name: 'Flat',
        currency: '€',
        currencyCode: 'EUR',
        participants: {
          createMany: {
            data: [
              { id: alice, name: 'Alice' },
              { id: bob, name: 'Bob' },
            ],
          },
        },
      },
    })
    groupIds.push(groupId)
    return { groupId, alice, bob }
  }

  const monthlyRent = (alice: string, bob: string, monthsAgo: number) => {
    // The 15th, so month lengths never decide how many occurrences are due.
    const expenseDate = new Date()
    expenseDate.setUTCDate(15)
    expenseDate.setUTCMonth(expenseDate.getUTCMonth() - monthsAgo)
    return {
      expenseDate,
      title: 'Rent',
      category: 0,
      amount: 1000,
      paidBy: [{ participant: alice, amount: 1000 }],
      paidFor: [
        { participant: alice, shares: 1 },
        { participant: bob, shares: 1 },
      ],
      splitMode: 'EVENLY',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      notes: '',
      recurrenceRule: 'MONTHLY',
      items: [],
    } as unknown as ExpenseFormValues
  }

  afterEach(async () => {
    await prisma.group.deleteMany({ where: { id: { in: groupIds } } })
    groupIds = []
  })

  it('counts recurring expenses that came due while nobody had the group open', async () => {
    const { groupId, alice, bob } = await makeGroup()
    // Months ago, so further occurrences are due and none of them exists yet.
    await createExpense(monthlyRent(alice, bob, 3), groupId, alice)
    expect(await prisma.expense.count({ where: { groupId } })).toBe(1)

    const [home] = await getBalancesForGroups([
      { groupId, participantId: alice },
    ])

    const occurrences = await prisma.expense.count({ where: { groupId } })
    expect(occurrences).toBeGreaterThanOrEqual(3)
    // The figure the group's own screens show, computed the way they compute it.
    const inside = getBalances(await getGroupExpenses(groupId))[alice].total
    expect(home.balance).toBe(inside)
    // Alice paid every month's €1,000 and owes half of each.
    expect(home.balance).toBe(occurrences * 500_00)
  })

  it('catches up every group asked for, in one lookup', async () => {
    const first = await makeGroup()
    const second = await makeGroup()
    await createExpense(
      monthlyRent(first.alice, first.bob, 1),
      first.groupId,
      first.alice,
    )
    await createExpense(
      monthlyRent(second.alice, second.bob, 2),
      second.groupId,
      second.alice,
    )

    const balances = await getBalancesForGroups([
      { groupId: first.groupId, participantId: first.bob },
      { groupId: second.groupId, participantId: second.bob },
    ])

    const count = (groupId: string) =>
      prisma.expense.count({ where: { groupId } })
    const [firstCount, secondCount] = [
      await count(first.groupId),
      await count(second.groupId),
    ]
    expect(secondCount).toBeGreaterThan(firstCount)
    expect(balances.map((b) => b.balance)).toEqual([
      -firstCount * 500_00,
      -secondCount * 500_00,
    ])
  })
})
