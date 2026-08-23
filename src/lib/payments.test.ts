import {
  createExpense,
  createGroup,
  createPayments,
  getGroupExpenses,
  getGroupPayments,
} from './api'
import { prisma } from './prisma'

/**
 * These tests write to the database the suite is pointed at, which on a dev machine is the same one
 * the app uses. `api.test.ts` cleans up after every case for that reason; so does this.
 */
const createdGroupIds: string[] = []

async function makeGroup(name: string, participants: string[]) {
  const group = await createGroup({
    name,
    currency: '$',
    currencyCode: 'USD',
    participants: participants.map((p) => ({ name: p })),
  } as any)
  createdGroupIds.push(group.id)
  return group
}

afterEach(async () => {
  for (const groupId of createdGroupIds.splice(0)) {
    await prisma.expense.deleteMany({ where: { groupId } })
    await prisma.activity.deleteMany({ where: { groupId } })
    await prisma.participant.deleteMany({ where: { groupId } })
    await prisma.group.delete({ where: { id: groupId } })
  }
})

describe('createPayments', () => {
  it('records every payment or none of them', async () => {
    const group = await makeGroup('settle atomicity', ['Alice', 'Bob', 'Carol'])
    const [alice, bob, carol] = group.participants

    // A batch where the last entry names someone outside the group. If this were a loop of
    // independent writes, the first two would already be in the database.
    await expect(
      createPayments(group.id, [
        { from: bob.id, to: alice.id, amount: 1000, title: 'Bob to Alice' },
        { from: carol.id, to: alice.id, amount: 2000, title: 'Carol to Alice' },
        { from: 'not-a-participant', to: alice.id, amount: 500, title: 'bad' },
      ]),
    ).rejects.toThrow(/Invalid participant/)

    expect(await getGroupExpenses(group.id)).toHaveLength(0)

    // The same batch without the bad entry writes both.
    const ids = await createPayments(group.id, [
      { from: bob.id, to: alice.id, amount: 1000, title: 'Bob to Alice' },
      { from: carol.id, to: alice.id, amount: 2000, title: 'Carol to Alice' },
    ])
    expect(ids).toHaveLength(2)

    const expenses = await getGroupExpenses(group.id)
    expect(expenses).toHaveLength(2)
    expect(expenses.every((e) => e.isReimbursement)).toBe(true)
  })

  it('rolls back a write that fails part way through the batch', async () => {
    const group = await makeGroup('settle rollback', ['Alice', 'Bob'])
    const [alice, bob] = group.participants

    // The third amount overflows the column's 32-bit integer. Every participant is valid, so this
    // gets past the up-front checks and fails inside the transaction, after two rows are already
    // written — which is exactly the case the transaction exists for.
    await expect(
      createPayments(group.id, [
        { from: bob.id, to: alice.id, amount: 1000, title: 'one' },
        { from: bob.id, to: alice.id, amount: 2000, title: 'two' },
        { from: bob.id, to: alice.id, amount: 2 ** 31, title: 'overflow' },
      ]),
    ).rejects.toThrow()

    expect(await getGroupExpenses(group.id)).toHaveLength(0)
  })
})

describe('getGroupPayments', () => {
  it('returns the payments only, as a direction', async () => {
    const group = await makeGroup('payment list', ['Alice', 'Bob'])
    const [alice, bob] = group.participants

    // An ordinary expense must not show up here: the list exists precisely because a payment is
    // not one, even though it is stored as one.
    await createExpense(
      {
        title: 'Dinner',
        expenseDate: new Date('2026-08-01'),
        amount: 60,
        category: 1,
        paidBy: [{ participant: alice.id, amount: 60 }],
        paidFor: [
          { participant: alice.id, shares: 1 },
          { participant: bob.id, shares: 1 },
        ],
        splitMode: 'EVENLY',
        isReimbursement: false,
        saveDefaultSplittingOptions: false,
        recurrenceRule: 'NONE',
        documents: [],
        notes: '',
        items: [],
      } as any,
      group.id,
    )

    await createPayments(group.id, [
      { from: bob.id, to: alice.id, amount: 3000, title: 'Bob to Alice' },
    ])

    const payments = await getGroupPayments(group.id)
    expect(payments).toHaveLength(1)
    expect(payments[0]).toMatchObject({
      amount: 3000,
      from: bob.id,
      to: alice.id,
      isSimple: true,
    })
  })

  it('flags a reimbursement that does not read as one person paying another', async () => {
    // The expense form can still tick "this is a reimbursement" on an expense split between
    // several people. The row must not claim a direction about it.
    const group = await makeGroup('payment shape', ['Alice', 'Bob', 'Carol'])
    const [alice, bob, carol] = group.participants

    await createExpense(
      {
        title: 'Bob pays everyone back',
        expenseDate: new Date('2026-08-02'),
        amount: 40,
        category: 1,
        paidBy: [{ participant: bob.id, amount: 40 }],
        paidFor: [
          { participant: alice.id, shares: 1 },
          { participant: carol.id, shares: 1 },
        ],
        splitMode: 'EVENLY',
        isReimbursement: true,
        saveDefaultSplittingOptions: false,
        recurrenceRule: 'NONE',
        documents: [],
        notes: '',
        items: [],
      } as any,
      group.id,
    )

    const payments = await getGroupPayments(group.id)
    expect(payments).toHaveLength(1)
    expect(payments[0].isSimple).toBe(false)
    expect(payments[0].title).toBe('Bob pays everyone back')
  })

  it('honours the cap', async () => {
    const group = await makeGroup('payment cap', ['Alice', 'Bob'])
    const [alice, bob] = group.participants

    await createPayments(
      group.id,
      [1000, 2000, 3000].map((amount) => ({
        from: bob.id,
        to: alice.id,
        amount,
        title: `Bob to Alice ${amount}`,
      })),
    )

    expect(await getGroupPayments(group.id, { limit: 2 })).toHaveLength(2)
    expect(await getGroupPayments(group.id)).toHaveLength(3)
  })
})
