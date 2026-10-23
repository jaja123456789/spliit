import {
  describeExpenseChanges,
  encodeActivityData,
  encodeRecurringActivityData,
} from '@/lib/activity-changes'
import { getBalances } from '@/lib/balances'
import {
  ExpenseFilters,
  expenseFiltersWhere,
  hasActiveFilters,
} from '@/lib/expense-filters'
import { prisma } from '@/lib/prisma'
import { ExpenseFormValues, GroupFormValues } from '@/lib/schemas'
import {
  ActivityType,
  Expense,
  Prisma,
  RecurrenceRule,
  RecurringExpenseLink,
} from '@prisma/client'
import { getCurrency } from './currency'
import { sendPushNotificationToGroup } from './push'
import { calculateNextDate } from './recurring-expenses'
import {
  amountAsMinorUnits,
  formatAmountAsDecimal,
  getCurrencyFromGroup,
  randomId,
} from './utils'

export async function createGroup(groupFormValues: GroupFormValues) {
  return prisma.group.create({
    data: {
      id: randomId(),
      name: groupFormValues.name,
      information: groupFormValues.information,
      currency: groupFormValues.currency,
      currencyCode: groupFormValues.currencyCode,
      simplifyDebts: groupFormValues.simplifyDebts,
      participants: {
        createMany: {
          data: groupFormValues.participants.map(
            ({ name, paymentProfile }) => ({
              id: randomId(),
              name,
              paymentProfile: paymentProfile ?? undefined, // Pass the JSON
            }),
          ),
        },
      },
    },
    include: { participants: true },
  })
}

export async function createExpense(
  expenseFormValues: ExpenseFormValues,
  groupId: string,
  participantId?: string,
): Promise<Expense> {
  const group = await getGroup(groupId)
  if (!group) throw new Error(`Invalid group ID: ${groupId}`)

  const groupCurrency = getCurrencyFromGroup(group)

  // Validate participants
  const allParticipantIds = new Set([
    ...expenseFormValues.paidBy.map((p) => p.participant),
    ...expenseFormValues.paidFor.map((p) => p.participant),
  ])

  for (const participant of allParticipantIds) {
    if (!group.participants.some((p) => p.id === participant))
      throw new Error(`Invalid participant ID: ${participant}`)
  }

  const itemData =
    expenseFormValues.items?.map((item) => ({
      id: randomId(),
      name: item.name,
      price: amountAsMinorUnits(Number(item.price), groupCurrency),
      participantIds: item.participantIds,
    })) || []

  const expenseId = randomId()

  const isCreateRecurrence =
    expenseFormValues.recurrenceRule !== RecurrenceRule.NONE
  const recurringExpenseLinkPayload = createPayloadForNewRecurringExpenseLink(
    expenseFormValues.recurrenceRule as RecurrenceRule,
    expenseFormValues.expenseDate,
    groupId,
  )

  const expense = await prisma.$transaction(async (tx) => {
    await logActivity(
      groupId,
      ActivityType.CREATE_EXPENSE,
      { participantId, expenseId, data: expenseFormValues.title },
      tx,
    )
    return tx.expense.create({
      data: {
        id: expenseId,
        groupId,
        expenseDate: expenseFormValues.expenseDate,
        categoryId: expenseFormValues.category,
        amount: amountAsMinorUnits(
          Number(expenseFormValues.amount),
          groupCurrency,
        ),
        // Stored in minor units of the currency the expense was entered in.
        originalAmount: expenseFormValues.originalAmount
          ? amountAsMinorUnits(
              Number(expenseFormValues.originalAmount),
              getCurrency(expenseFormValues.originalCurrency),
            )
          : null,
        originalCurrency: expenseFormValues.originalCurrency,
        conversionRate: expenseFormValues.conversionRate,
        title: expenseFormValues.title,
        splitMode: expenseFormValues.splitMode,
        recurrenceRule: expenseFormValues.recurrenceRule,
        recurringExpenseLink: {
          ...(isCreateRecurrence
            ? {
                create: recurringExpenseLinkPayload,
              }
            : {}),
        },
        paidBy: {
          createMany: {
            data: expenseFormValues.paidBy.map((pb) => ({
              participantId: pb.participant,
              amount: amountAsMinorUnits(Number(pb.amount), groupCurrency),
            })),
          },
        },
        paidFor: {
          createMany: {
            data: expenseFormValues.paidFor.map((pf) => ({
              participantId: pf.participant,
              // Shares are stored as integers (cents if splitMode is BY_AMOUNT)
              shares:
                expenseFormValues.splitMode === 'BY_AMOUNT'
                  ? amountAsMinorUnits(Number(pf.shares), groupCurrency)
                  : Math.round(Number(pf.shares) * 100),
            })),
          },
        },
        isReimbursement: expenseFormValues.isReimbursement,
        items: {
          createMany: {
            data: itemData,
          },
        },
        documents: {
          createMany: {
            data: expenseFormValues.documents.map((doc) => ({
              id: randomId(),
              url: doc.url,
              width: doc.width,
              height: doc.height,
            })),
          },
        },
        notes: expenseFormValues.notes,
      },
    })
  })

  const amountInMinorUnits = amountAsMinorUnits(
    Number(expenseFormValues.amount),
    groupCurrency,
  )
  const formattedAmount = formatAmountAsDecimal(
    amountInMinorUnits,
    groupCurrency,
  )

  // Excludes whoever is the acting participant on a synced device (see `push.ts`).
  sendPushNotificationToGroup(
    groupId,
    `New expense in ${group.name}`,
    `${expenseFormValues.title} - ${formattedAmount} ${groupCurrency.code}`,
    `/groups/${groupId}/expenses/${expense.id}/edit`,
    participantId,
  ).catch(console.error)

  return expense
}

