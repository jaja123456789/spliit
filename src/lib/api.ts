import {
  describeExpenseChanges,
  encodeActivityData,
  encodeRecurringActivityData,
} from '@/lib/activity-changes'
import { getBalances } from '@/lib/balances'
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
  await logActivity(groupId, ActivityType.CREATE_EXPENSE, {
    participantId,
    expenseId,
    data: expenseFormValues.title,
  })

  const isCreateRecurrence =
    expenseFormValues.recurrenceRule !== RecurrenceRule.NONE
  const recurringExpenseLinkPayload = createPayloadForNewRecurringExpenseLink(
    expenseFormValues.recurrenceRule as RecurrenceRule,
    expenseFormValues.expenseDate,
    groupId,
  )

  const expense = await prisma.expense.create({
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

  const amountInMinorUnits = amountAsMinorUnits(
    Number(expenseFormValues.amount),
    groupCurrency,
  )
  const formattedAmount = formatAmountAsDecimal(
    amountInMinorUnits,
    groupCurrency,
  )

  sendPushNotificationToGroup(
    groupId,
    `New expense in ${group.name}`,
    `${expenseFormValues.title} - ${formattedAmount} ${groupCurrency.code}`,
    `/groups/${groupId}/expenses/${expense.id}/edit`,
    participantId, // Assuming participantId can be mapped to userId, or just pass undefined if not available easily.
    // Ideally, pass the userId if available from context, but api.ts createExpense usually takes participantId.
    // To strictly exclude the sender, we'd need to know which User ID corresponds to the participantId.
    // For now, it's safer to leave undefined or implement a lookup.
  ).catch(console.error)

  return expense
}

export async function deleteExpense(
  groupId: string,
  expenseId: string,
  participantId?: string,
) {
  const existingExpense = await getExpense(groupId, expenseId)
  await logActivity(groupId, ActivityType.DELETE_EXPENSE, {
    participantId,
    expenseId,
    data: existingExpense?.title,
  })
  await prisma.expense.delete({
    where: { id: expenseId },
    include: { paidFor: true, paidBy: true },
  })
}

export async function getGroupExpensesParticipants(groupId: string) {
  const expenses = await getGroupExpenses(groupId)
  return Array.from(
    new Set(
      expenses.flatMap((e) => [
        ...e.paidBy.map((pb) => pb.participantId),
        ...e.paidFor.map((pf) => pf.participant.id),
      ]),
    ),
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

  await logActivity(groupId, ActivityType.UPDATE_EXPENSE, {
    participantId,
    expenseId,
    data: encodeActivityData(expenseFormValues.title, changes),
  })

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

  return prisma.expense.update({
    where: { id: expenseId },
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
}

export async function updateGroup(
  groupId: string,
  groupFormValues: GroupFormValues,
  participantId?: string,
) {
  const existingGroup = await getGroup(groupId)
  if (!existingGroup) throw new Error('Invalid group ID')
  await logActivity(groupId, ActivityType.UPDATE_GROUP, { participantId })

  const participantIdsToKeep = groupFormValues.participants
    .map((p) => p.id)
    .filter((id): id is string => !!id)

  return prisma.group.update({
    where: { id: groupId },
    data: {
      name: groupFormValues.name,
      information: groupFormValues.information,
      currency: groupFormValues.currency,
      currencyCode: groupFormValues.currencyCode,
      simplifyDebts: groupFormValues.simplifyDebts,
      participants: {
        // FIX: Pass a filter object { id: { notIn: [...] } }
        // instead of the array of filtered objects.
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

export async function getGroupExpenses(
  groupId: string,
  options?: { offset?: number; length?: number; filter?: string },
) {
  await createRecurringExpenses(groupId)
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
    where: {
      groupId,
      title: options?.filter
        ? { contains: options.filter, mode: 'insensitive' }
        : undefined,
    },
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    skip: options && options.offset,
    take: options && options.length,
  })
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

export async function getExpense(groupId: string, expenseId: string) {
  return prisma.expense.findUnique({
    where: { id: expenseId },
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

export async function logActivity(
  groupId: string,
  activityType: ActivityType,
  extra?: { participantId?: string; expenseId?: string; data?: string },
) {
  return prisma.activity.create({
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
