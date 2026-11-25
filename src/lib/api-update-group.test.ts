import { PrismaClient } from '@prisma/client'
import { createExpense, GroupUpdateError, updateGroup } from './api'
import { ExpenseFormValues, GroupFormValues } from './schemas'

jest.mock('nanoid', () => ({
  nanoid: () => Math.random().toString(36).substring(2, 15),
}))

const prisma = new PrismaClient()
const id = () => Math.random().toString(36).substring(2, 15)

/**
 * Saving the group settings rewrites the participant list: whoever the form leaves out is deleted,
 * and their paid-by and share rows go with them. A stale form, or one saved twice after adding
 * someone, must not be able to take an expense's people away.
 */
describe('updateGroup and participants with expenses', () => {
  let groupId: string
  let alice: string
  let bob: string
  let carol: string

  const groupValues = (
    participants: GroupFormValues['participants'],
  ): GroupFormValues =>
    ({
      name: 'Trip',
      currency: '$',
      currencyCode: 'USD',
      simplifyDebts: true,
      participants,
    }) as GroupFormValues

  beforeEach(async () => {
    groupId = id()
    alice = id()
    bob = id()
    carol = id()
    await prisma.group.create({
      data: {
        id: groupId,
        name: 'Trip',
        currency: '$',
        currencyCode: 'USD',
        participants: {
          create: [
            { id: alice, name: 'Alice' },
            { id: bob, name: 'Bob' },
            { id: carol, name: 'Carol' },
          ],
        },
      },
    })
    // Carol pays a hotel the three of them share.
    await createExpense(
      {
        expenseDate: new Date('2026-11-20'),
        title: 'Hotel',
        category: 0,
        amount: 90,
        paidBy: [{ participant: carol, amount: 90 }],
        paidFor: [
          { participant: alice, shares: 1 },
          { participant: bob, shares: 1 },
          { participant: carol, shares: 1 },
        ],
        splitMode: 'EVENLY',
        saveDefaultSplittingOptions: false,
        isReimbursement: false,
        documents: [],
        notes: '',
        recurrenceRule: 'NONE',
        items: [],
      } as unknown as ExpenseFormValues,
      groupId,
    )
  })

  afterEach(async () => {
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('refuses to remove someone who is in an expense, and changes nothing', async () => {
    const save = updateGroup(
      groupId,
      groupValues([
        { id: alice, name: 'Alice' },
        { id: bob, name: 'Bob Renamed' },
      ]),
    )
    await expect(save).rejects.toBeInstanceOf(GroupUpdateError)
    await expect(save).rejects.toMatchObject({
      reason: 'participantHasExpenses',
    })

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: { participants: true },
    })
    expect(group!.participants.map((p) => p.name).sort()).toEqual([
      'Alice',
      'Bob',
      'Carol',
    ])
    expect(
      await prisma.expensePaidBy.count({ where: { participantId: carol } }),
    ).toBe(1)
    expect(
      await prisma.activity.count({
        where: { groupId, activityType: 'UPDATE_GROUP' },
      }),
    ).toBe(0)
  })

  it('still removes someone with no expenses', async () => {
    const dan = id()
    await prisma.participant.create({
      data: { id: dan, name: 'Dan', groupId },
    })
    await updateGroup(
      groupId,
      groupValues([
        { id: alice, name: 'Alice' },
        { id: bob, name: 'Bob' },
        { id: carol, name: 'Carol' },
      ]),
    )
    expect(await prisma.participant.count({ where: { groupId } })).toBe(3)
    expect(
      await prisma.participant.findUnique({ where: { id: dan } }),
    ).toBeNull()
  })
})