export async function deleteExpense(
  groupId: string,
  expenseId: string,
  participantId?: string,
) {
  const existingExpense = await getExpense(groupId, expenseId)
  if (!existingExpense) throw new Error(`Invalid expense ID: ${expenseId}`)
  await prisma.$transaction(async (tx) => {
    await logActivity(
      groupId,
      ActivityType.DELETE_EXPENSE,
      { participantId, expenseId, data: existingExpense.title },
      tx,
    )
    await tx.expense.delete({ where: { id: expenseId, groupId } })
  })
}

/**
 * The participants who appear on any expense of the group — the ones group Settings will not let
 * you remove. Asked of the database directly: this used to load the group's entire history with
 * every relation, about 270 ms for a large group, to collect a handful of ids.
 */
export async function getGroupExpensesParticipants(groupId: string) {
  const [payers, sharers] = await Promise.all([
    prisma.expensePaidBy.findMany({
      where: { expense: { groupId } },
      select: { participantId: true },
      distinct: ['participantId'],
    }),
    prisma.expensePaidFor.findMany({
      where: { expense: { groupId } },
      select: { participantId: true },
      distinct: ['participantId'],
    }),
  ])
  return Array.from(
    new Set([...payers, ...sharers].map((row) => row.participantId)),
  )
}

export async function getGroups(groupIds: string[]) {
  const groups = await prisma.group.findMany({
    where: { id: { in: groupIds } },
    include: {
      _count: { select: { participants: true } },
      activities: {
        orderBy: { time: 'desc' },
        take: 1,
        select: { time: true },
      },
    },
  })

  return groups.map((group) => {
    const lastActiveAt = group.activities[0]?.time ?? group.createdAt

    const { activities, ...rest } = group

    return {
      ...rest,
      createdAt: group.createdAt.toISOString(),
      updatedAt: lastActiveAt.toISOString(),
    }
  })
}

