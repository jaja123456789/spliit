import { PrismaClient } from '@prisma/client'
import {
  createExpense,
  deleteExpense,
  getExpense,
  updateExpense,
  updateGroup,
} from './api'
import { ExpenseFormValues } from './schemas'

jest.mock('nanoid', () => ({
  nanoid: () => Math.random().toString(36).substring(2, 15),
}))

const prisma = new PrismaClient()
const id = () => Math.random().toString(36).substring(2, 15)

/**
 * The real `api.ts` functions against a real database: an expense is reachable only through its
 * own group, and a change and its activity line are written together or not at all.
 */
describe('expense changes', () => {
  let groupId: string
  let otherGroupId: string
  let alice: string
  let bob: string

  const values = (overrides: Partial<ExpenseFormValues> = {}) =>
    ({
      expenseDate: new Date('2026-10-23'),
      title: 'Dinner',
      category: 0,
      amount: 10,
      paidBy: [{ participant: alice, amount: 10 }],
      paidFor: [
        { participant: alice, shares: 1 },
        { participant: bob, shares: 1 },
      ],
      splitMode: 'EVENLY',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      notes: '',
      recurrenceRule: 'NONE',
      items: [],
      ...overrides,
    }) as unknown as ExpenseFormValues

  beforeEach(async () => {
    groupId = id()
    otherGroupId = id()
    alice = id()
    bob = id()
    await prisma.group.create({
      data: {
        id: groupId,
        name: 'Scope',
        currency: '$',
        currencyCode: 'USD',
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
    await prisma.group.create({
      data: {
        id: otherGroupId,
        name: 'Other',
        currency: '$',
        currencyCode: 'USD',
        participants: { create: { id: id(), name: 'Carol' } },
      },
    })
  })

  afterEach(async () => {
    await prisma.group.deleteMany({
      where: { id: { in: [groupId, otherGroupId] } },
    })
  })

  it('finds an expense only through its own group', async () => {
    const expense = await createExpense(values(), groupId, alice)
    expect(await getExpense(groupId, expense.id)).not.toBeNull()
    expect(await getExpense(otherGroupId, expense.id)).toBeNull()
  })

  it('will not delete an expense through another group', async () => {
    const expense = await createExpense(values(), groupId, alice)
    await expect(deleteExpense(otherGroupId, expense.id)).rejects.toThrow()
    expect(await prisma.expense.count({ where: { id: expense.id } })).toBe(1)
    expect(
      await prisma.activity.count({
        where: { groupId: otherGroupId },
      }),
    ).toBe(0)
  })

  it('will not update an expense through another group', async () => {
    const expense = await createExpense(values(), groupId, alice)
    await expect(
      updateExpense(otherGroupId, expense.id, values({ title: 'Changed' })),
    ).rejects.toThrow()
    expect(
      (await prisma.expense.findUnique({ where: { id: expense.id } }))?.title,
    ).toBe('Dinner')
  })

  it('logs nothing for an expense that failed to save', async () => {
    // No such category: the insert fails on its foreign key, after validation has passed.
    await expect(
      createExpense(values({ category: 987654 }), groupId, alice),
    ).rejects.toThrow()
    expect(await prisma.expense.count({ where: { groupId } })).toBe(0)
    expect(await prisma.activity.count({ where: { groupId } })).toBe(0)
  })

  it('logs nothing for an update that failed to save', async () => {
    const expense = await createExpense(values(), groupId, alice)
    await expect(
      updateExpense(groupId, expense.id, values({ category: 987654 })),
    ).rejects.toThrow()
    expect(
      await prisma.activity.count({
        where: { groupId, activityType: 'UPDATE_EXPENSE' },
      }),
    ).toBe(0)
  })

  it('logs each successful change once', async () => {
    const expense = await createExpense(values(), groupId, alice)
    await updateExpense(groupId, expense.id, values({ title: 'Supper' }), bob)
    await deleteExpense(groupId, expense.id, alice)
    const activities = await prisma.activity.findMany({
      where: { groupId },
      orderBy: { time: 'asc' },
    })
    expect(activities.map((a) => a.activityType)).toEqual([
      'CREATE_EXPENSE',
      'UPDATE_EXPENSE',
      'DELETE_EXPENSE',
    ])
  })

  it('logs a group change in the same transaction as the change', async () => {
    await expect(
      updateGroup(groupId, {
        name: 'Renamed',
        currency: '$',
        currencyCode: 'USD',
        simplifyDebts: true,
        // A participant id that is not in this group: the nested update fails.
        participants: [{ id: 'not-a-participant', name: 'Ghost' }],
      } as any),
    ).rejects.toThrow()
    expect(
      await prisma.activity.count({
        where: { groupId, activityType: 'UPDATE_GROUP' },
      }),
    ).toBe(0)
  })
})
