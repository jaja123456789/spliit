import { createTRPCRouter } from '@/trpc/init'
import { createExpenseCommentProcedure } from '@/trpc/routers/groups/expenses/comments/create.procedure'
import { deleteExpenseCommentProcedure } from '@/trpc/routers/groups/expenses/comments/delete.procedure'
import { listExpenseCommentsProcedure } from '@/trpc/routers/groups/expenses/comments/list.procedure'

export const expenseCommentsRouter = createTRPCRouter({
  list: listExpenseCommentsProcedure,
  create: createExpenseCommentProcedure,
  delete: deleteExpenseCommentProcedure,
})