export async function updateExpense(
  groupId: string,
  expenseId: string,
  expenseFormValues: ExpenseFormValues,
  participantId?: string,
) {
  const group = await getGroup(groupId)
  if (!group) throw new Error(`Invalid group ID: ${groupId}`)

  const groupCurrency = getCurrencyFromGroup(group)

  const existingExpense = await getExpense(groupId, expenseId)
  if (!existingExpense) throw new Error(`Invalid expense ID: ${expenseId}`)

  // Validate participants
  const allParticipantIds = new Set([
    ...expenseFormValues.paidBy.map((p) => p.participant),
    ...expenseFormValues.paidFor.map((p) => p.participant),
  ])

  for (const participant of allParticipantIds) {
    if (!group.participants.some((p) => p.id === participant))
      throw new Error(`Invalid participant ID: ${participant}`)
  }

  // Record *what* changed, not merely that something did. `existingExpense` is already loaded
  // above for validation, so this costs no extra query.
  const nameOf = (id: string) =>
    group.participants.find((p) => p.id === id)?.name ?? id
  const nextCategoryId = Number(expenseFormValues.category)
  const nextCategory =
    nextCategoryId === existingExpense.categoryId
      ? existingExpense.category
      : await prisma.category.findUnique({ where: { id: nextCategoryId } })
  const changes = describeExpenseChanges(
    {
      title: existingExpense.title,
      amount: existingExpense.amount,
      expenseDate: existingExpense.expenseDate,
      categoryName: existingExpense.category?.name,
      paidBy: existingExpense.paidBy.map((pb) => nameOf(pb.participantId)),
      paidFor: existingExpense.paidFor.map((pf) => nameOf(pf.participantId)),
    },
    {
      title: expenseFormValues.title,
      amount: amountAsMinorUnits(
        Number(expenseFormValues.amount),
        groupCurrency,
      ),
      expenseDate: expenseFormValues.expenseDate,
      categoryName: nextCategory?.name,
      paidBy: expenseFormValues.paidBy.map((pb) => nameOf(pb.participant)),
      paidFor: expenseFormValues.paidFor.map((pf) => nameOf(pf.participant)),
    },
  )

  const isDeleteRecurrenceExpenseLink =
    existingExpense.recurrenceRule !== RecurrenceRule.NONE &&
    expenseFormValues.recurrenceRule === RecurrenceRule.NONE &&
    existingExpense.recurringExpenseLink?.nextExpenseCreatedAt === null

  const isUpdateRecurrenceExpenseLink =
    existingExpense.recurrenceRule !== expenseFormValues.recurrenceRule &&
    existingExpense.recurringExpenseLink?.nextExpenseCreatedAt === null

  const isCreateRecurrenceExpenseLink =
    existingExpense.recurrenceRule === RecurrenceRule.NONE &&
    expenseFormValues.recurrenceRule !== RecurrenceRule.NONE &&
    existingExpense.recurringExpenseLink === null

  const newRecurringExpenseLink = createPayloadForNewRecurringExpenseLink(
    expenseFormValues.recurrenceRule as RecurrenceRule,
    expenseFormValues.expenseDate,
    groupId,
  )

  const updatedRecurrenceExpenseLinkNextExpenseDate = calculateNextDate(
    expenseFormValues.recurrenceRule as RecurrenceRule,
    existingExpense.expenseDate,
  )

  const itemData =
    expenseFormValues.items?.map((item) => ({
      id: item.id || randomId(),
      name: item.name,
      price: amountAsMinorUnits(Number(item.price), groupCurrency),
      participantIds: item.participantIds,
      expenseId, // needed for createMany
    })) || []

  return prisma.$transaction(async (tx) => {
    await logActivity(
      groupId,
      ActivityType.UPDATE_EXPENSE,
      {
        participantId,
        expenseId,
        data: encodeActivityData(expenseFormValues.title, changes),
      },
      tx,
    )
    return tx.expense.update({
      where: { id: expenseId, groupId },
      data: {
        expenseDate: expenseFormValues.expenseDate,
        amount: amountAsMinorUnits(
          Number(expenseFormValues.amount),
          groupCurrency,
        ),
        // Stored in minor units of the currency the expense was entered in.
        originalAmount: expenseFormValues.originalAmount
          ? amountAsMinorUnits(
              Number(expenseFormValues.originalAmount),
              getCurrency(expenseFormValues.originalCurrency),
            )
          : null,
        originalCurrency: expenseFormValues.originalCurrency,
        conversionRate: expenseFormValues.conversionRate,
        title: expenseFormValues.title,
        categoryId: expenseFormValues.category,
        splitMode: expenseFormValues.splitMode,
        recurrenceRule: expenseFormValues.recurrenceRule,
        paidBy: {
          deleteMany: { expenseId },
          createMany: {
            data: expenseFormValues.paidBy.map((pb) => ({
              participantId: pb.participant,
              amount: amountAsMinorUnits(Number(pb.amount), groupCurrency),
            })),
          },
        },
        paidFor: {
          create: expenseFormValues.paidFor
            .filter(
              (p) =>
                !existingExpense.paidFor.some(
                  (pp) => pp.participantId === p.participant,
                ),
            )
            .map((paidFor) => ({
              participantId: paidFor.participant,
              shares:
                expenseFormValues.splitMode === 'BY_AMOUNT'
                  ? amountAsMinorUnits(Number(paidFor.shares), groupCurrency)
                  : Math.round(Number(paidFor.shares) * 100),
            })),
          update: expenseFormValues.paidFor.map((paidFor) => ({
            where: {
              expenseId_participantId: {
                expenseId,
                participantId: paidFor.participant,
              },
            },
            data: {
              shares:
                expenseFormValues.splitMode === 'BY_AMOUNT'
                  ? amountAsMinorUnits(Number(paidFor.shares), groupCurrency)
                  : Math.round(Number(paidFor.shares) * 100),
            },
          })),
          deleteMany: existingExpense.paidFor.filter(
            (paidFor) =>
              !expenseFormValues.paidFor.some(
                (pf) => pf.participant === paidFor.participantId,
              ),
          ),
        },
        recurringExpenseLink: {
          ...(isCreateRecurrenceExpenseLink
            ? {
                create: newRecurringExpenseLink,
              }
            : {}),
          ...(isUpdateRecurrenceExpenseLink
            ? {
                update: {
                  nextExpenseDate: updatedRecurrenceExpenseLinkNextExpenseDate,
                },
              }
            : {}),
          delete: isDeleteRecurrenceExpenseLink,
        },
        isReimbursement: expenseFormValues.isReimbursement,
        items: {
          deleteMany: {}, // Clear old items
          createMany: {
            data: itemData.map(({ id, name, price, participantIds }) => ({
              id,
              name,
              price,
              participantIds,
            })),
          },
        },
        documents: {
          connectOrCreate: expenseFormValues.documents.map((doc) => ({
            create: doc,
            where: { id: doc.id },
          })),
          deleteMany: existingExpense.documents
            .filter(
              (existingDoc) =>
                !expenseFormValues.documents.some(
                  (doc) => doc.id === existingDoc.id,
                ),
            )
            .map((doc) => ({
              id: doc.id,
            })),
        },
        notes: expenseFormValues.notes,
      },
    })
  })
}

