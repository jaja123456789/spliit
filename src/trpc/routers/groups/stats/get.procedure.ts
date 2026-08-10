import { getGroup, getGroupExpenses } from '@/lib/api'
import { bucketSpendingOverTime } from '@/lib/stats'
import {
  calculateShares,
  getTotalActiveUserPaidFor,
  getTotalActiveUserShare,
  getTotalGroupSpending,
} from '@/lib/totals'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const getGroupStatsProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      participantId: z.string().optional(),
    }),
  )
  .query(async ({ input: { groupId, participantId } }) => {
    const [group, expenses] = await Promise.all([
      getGroup(groupId),
      getGroupExpenses(groupId),
    ])
    if (!group) throw new Error(`Invalid group ID: ${groupId}`)

    const totalGroupSpendings = getTotalGroupSpending(expenses)
    const totalParticipantSpendings =
      participantId !== undefined
        ? getTotalActiveUserPaidFor(participantId, expenses)
        : undefined
    const totalParticipantShare =
      participantId !== undefined
        ? getTotalActiveUserShare(participantId, expenses)
        : undefined

    // Settling up isn't spending, so it belongs in none of the charts. This matches the totals
    // above, and keeps the per-participant bars adding up to the group total.
    const spendingExpenses = expenses.filter(
      (expense) => !expense.isReimbursement,
    )

    // Keyed by category id, not name: the client needs the grouping to translate the label, and
    // two categories are free to share a name.
    const categoryMap = new Map<
      number,
      { grouping: string; name: string; amount: number }
    >()
    // Seeded with the whole group so someone who hasn't been in a split yet shows as an explicit
    // zero instead of vanishing from the chart.
    const participantMap = new Map(
      group.participants.map((participant) => [
        participant.id,
        { id: participant.id, name: participant.name, amount: 0 },
      ]),
    )

    for (const expense of spendingExpenses) {
      const categoryId = expense.category?.id ?? 0
      const category = categoryMap.get(categoryId)
      if (category) {
        category.amount += expense.amount
      } else {
        categoryMap.set(categoryId, {
          // Matches the seeded default category, so an expense with no category of its own lands
          // under the same label as one explicitly filed there.
          grouping: expense.category?.grouping ?? 'Uncategorized',
          name: expense.category?.name ?? 'General',
          amount: expense.amount,
        })
      }

      for (const [pId, shareAmount] of Object.entries(
        calculateShares(expense),
      )) {
        const entry = participantMap.get(pId)
        if (entry) {
          entry.amount += shareAmount
          continue
        }
        // Someone who has left the group but still appears on an old expense.
        participantMap.set(pId, {
          id: pId,
          name:
            expense.paidFor.find((pf) => pf.participant.id === pId)?.participant
              .name ??
            expense.paidBy.find((pb) => pb.participantId === pId)?.participant
              .name ??
            '?',
          amount: shareAmount,
        })
      }
    }

    const { granularity, buckets } = bucketSpendingOverTime(
      spendingExpenses.map((expense) => ({
        date: expense.expenseDate,
        amount: expense.amount,
      })),
    )

    return {
      totalGroupSpendings,
      totalParticipantSpendings,
      totalParticipantShare,
      categorySpending: Array.from(categoryMap.entries())
        .map(([id, category]) => ({ id, ...category }))
        .sort((a, b) => b.amount - a.amount),
      participantSpending: Array.from(participantMap.values()).sort(
        (a, b) => b.amount - a.amount,
      ),
      spendingOverTime: buckets,
      timeGranularity: granularity,
    }
  })
