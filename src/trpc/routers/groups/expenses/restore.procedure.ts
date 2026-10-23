import { RestoreExpenseError, restoreExpense } from '@/lib/api'
import { baseProcedure } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const restoreGroupExpenseProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      /** The deletion's activity entry. */
      activityId: z.string().min(1),
      participantId: z.string().optional(),
    }),
  )
  .mutation(async ({ input: { groupId, activityId, participantId } }) => {
    try {
      return await restoreExpense(groupId, activityId, participantId)
    } catch (error) {
      if (error instanceof RestoreExpenseError) {
        throw new TRPCError({
          code: error.reason === 'participantGone' ? 'CONFLICT' : 'NOT_FOUND',
          message: error.reason,
        })
      }
      throw error
    }
  })