export async function updateGroup(
  groupId: string,
  groupFormValues: GroupFormValues,
  participantId?: string,
) {
  const existingGroup = await getGroup(groupId)
  if (!existingGroup) throw new Error('Invalid group ID')

  const participantIdsToKeep = groupFormValues.participants
    .map((p) => p.id)
    .filter((id): id is string => !!id)

  return prisma.$transaction(async (tx) => {
    await logActivity(groupId, ActivityType.UPDATE_GROUP, { participantId }, tx)
    return tx.group.update({
      where: { id: groupId },
      data: {
        name: groupFormValues.name,
        information: groupFormValues.information,
        currency: groupFormValues.currency,
        currencyCode: groupFormValues.currencyCode,
        simplifyDebts: groupFormValues.simplifyDebts,
        participants: {
          // Everyone no longer listed. A filter, not a list of rows: `deleteMany` takes a `where`.
          deleteMany: {
            id: {
              notIn: participantIdsToKeep,
            },
          },
          // Update existing participants.
          // Truthiness, not `!== undefined`: the group form appends a new participant with `id: ''`,
          // which passed this filter and failed the whole save with "No 'Participant' record was
          // found for a nested update", while also failing the `id === undefined` test below — so
          // adding a participant in group settings neither updated nor created anything. This
          // matches `participantIdsToKeep` above, which already treats an empty id as absent.
          update: groupFormValues.participants
            .filter((p) => !!p.id)
            .map((p) => ({
              where: { id: p.id },
              data: {
                name: p.name,
                // Use Prisma.DbNull to explicitly clear the JSON field if it's empty
                paymentProfile: p.paymentProfile
                  ? (p.paymentProfile as any)
                  : Prisma.DbNull,
              },
            })),
          // Create new participants
          create: groupFormValues.participants
            .filter((p) => !p.id)
            .map((p) => ({
              id: randomId(),
              name: p.name,
              paymentProfile: p.paymentProfile
                ? (p.paymentProfile as any)
                : undefined,
            })),
        },
      },
    })
  })
}

export async function getGroup(groupId: string) {
  return prisma.group.findUnique({
    where: { id: groupId },
    include: { participants: true },
  })
}

export async function getCategories() {
  return prisma.category.findMany()
}

/**
 * The `where` for a group's expenses, narrowed by `filters` when any are set. The group's currency
 * is only read when there is something to narrow by: it says what amount a number in the search
 * means.
 */
async function groupExpensesWhere(
  groupId: string,
  filters?: ExpenseFilters,
): Promise<Prisma.ExpenseWhereInput> {
  if (!filters || !hasActiveFilters(filters)) return { groupId }
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { currency: true, currencyCode: true },
  })
  const decimals = group ? getCurrencyFromGroup(group).decimal_digits : 2
  return expenseFiltersWhere(groupId, filters, decimals)
}

export async function getGroupExpenses(
  groupId: string,
  options?: { offset?: number; length?: number; filters?: ExpenseFilters },
) {
  await createRecurringExpenses(groupId)
  const where = await groupExpensesWhere(groupId, options?.filters)
  return prisma.expense.findMany({
    select: {
      amount: true,
      originalAmount: true,
      originalCurrency: true,
      category: true,
      createdAt: true,
      expenseDate: true,
      id: true,
      isReimbursement: true,
      paidBy: {
        select: {
          amount: true,
          participantId: true,
          participant: { select: { id: true, name: true } },
        },
      },
      paidFor: {
        select: {
          participant: { select: { id: true, name: true } },
          shares: true,
        },
      },
      splitMode: true,
      recurrenceRule: true,
      title: true,
      _count: { select: { documents: true } },
    },
    where,
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    skip: options && options.offset,
    take: options && options.length,
  })
}

