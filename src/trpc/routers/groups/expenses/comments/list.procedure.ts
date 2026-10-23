import { getExpenseComments } from '@/lib/api'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const listExpenseCommentsProcedure = baseProcedure
  .input(z.object({ groupId: z.string().min(1), expenseId: z.string().min(1) }))
  .query(async ({ input: { groupId, expenseId } }) => ({
    comments: await getExpenseComments(groupId, expenseId),
  }))
