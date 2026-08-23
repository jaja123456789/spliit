import { getGroupPayments } from '@/lib/api'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

/**
 * The payments already recorded in a group.
 *
 * Its own procedure rather than a flag on `expenses.list`, because the two lists disagree about what
 * a page is: `expenses.list` pages twenty at a time and filters on free text, so asking it for the
 * reimbursements would return the ones that happen to be on the current page. Balances shows a
 * recent handful, so the cap lives here rather than a cursor the screen has nothing to do with.
 */
export const listGroupPaymentsProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      limit: z.number().int().positive().max(50).optional(),
    }),
  )
  .query(async ({ input: { groupId, limit = 10 } }) => {
    // One more than we show, so the screen can say there are older ones without counting them all.
    const payments = await getGroupPayments(groupId, { limit: limit + 1 })
    return {
      payments: payments.slice(0, limit),
      hasMore: payments.length > limit,
    }
  })