/**
 * Every expense of a group, in exactly the shape `getGroupExpenses` returns, for the screens that
 * add up the whole history: Balances, Stats and the total above the expense list.
 *
 * Those used `getGroupExpenses` itself, whose nested selects make Prisma assemble every payer and
 * share as its own object graph — about 200 ms for a 1,935-expense group, when the same rows read
 * flat take a few. This reads them flat and joins them here.
 *
 * The payers and shares are fetched with the same `expenseId IN (…)` the nested select issues, on
 * purpose. The order those rows arrive in decides who gets the spare cent of an even split (ties go
 * to the later participant, see `calculateShares`), and nothing in the schema fixes that order. A
 * query shaped differently — joining on the group instead — came back in a different order for 10
 * of 2,948 expenses on real data and moved cents between people. Same query shape, same order.
 *
 * `filters` narrows it the way they narrow the list, for the figures summing up a search.
 */
export async function getAllGroupExpenses(
  groupId: string,
  filters?: ExpenseFilters,
): Promise<Awaited<ReturnType<typeof getGroupExpenses>>> {
  await createRecurringExpenses(groupId)
  const where = await groupExpensesWhere(groupId, filters)
  const [expenses, participants, categories] = await Promise.all([
    prisma.expense.findMany({
      select: {
        amount: true,
        originalAmount: true,
        originalCurrency: true,
        categoryId: true,
        createdAt: true,
        expenseDate: true,
        id: true,
        isReimbursement: true,
        splitMode: true,
        recurrenceRule: true,
        title: true,
      },
      where,
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.participant.findMany({
      where: { groupId },
      select: { id: true, name: true },
    }),
    getCategories(),
  ])
  if (expenses.length === 0) return []

  const expenseIds = expenses.map((expense) => expense.id)
  const [payers, shares, documentCounts] = await Promise.all([
    prisma.expensePaidBy.findMany({
      where: { expenseId: { in: expenseIds } },
      select: { expenseId: true, amount: true, participantId: true },
    }),
    prisma.expensePaidFor.findMany({
      where: { expenseId: { in: expenseIds } },
      select: { expenseId: true, participantId: true, shares: true },
    }),
    prisma.expenseDocument.groupBy({
      by: ['expenseId'],
      where: { expenseId: { in: expenseIds } },
      _count: { _all: true },
    }),
  ])

  const participantById = new Map(participants.map((p) => [p.id, p]))
  const participant = (id: string) =>
    participantById.get(id) ?? { id, name: '' }
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const documentsByExpense = new Map(
    documentCounts.map((row) => [row.expenseId, row._count._all]),
  )
  const group = <Row extends { expenseId: string }>(rows: Row[]) => {
    const byExpense = new Map<string, Row[]>()
    for (const row of rows) {
      const list = byExpense.get(row.expenseId)
      if (list) list.push(row)
      else byExpense.set(row.expenseId, [row])
    }
    return byExpense
  }
  const payersByExpense = group(payers)
  const sharesByExpense = group(shares)

  return expenses.map(({ categoryId, ...expense }) => ({
    ...expense,
    category: categoryById.get(categoryId) ?? null,
    paidBy: (payersByExpense.get(expense.id) ?? []).map((payer) => ({
      amount: payer.amount,
      participantId: payer.participantId,
      participant: participant(payer.participantId),
    })),
    paidFor: (sharesByExpense.get(expense.id) ?? []).map((share) => ({
      participant: participant(share.participantId),
      shares: share.shares,
    })),
    _count: { documents: documentsByExpense.get(expense.id) ?? 0 },
  }))
}

/**
 * The payments already recorded in a group, newest first.
 *
 * Deliberately *not* built on `getGroupExpenses`, for two reasons. That function materialises due
 * recurring expenses before it reads, so rendering the Balances tab would turn into a write; and its
 * only filter is free text over the title, so "the payments" would have to be sifted out on the
 * client — which, against a paginated list, gives you the payments that happen to be on page one and
 * looks right while being wrong.
 *
 * A payment recorded on the payment screen is one payer and one payee. One created through the old
 * expense form with the reimbursement box ticked need not be, so `from`/`to` are the first of each
 * and `isSimple` says whether that is the whole story — a row that is not simple falls back to its
 * title rather than claiming a direction it does not have.
 */
export async function getGroupPayments(
  groupId: string,
  options?: { limit?: number },
) {
  const payments = await prisma.expense.findMany({
    select: {
      id: true,
      title: true,
      amount: true,
      expenseDate: true,
      notes: true,
      paidBy: { select: { participantId: true } },
      paidFor: { select: { participant: { select: { id: true } } } },
    },
    where: { groupId, isReimbursement: true },
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    take: options?.limit,
  })

  return payments.map((payment) => ({
    id: payment.id,
    title: payment.title,
    amount: payment.amount,
    expenseDate: payment.expenseDate,
    notes: payment.notes,
    from: payment.paidBy[0]?.participantId ?? null,
    to: payment.paidFor[0]?.participant.id ?? null,
    isSimple: payment.paidBy.length === 1 && payment.paidFor.length === 1,
  }))
}

/**
 * Balances for several groups in one pass, for the group list's "what do I owe" figures.
 *
 * Deliberately *not* built on `getGroupExpenses`: that materialises due recurring expenses first,
 * so reading it once per card would turn rendering the home screen into a write per group. This is
 * a plain read, and any recurring expense not yet materialised simply is not counted yet — the
 * group's own Balances tab still does that on open.
 */
export async function getBalancesForGroups(
  requests: { groupId: string; participantId: string }[],
) {
  if (requests.length === 0) return []
  const expenses = await prisma.expense.findMany({
    select: {
      groupId: true,
      amount: true,
      splitMode: true,
      paidBy: { select: { amount: true, participantId: true } },
      paidFor: {
        select: { participant: { select: { id: true } }, shares: true },
      },
    },
    where: { groupId: { in: requests.map((r) => r.groupId) } },
  })

  const byGroup = new Map<string, typeof expenses>()
  for (const expense of expenses) {
    const list = byGroup.get(expense.groupId) ?? []
    list.push(expense)
    byGroup.set(expense.groupId, list)
  }

  return requests.map(({ groupId, participantId }) => {
    const balances = getBalances((byGroup.get(groupId) ?? []) as any)
    return {
      groupId,
      participantId,
      balance: balances[participantId]?.total ?? 0,
    }
  })
}

export async function getGroupExpenseCount(groupId: string) {
  return prisma.expense.count({ where: { groupId } })
}

/**
 * What the expense filters can offer for a group: the months that have expenses, newest first,
 * and the categories in use, most used first — each with how many expenses it holds.
 *
 * A plain read, like `getBalancesForGroups`: it only furnishes a menu, so a recurring expense not
 * yet materialised can wait for the list to do that.
 */
export async function getGroupExpenseFacets(groupId: string) {
  const [days, categories] = await Promise.all([
    prisma.expense.groupBy({
      by: ['expenseDate'],
      where: { groupId },
      _count: { _all: true },
    }),
    prisma.expense.groupBy({
      by: ['categoryId'],
      where: { groupId },
      _count: { _all: true },
    }),
  ])

  const months = new Map<string, number>()
  for (const day of days) {
    // Date-only values are UTC midnights, so the UTC parts are the calendar day.
    const month = day.expenseDate.toISOString().slice(0, 7)
    months.set(month, (months.get(month) ?? 0) + day._count._all)
  }

  return {
    months: Array.from(months, ([month, count]) => ({ month, count })).sort(
      (a, b) => b.month.localeCompare(a.month),
    ),
    categories: categories
      .map((row) => ({ id: row.categoryId, count: row._count._all }))
      .sort((a, b) => b.count - a.count || a.id - b.id),
  }
}

/**
 * An expense of this group. The group is part of the lookup, not decoration: every caller holds a
 * group link and an expense id, and an id alone used to reach an expense of any group.
 */
export async function getExpense(groupId: string, expenseId: string) {
  return prisma.expense.findUnique({
    where: { id: expenseId, groupId },
    include: {
      paidBy: true,
      paidFor: true,
      category: true,
      documents: true,
      recurringExpenseLink: true,
      items: true,
    },
  })
}

export async function getActivities(
  groupId: string,
  options?: { offset?: number; length?: number },
) {
  const activities = await prisma.activity.findMany({
    where: { groupId },
    orderBy: [{ time: 'desc' }],
    skip: options?.offset,
    take: options?.length,
  })
  const expenseIds = activities
    .map((activity) => activity.expenseId)
    .filter(Boolean)
  const expenses = await prisma.expense.findMany({
    where: {
      groupId,
      id: { in: expenseIds },
    },
  })
  return activities.map((activity) => ({
    ...activity,
    expense:
      activity.expenseId !== null
        ? expenses.find((expense) => expense.id === activity.expenseId)
        : undefined,
  }))
}

/**
 * Deletes a group and everything hanging off it.
 *
 * The schema does the cascade: Participant, Expense, Activity and SyncedGroup all declare
 * `onDelete: Cascade` on their group relation, so no synced profile is left holding a row that
 * points at a group that no longer exists. There is deliberately no soft delete — the app's promise
 * is that data lives in your own database and leaves when you say so.
 */
export async function deleteGroup(groupId: string) {
  await prisma.group.delete({ where: { id: groupId } })
}

/**
 * Records several payments as one unit of work.
 *
 * Settling three debts through `createExpense` is three round trips with no relationship to each
 * other: if the second fails, the first is already recorded and the reader has no way to tell which
 * of the three went through. A single button that can half-succeed is worse than three trips
 * through the form, so this writes them inside one transaction — all of them, or none.
 *
 * A payment is a much smaller shape than an expense: one payer, one payee, split evenly, no items,
 * no documents, no recurrence. That is why this inserts directly rather than threading a
 * transaction client through `createExpense` — the simpler shape is what makes the smaller blast
 * radius available.
 *
 * @param payments amounts in *minor* units, which is what balances are computed in.
 * @param date the day the payments are dated, as midnight UTC of the settler's own calendar day.
 *   Falls back to the server's clock, which is only the right day where the server's UTC date is.
 */
export async function createPayments(
  groupId: string,
  payments: { from: string; to: string; amount: number; title: string }[],
  participantId?: string,
  date?: Date,
) {
  const group = await getGroup(groupId)
  if (!group) throw new Error(`Invalid group ID: ${groupId}`)

  const participantIds = new Set(group.participants.map((p) => p.id))
  for (const payment of payments) {
    for (const id of [payment.from, payment.to]) {
      if (!participantIds.has(id))
        throw new Error(`Invalid participant ID: ${id}`)
    }
    if (payment.from === payment.to)
      throw new Error('A payment cannot be from someone to themselves')
  }

  return prisma.$transaction(async (tx) => {
    const created: string[] = []
    for (const payment of payments) {
      const expenseId = randomId()
      await tx.activity.create({
        data: {
          id: randomId(),
          groupId,
          activityType: ActivityType.CREATE_EXPENSE,
          participantId,
          expenseId,
          data: payment.title,
        },
      })
      await tx.expense.create({
        data: {
          id: expenseId,
          groupId,
          expenseDate: date ?? new Date(),
          categoryId: 1,
          amount: payment.amount,
          title: payment.title,
          splitMode: 'EVENLY',
          recurrenceRule: RecurrenceRule.NONE,
          isReimbursement: true,
          paidBy: {
            createMany: {
              data: [{ participantId: payment.from, amount: payment.amount }],
            },
          },
          paidFor: {
            createMany: {
              // Shares for EVENLY are stored as hundredths, like everywhere else.
              data: [{ participantId: payment.to, shares: 100 }],
            },
          },
        },
      })
      created.push(expenseId)
    }
    return created
  })
}

/**
 * Pass the transaction the change itself is written in. Logged on its own, a change that then
 * failed still left "created by…" in the feed for an expense that never existed.
 */
export async function logActivity(
  groupId: string,
  activityType: ActivityType,
  extra?: { participantId?: string; expenseId?: string; data?: string },
  db: Prisma.TransactionClient = prisma,
) {
  return db.activity.create({
    data: {
      id: randomId(),
      groupId,
      activityType,
      ...extra,
    },
  })
}

/**
 * Materialises the recurring expenses that have come due. This runs on every read of a group's
 * expenses, so pass the group being read: `RecurringExpenseLink` is indexed on
 * `[groupId, nextExpenseCreatedAt, nextExpenseDate]` and without a group the leading column is
 * unconstrained, which turns the lookup into a scan of every recurring expense in the database.
 *
 * With nothing due — the usual case — that indexed lookup is all this costs.
 */
export async function createRecurringExpenses(groupId?: string) {
  const now = new Date()
  const dueLinks = await prisma.recurringExpenseLink.findMany({
    where: {
      groupId,
      nextExpenseCreatedAt: null,
      nextExpenseDate: { lte: now },
    },
    include: {
      currentFrameExpense: {
        include: { paidBy: true, paidFor: true, documents: true },
      },
    },
  })
  for (const link of dueLinks) {
    await catchUpRecurringExpense(link, now).catch((error) =>
      console.error(
        'Failed to create recurring expenses for expenseId: %s',
        link.currentFrameExpenseId,
        error,
      ),
    )
  }
}

/**
 * Every occurrence of one recurring expense that has come due, written as one batch.
 *
 * This used to create them one transaction at a time, each a nested create waiting on the last,
 * inside whichever page read happened to find them: a daily expense a year overdue held the first
 * read of its group for 2.1 s while 365 round trips went by. Now it is a handful of bulk inserts,
 * however many occurrences there are.
 *
 * The chain keeps its shape — each occurrence gets its own link, the last one open — so editing or
 * stopping the newest occurrence works as it always has. And the catch-up says so in Activity,
 * once, where 365 expenses used to appear with no line at all.
 */
async function catchUpRecurringExpense(
  link: Prisma.RecurringExpenseLinkGetPayload<{
    include: {
      currentFrameExpense: {
        include: { paidBy: true; paidFor: true; documents: true }
      }
    }
  }>,
  now: Date,
) {
  const {
    paidBy,
    paidFor,
    documents,
    id: _templateId,
    createdAt: _templateCreatedAt,
    ...template
  } = link.currentFrameExpense
  const rule = template.recurrenceRule as RecurrenceRule

  const occurrences: {
    expenseId: string
    linkId: string
    expenseDate: Date
    nextExpenseDate: Date
  }[] = []
  for (
    let expenseDate = link.nextExpenseDate;
    expenseDate < now;
    expenseDate = calculateNextDate(rule, expenseDate)
  ) {
    occurrences.push({
      expenseId: randomId(),
      linkId: randomId(),
      expenseDate,
      nextExpenseDate: calculateNextDate(rule, expenseDate),
    })
  }
  const newest = occurrences.at(-1)
  if (!newest) return

  await prisma.$transaction(async (tx) => {
    // Claim the link first. A concurrent read that found the same due link blocks here until this
    // commits, then sees it taken and writes nothing — so no occurrence is ever created twice.
    const claimed = await tx.recurringExpenseLink.updateMany({
      where: { id: link.id, nextExpenseCreatedAt: null },
      data: { nextExpenseCreatedAt: now },
    })
    if (claimed.count === 0) return

    await tx.expense.createMany({
      data: occurrences.map(({ expenseId, expenseDate }) => ({
        ...template,
        id: expenseId,
        expenseDate,
        createdAt: now,
      })),
    })
    await tx.expensePaidBy.createMany({
      data: occurrences.flatMap(({ expenseId }) =>
        paidBy.map((payer) => ({
          expenseId,
          participantId: payer.participantId,
          amount: payer.amount,
        })),
      ),
    })
    await tx.expensePaidFor.createMany({
      data: occurrences.flatMap(({ expenseId }) =>
        paidFor.map((share) => ({
          expenseId,
          participantId: share.participantId,
          shares: share.shares,
        })),
      ),
    })
    await tx.recurringExpenseLink.createMany({
      data: occurrences.map(({ expenseId, linkId, nextExpenseDate }) => ({
        id: linkId,
        groupId: template.groupId,
        currentFrameExpenseId: expenseId,
        nextExpenseDate,
        // Only the newest occurrence is still waiting for its successor.
        nextExpenseCreatedAt: expenseId === newest.expenseId ? null : now,
      })),
    })
    // A document belongs to one expense, so it follows the chain to its newest occurrence — where
    // the one-step-at-a-time version also left it, after moving it once per step.
    if (documents.length > 0) {
      await tx.expenseDocument.updateMany({
        where: { id: { in: documents.map((document) => document.id) } },
        data: { expenseId: newest.expenseId },
      })
    }
    await tx.activity.create({
      data: {
        id: randomId(),
        groupId: template.groupId,
        activityType: ActivityType.CREATE_EXPENSE,
        expenseId: newest.expenseId,
        data: encodeRecurringActivityData(template.title, occurrences.length),
      },
    })
  })
}
export function createPayloadForNewRecurringExpenseLink(
  recurrenceRule: RecurrenceRule,
  priorDateToNextRecurrence: Date,
  groupId: String,
): RecurringExpenseLink {
  const nextExpenseDate = calculateNextDate(
    recurrenceRule,
    priorDateToNextRecurrence,
  )
  const recurringExpenseLinkId = randomId()
  const recurringExpenseLinkPayload = {
    id: recurringExpenseLinkId,
    groupId: groupId,
    nextExpenseDate: nextExpenseDate,
  }
  return recurringExpenseLinkPayload as RecurringExpenseLink
}
