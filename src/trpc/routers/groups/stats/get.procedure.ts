import { getGroupExpenses } from '@/lib/api'
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
    const expenses = await getGroupExpenses(groupId)

    // 1. Existing Totals
    const totalGroupSpendings = getTotalGroupSpending(expenses)
    const totalParticipantSpendings =
      participantId !== undefined
        ? getTotalActiveUserPaidFor(participantId, expenses)
        : undefined
    const totalParticipantShare =
      participantId !== undefined
        ? getTotalActiveUserShare(participantId, expenses)
        : undefined

    // 2. Prepare Data for Charts
    const categoryMap = new Map<string, number>()
    const participantMap = new Map<string, { name: string; amount: number }>()
    const timeMap = new Map<string, number>()

    for (const expense of expenses) {
      if (expense.isReimbursement) continue

      // A. Category Spending
      const catName = expense.category?.name ?? 'Uncategorized'
      categoryMap.set(catName, (categoryMap.get(catName) ?? 0) + expense.amount)

      // B. Spending Over Time
      // Format date as YYYY-MM-DD for grouping
      const dateKey = expense.expenseDate.toISOString().split('T')[0]
      timeMap.set(dateKey, (timeMap.get(dateKey) ?? 0) + expense.amount)

      // C. Spending by Participant (Share/Consumption)
      // We need to calculate who "consumed" this expense
      const shares = calculateShares(expense)
      for (const [pId, shareAmount] of Object.entries(shares)) {
        // We need the name. Ideally we fetch the group participants, 
        // but we can try to find it in the expense data.
        if (!participantMap.has(pId)) {
          // Try to find name in paidFor array
          const pName = expense.paidFor.find(pf => pf.participant.id === pId)?.participant.name 
            // Or paidBy array
            ?? expense.paidBy.find(pb => pb.participantId === pId)?.participant.name
            ?? 'Unknown'
          
          participantMap.set(pId, { name: pName, amount: 0 })
        }
        const entry = participantMap.get(pId)!
        entry.amount += shareAmount
      }
    }

    // Convert Maps to Arrays for Recharts
    const categorySpending = Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value) // Highest first

    const dailySpending = Array.from(timeMap.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) // Chronological

    const participantSpending = Array.from(participantMap.values())
      .sort((a, b) => b.amount - a.amount)

    return {
      totalGroupSpendings,
      totalParticipantSpendings,
      totalParticipantShare,
      // New Data
      categorySpending,
      dailySpending,
      participantSpending
    }
  })