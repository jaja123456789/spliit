import { PrismaClient } from '@prisma/client'
import {
  RestoreExpenseError,
  createExpense,
  deleteExpense,
  getExpense,
  restoreExpense,
} from './api'
import { ExpenseFormValues } from './schemas'

jest.mock('nanoid', () => ({
  nanoid: () => Math.random().toString(36).substring(2, 15),
}))

const prisma = new PrismaClient()
const id = () => Math.random().toString(36).substring(2, 15)

/**
 * Deleting an expense keeps a copy in the activity entry, and restoring puts back exactly what was
 * there: same id, same history, same shares.
 */
describe('undoing a deletion', () => {
  let groupId: string
  let alice: string
  let bob: string
  let carol: string

  const values = (overrides: Partial<ExpenseFormValues> = {}) =>
    ({
      expenseDate: new Date('2026-10-23'),
      title: 'Dinner',
      category: 8,
      amount: 90,
      paidBy: [
        { participant: alice, amount: 60 },
        { participant: bob, amount: 30 },
      ],
      paidFor: [
        { participant: alice, shares: 1 },
        { participant: bob, shares: 1 },
        { participant: carol, shares: 2 },
      ],
      splitMode: 'BY_SHARES',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [
        { id: 'x', url: 'https://example.test/r.jpg', width: 10, height: 20 },
      ],
      notes: 'with dessert',
      recurrenceRule: 'NONE',
      items: [
        { id: 'a', name: 'Pasta', price: 50, participantIds: [alice, bob] },
        { id: 'b', name: 'Wine', price: 40, participantIds: [carol] },
      ],
      ...overrides,
    }) as unknown as ExpenseFormValues

  /** What an expense is, minus the order rows happen to come back in. */
  const shape = (expense: Awaited<ReturnType<typeof getExpense>>) => {
    if (!expense) return null
    const { category, recurringExpenseLink, ...rest } = expense
    return {
      ...rest,
      conversionRate: rest.conversionRate?.toString() ?? null,
      paidBy: [...rest.paidBy].sort((a, b) =>
        a.participantId.localeCompare(b.participantId),
      ),
      paidFor: [...rest.paidFor].sort((a, b) =>
        a.participantId.localeCompare(b.participantId),
      ),
      items: [...rest.items].sort((a, b) => a.id.localeCompare(b.id)),
      documents: [...rest.documents].sort((a, b) => a.id.localeCompare(b.id)),
      recurringExpenseLink: recurringExpenseLink && {
        ...recurringExpenseLink,
      },
    }
  }

  beforeEach(async () => {
    groupId = id()
    alice = id()
    bob = id()
    carol = id()
    await prisma.group.create({
      data: {
        id: groupId,
        name: 'Undo',
        currency: '$',
        currencyCode: 'USD',
        participants: {
          createMany: {
            data: [
              { id: alice, name: 'Alice' },
              { id: bob, name: 'Bob' },
              { id: carol, name: 'Carol' },
            ],
          },
        },
      },
    })
  })

  afterAll(() => prisma.$disconnect())

  it('puts back exactly what was deleted', async () => {
    const { id: expenseId } = await createExpense(values(), groupId, alice)
    const before = shape(await getExpense(groupId, expenseId))

    const { activityId } = await deleteExpense(groupId, expenseId, bob)
    expect(await getExpense(groupId, expenseId)).toBeNull()

    expect(await restoreExpense(groupId, activityId, bob)).toEqual({
      expenseId,
    })
    expect(shape(await getExpense(groupId, expenseId))).toEqual(before)
  })

  it('brings a recurring expense back with its schedule', async () => {
    const { id: expenseId } = await createExpense(
      values({
        recurrenceRule: 'MONTHLY',
        expenseDate: new Date('2099-01-15'),
      }),
      groupId,
    )
    const before = shape(await getExpense(groupId, expenseId))
    expect(before?.recurringExpenseLink).not.toBeNull()

    const { activityId } = await deleteExpense(groupId, expenseId)
    expect(
      await prisma.recurringExpenseLink.count({
        where: { currentFrameExpenseId: expenseId },
      }),
    ).toBe(0)

    await restoreExpense(groupId, activityId)
    expect(shape(await getExpense(groupId, expenseId))).toEqual(before)
  })

  it('records the restore, and a second one changes nothing', async () => {
    const { id: expenseId } = await createExpense(values(), groupId)
    const { activityId } = await deleteExpense(groupId, expenseId)

    await restoreExpense(groupId, activityId, carol)
    await restoreExpense(groupId, activityId, carol)

    const created = await prisma.activity.findMany({
      where: { groupId, expenseId, activityType: 'CREATE_EXPENSE' },
      orderBy: { time: 'asc' },
    })
    expect(created).toHaveLength(2) // the original creation, and one restore
    expect(JSON.parse(created[1].data!)).toMatchObject({
      title: 'Dinner',
      restored: true,
    })
    expect(created[1].participantId).toBe(carol)
    expect(await prisma.expense.count({ where: { id: expenseId } })).toBe(1)
  })

  it('refuses once someone on the expense has left the group', async () => {
    const { id: expenseId } = await createExpense(values(), groupId)
    const { activityId } = await deleteExpense(groupId, expenseId)
    await prisma.participant.delete({ where: { id: carol } })

    await expect(restoreExpense(groupId, activityId)).rejects.toEqual(
      new RestoreExpenseError('participantGone'),
    )
    expect(await getExpense(groupId, expenseId)).toBeNull()
  })

  it('cannot restore a deletion recorded before copies were kept', async () => {
    const activity = await prisma.activity.create({
      data: {
        id: id(),
        groupId,
        activityType: 'DELETE_EXPENSE',
        expenseId: id(),
        data: 'An old title',
      },
    })
    await expect(restoreExpense(groupId, activity.id)).rejects.toEqual(
      new RestoreExpenseError('noSnapshot'),
    )
  })

  it('only restores within its own group', async () => {
    const { id: expenseId } = await createExpense(values(), groupId)
    const { activityId } = await deleteExpense(groupId, expenseId)
    await expect(restoreExpense(id(), activityId)).rejects.toEqual(
      new RestoreExpenseError('notFound'),
    )
  })
})
