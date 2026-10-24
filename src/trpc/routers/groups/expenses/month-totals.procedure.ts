import { getAllGroupExpenses } from '@/lib/api'
import { expenseFiltersInput } from '@/lib/expense-filters'
import { getTotalGroupSpending } from '@/lib/totals'
import { toDateInputValue } from '@/lib/utils'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

/**
 * What each month of the list adds up to, for its heading: "October · €2,412.30".
 *
 * The list is paginated, so a month's rows are not all on screen when its heading is, and summing
 * them would report whatever page had loaded. Same filters as the list, same rule as the group
 * total — settling up is left out — so a heading and the total above it can be compared.
 */
export const getGroupExpenseMonthTotalsProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      ...expenseFiltersInput,
    }),
  )
  .query(async ({ input: { groupId, ...filters } }) => {
    const expenses = await getAllGroupExpenses(groupId, filters)
    const byMonth = new Map<string, typeof expenses>()
    for (const expense of expenses) {
      // UTC parts, as the list groups them: that is how date-only values are kept.
      const month = toDateInputValue(expense.expenseDate).slice(0, 7)
      const list = byMonth.get(month) ?? []
      list.push(expense)
      byMonth.set(month, list)
    }
    return {
      months: Object.fromEntries(
        [...byMonth].map(([month, list]) => [
          month,
          getTotalGroupSpending(list),
        ]),
      ),
    }
  })
