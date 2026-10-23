import { getAllGroupExpenses } from '@/lib/api'
import { expenseFiltersInput } from '@/lib/expense-filters'
import { getTotalActiveUserShare, getTotalGroupSpending } from '@/lib/totals'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

/**
 * How many expenses a search or filter matched and what they add up to. The list is paginated, so
 * this cannot be summed from the rows on screen.
 *
 * The total leaves settling up out, as the group total does, so the two can be compared.
 */
export const getGroupExpensesSummaryProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      participantId: z.string().optional(),
      ...expenseFiltersInput,
    }),
  )
  .query(async ({ input: { groupId, participantId, ...filters } }) => {
    const expenses = await getAllGroupExpenses(groupId, filters)
    return {
      count: expenses.length,
      total: getTotalGroupSpending(expenses),
      participantShare:
        participantId !== undefined
          ? getTotalActiveUserShare(participantId, expenses)
          : undefined,
    }
  })
