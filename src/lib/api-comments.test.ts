import { PrismaClient } from '@prisma/client'
import {
  CommentError,
  createExpense,
  createExpenseComment,
  deleteExpense,
  deleteExpenseComment,
  getExpenseComments,
  getGroupExpenses,
  restoreExpense,
} from './api'
import { ExpenseFormValues } from './schemas'

jest.mock('nanoid', () => ({
  nanoid: () => Math.random().toString(36).substring(2, 15),
}))

const prisma = new PrismaClient()
const id = () => Math.random().toString(36).substring(2, 15)

describe('comments on an expense', () => {
  let groupId: string
  let alice: string
  let bob: string
  let expenseId: string

  const values = () =>
    ({
      expenseDate: new Date('2026-10-23'),
      title: 'Dinner',
      category: 0,
      amount: 40,
      paidBy: [{ participant: alice, amount: 40 }],
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
    }) as unknown as ExpenseFormValues

  beforeEach(async () => {
    groupId = id()
    alice = id()
    bob = id()
    await prisma.group.create({
      data: {
        id: groupId,
        name: 'Talk',
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
    ;({ id: expenseId } = await createExpense(values(), groupId, alice))
  })

  afterAll(() => prisma.$disconnect())

  it('keeps them in order, says so in the activity feed, and counts them on the row', async () => {
    await createExpenseComment(
      groupId,
      expenseId,
      'Was this the whole bill?',
      bob,
    )
    await createExpenseComment(groupId, expenseId, 'Yes, tip included.', alice)

    const comments = await getExpenseComments(groupId, expenseId)
    expect(comments.map((c) => [c.text, c.participantId])).toEqual([
      ['Was this the whole bill?', bob],
      ['Yes, tip included.', alice],
    ])

    const activity = await prisma.activity.findFirst({
      where: { groupId, activityType: 'COMMENT_EXPENSE', participantId: bob },
    })
    expect(JSON.parse(activity!.data!)).toMatchObject({
      title: 'Dinner',
      comment: 'Was this the whole bill?',
    })

    const [row] = await getGroupExpenses(groupId)
    expect(row._count).toEqual({ documents: 0, comments: 2 })
  })

  it('stays within its group', async () => {
    const other = id()
    await prisma.group.create({
      data: { id: other, name: 'Other', currency: '$', currencyCode: 'USD' },
    })
    await expect(
      createExpenseComment(other, expenseId, 'Not mine', undefined),
    ).rejects.toEqual(new CommentError('expenseNotFound'))
    await expect(
      createExpenseComment(groupId, expenseId, 'Who?', id()),
    ).rejects.toEqual(new CommentError('invalidParticipant'))

    const comment = await createExpenseComment(groupId, expenseId, 'Mine', bob)
    expect(await getExpenseComments(other, expenseId)).toEqual([])
    expect(await deleteExpenseComment(other, comment.id)).toEqual({
      deleted: false,
    })
    expect(await deleteExpenseComment(groupId, comment.id)).toEqual({
      deleted: true,
    })
    expect(await getExpenseComments(groupId, expenseId)).toEqual([])
  })

  it('come back with the expense when its deletion is undone', async () => {
    const first = await createExpenseComment(groupId, expenseId, 'First', bob)
    await createExpenseComment(groupId, expenseId, 'Second', alice)

    const { activityId } = await deleteExpense(groupId, expenseId)
    expect(await prisma.expenseComment.count({ where: { expenseId } })).toBe(0)
    await restoreExpense(groupId, activityId)

    const restored = await getExpenseComments(groupId, expenseId)
    expect(restored.map((c) => [c.id, c.text, c.participantId])).toEqual([
      [first.id, 'First', bob],
      [expect.any(String), 'Second', alice],
    ])
    expect(restored[0].createdAt).toEqual(first.createdAt)
  })
})
