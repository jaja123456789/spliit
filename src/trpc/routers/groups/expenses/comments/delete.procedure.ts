import { deleteExpenseComment } from '@/lib/api'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const deleteExpenseCommentProcedure = baseProcedure
  .input(z.object({ groupId: z.string().min(1), commentId: z.string().min(1) }))
  .mutation(async ({ input: { groupId, commentId } }) =>
    deleteExpenseComment(groupId, commentId),
  )
