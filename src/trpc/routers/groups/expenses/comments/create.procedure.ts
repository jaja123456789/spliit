import { CommentError, createExpenseComment } from '@/lib/api'
import { baseProcedure } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const createExpenseCommentProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      expenseId: z.string().min(1),
      text: z.string().trim().min(1).max(2000),
      participantId: z.string().optional(),
    }),
  )
  .mutation(async ({ input: { groupId, expenseId, text, participantId } }) => {
    try {
      return {
        comment: await createExpenseComment(
          groupId,
          expenseId,
          text,
          participantId,
        ),
      }
    } catch (error) {
      if (error instanceof CommentError) {
        throw new TRPCError({
          code:
            error.reason === 'expenseNotFound' ? 'NOT_FOUND' : 'BAD_REQUEST',
          message: error.reason,
        })
      }
      throw error
    }
  })
