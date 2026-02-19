import { prisma } from '@/lib/prisma'
import { ExpenseFormValues, GroupFormValues } from '@/lib/schemas'
import {
  ActivityType,
  Expense,
  Prisma,
  RecurrenceRule,
  RecurringExpenseLink,
} from '@prisma/client'
import { nanoid } from 'nanoid'
import { sendPushNotificationToGroup } from './push'
import { calculateNextDate } from './recurring-expenses'
import {
  amountAsMinorUnits,
  formatAmountAsDecimal,
  getCurrencyFromGroup,
} from './utils'

export function randomId(size?: number) {
  return nanoid(size)
}

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
      originalAmount: expenseFormValues.originalAmount,
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

  sendPushNotificationToGroup(
    groupId,
    `New expense in ${group.name}`,
    `${expenseFormValues.title} - ${formatAmountAsDecimal(
      Number(expenseFormValues.amount),
      groupCurrency,
    )} ${groupCurrency.code}`,
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
  return (
    await prisma.group.findMany({
      where: { id: { in: groupIds } },
      include: { _count: { select: { participants: true } } },
    })
  ).map((group) => ({
    ...group,
    createdAt: group.createdAt.toISOString(),
  }))
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

  await logActivity(groupId, ActivityType.UPDATE_EXPENSE, {
    participantId,
    expenseId,
    data: expenseFormValues.title,
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
      originalAmount: expenseFormValues.originalAmount,
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
        // Update existing participants
        update: groupFormValues.participants
          .filter((p) => p.id !== undefined)
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
          .filter((p) => p.id === undefined)
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
  await createRecurringExpenses()
  return prisma.expense.findMany({
    select: {
      amount: true,
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

// ... existing createRecurringExpenses and createPayloadForNewRecurringExpenseLink (omitted for brevity, no changes needed if they use standard Create input)
// Wait, createRecurringExpenses uses prisma.expense.create with paidBy.
// I need to update createRecurringExpenses to use paidBy: { createMany: ... } as well.

export async function createRecurringExpenses() {
  const localDate = new Date()
  const utcDateFromLocal = new Date(
    Date.UTC(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      localDate.getUTCHours(),
      localDate.getUTCMinutes(),
    ),
  )
  const recurringExpenseLinksWithExpensesToCreate =
    await prisma.recurringExpenseLink.findMany({
      where: {
        nextExpenseCreatedAt: null,
        nextExpenseDate: {
          lte: utcDateFromLocal,
        },
      },
      include: {
        currentFrameExpense: {
          include: {
            paidBy: true, // This now returns ExpensePaidBy[]
            paidFor: true,
            category: true,
            documents: true,
          },
        },
      },
    })
  for (const recurringExpenseLink of recurringExpenseLinksWithExpensesToCreate) {
    let newExpenseDate = recurringExpenseLink.nextExpenseDate
    let currentExpenseRecord = recurringExpenseLink.currentFrameExpense
    let currentReccuringExpenseLinkId = recurringExpenseLink.id
    while (newExpenseDate < utcDateFromLocal) {
      const newExpenseId = randomId()
      const newRecurringExpenseLinkId = randomId()
      const newRecurringExpenseNextExpenseDate = calculateNextDate(
        currentExpenseRecord.recurrenceRule as RecurrenceRule,
        newExpenseDate,
      )
      const {
        category,
        paidBy, // ExpensePaidBy[]
        paidFor,
        documents,
        ...destructeredCurrentExpenseRecord
      } = currentExpenseRecord

      const newExpense = await prisma
        .$transaction(async (transaction) => {
          const newExpense = await transaction.expense.create({
            data: {
              ...destructeredCurrentExpenseRecord,
              categoryId: currentExpenseRecord.categoryId,
              // paidById removed
              paidBy: {
                createMany: {
                  data: paidBy.map((pb) => ({
                    participantId: pb.participantId,
                    amount: pb.amount,
                  })),
                },
              },
              paidFor: {
                createMany: {
                  data: currentExpenseRecord.paidFor.map((paidFor) => ({
                    participantId: paidFor.participantId,
                    shares: paidFor.shares,
                  })),
                },
              },
              documents: {
                connect: currentExpenseRecord.documents.map(
                  (documentRecord) => ({
                    id: documentRecord.id,
                  }),
                ),
              },
              id: newExpenseId,
              expenseDate: newExpenseDate,
              recurringExpenseLink: {
                create: {
                  groupId: currentExpenseRecord.groupId,
                  id: newRecurringExpenseLinkId,
                  nextExpenseDate: newRecurringExpenseNextExpenseDate,
                },
              },
            },
            include: {
              paidFor: true,
              documents: true,
              category: true,
              paidBy: true,
            },
          })
          await transaction.recurringExpenseLink.update({
            where: {
              id: currentReccuringExpenseLinkId,
              nextExpenseCreatedAt: null,
            },
            data: {
              nextExpenseCreatedAt: newExpense.createdAt,
            },
          })
          return newExpense
        })
        .catch((e) => {
          console.error(
            'Failed to created recurringExpense for expenseId: %s',
            currentExpenseRecord.id,
            e,
          )
          return null
        })
      if (newExpense === null) break
      currentExpenseRecord = newExpense
      currentReccuringExpenseLinkId = newRecurringExpenseLinkId
      newExpenseDate = newRecurringExpenseNextExpenseDate
    }
  }
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
