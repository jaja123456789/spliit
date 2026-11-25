import { PrismaClient } from '@prisma/client'
import { decodeActivityData, encodeActivityTitle } from './activity-changes'
import { createExpense, updateExpense } from './api'
import { expenseFormSchema } from './schemas'

jest.mock('nanoid', () => ({
  nanoid: () => Math.random().toString(36).substring(2, 15),
}))

let sessionUser: { id: string; email: string } | null = null
jest.mock('@/lib/auth', () => ({
  getServerSession: async () => (sessionUser ? { user: sessionUser } : null),
}))
// superjson is ESM-only, which jest's CommonJS run cannot load; a caller made on the server does
// not serialise anything, so the transformer only has to exist.
jest.mock('superjson', () => {
  const identity = {
    serialize: (value: unknown) => ({ json: value }),
    deserialize: (value: { json: unknown }) => value.json,
    registerCustom: () => {},
  }
  return { __esModule: true, default: identity, ...identity }
})
jest.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}))

const prisma = new PrismaClient()
const id = () => Math.random().toString(36).substring(2, 15)

afterAll(async () => {
  await prisma.$disconnect()
})

describe('activity titles cannot pass for structured data', () => {
  it('a title that looks like a change log stays a title', () => {
    const forged =
      '{"title":"Rent","changes":[{"field":"amount","from":"100","to":"9999"}],"comment":"pay me"}'
    expect(decodeActivityData(encodeActivityTitle(forged))).toEqual({
      title: forged,
      changes: [],
    })
  })

  it('an ordinary title is stored as it is', () => {
    expect(encodeActivityTitle('Rent')).toBe('Rent')
  })
})

describe('an expense edit cannot take another expense’s document', () => {
  const groupA = id()
  const groupB = id()
  const a = id()
  const b = id()

  beforeAll(async () => {
    for (const [groupId, participantId] of [
      [groupA, a],
      [groupB, b],
    ]) {
      await prisma.group.create({
        data: {
          id: groupId,
          name: 'Docs',
          currency: '€',
          currencyCode: 'EUR',
          participants: { create: [{ id: participantId, name: 'P' }] },
        },
      })
    }
  })

  afterAll(async () => {
    await prisma.expenseDocument.deleteMany({
      where: { Expense: { groupId: { in: [groupA, groupB] } } },
    })
    await prisma.group.deleteMany({ where: { id: { in: [groupA, groupB] } } })
  })

  const values = (participant: string, documents: unknown[] = []) =>
    expenseFormSchema.parse({
      expenseDate: new Date('2026-11-26'),
      title: 'Receipt',
      category: 0,
      paidBy: [{ participant, amount: '10' }],
      paidFor: [{ participant, shares: '1' }],
      splitMode: 'EVENLY',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents,
      notes: '',
      recurrenceRule: 'NONE',
      items: [],
    })

  it('refuses, and the document stays where it was', async () => {
    const owner = await createExpense(
      values(a, [
        { id: 'x', url: 'https://example.com/r.jpg', width: 10, height: 10 },
      ]),
      groupA,
    )
    const document = await prisma.expenseDocument.findFirstOrThrow({
      where: { expenseId: owner.id },
    })
    const other = await createExpense(values(b), groupB)

    await expect(
      updateExpense(
        groupB,
        other.id,
        values(b, [
          {
            id: document.id,
            url: document.url,
            width: document.width,
            height: document.height,
          },
        ]),
      ),
    ).rejects.toThrow('A document belongs to another expense')
    expect(
      (
        await prisma.expenseDocument.findUniqueOrThrow({
          where: { id: document.id },
        })
      ).expenseId,
    ).toBe(owner.id)
  })

  it('keeps an expense’s own document through an edit', async () => {
    const owner = await createExpense(
      values(a, [
        { id: 'y', url: 'https://example.com/s.jpg', width: 10, height: 10 },
      ]),
      groupA,
    )
    const document = await prisma.expenseDocument.findFirstOrThrow({
      where: { expenseId: owner.id },
    })
    await updateExpense(
      groupA,
      owner.id,
      values(a, [
        {
          id: document.id,
          url: document.url,
          width: document.width,
          height: document.height,
        },
      ]),
    )
    expect(
      await prisma.expenseDocument.count({ where: { expenseId: owner.id } }),
    ).toBe(1)
  })
})

describe('push.unsubscribe removes only your own subscription', () => {
  const alice = { id: id(), email: `alice-${id()}@example.com` }
  const mallory = { id: id(), email: `mallory-${id()}@example.com` }
  const endpoint = `https://push.example.com/${id()}`

  beforeAll(async () => {
    await prisma.user.create({ data: alice })
    await prisma.user.create({ data: mallory })
    await prisma.pushSubscription.create({
      data: { endpoint, p256dh: 'k', auth: 'a', userId: alice.id },
    })
  })

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [alice.id, mallory.id] } },
    })
  })

  it('leaves someone else’s alone, and removes your own', async () => {
    const { createTRPCRouter } = await import('@/trpc/init')
    const { unsubscribeProcedure } = await import(
      '@/trpc/routers/push/unsubscribe.procedure'
    )
    const caller = () =>
      createTRPCRouter({ unsubscribe: unsubscribeProcedure }).createCaller({})

    sessionUser = mallory
    await caller().unsubscribe({ endpoint })
    expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(1)

    sessionUser = alice
    await caller().unsubscribe({ endpoint })
    expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(0)
  })
})
