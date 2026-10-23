import { createTRPCRouter } from '@/trpc/init'
import { createGroupExpenseProcedure } from '@/trpc/routers/groups/expenses/create.procedure'
import { deleteGroupExpenseProcedure } from '@/trpc/routers/groups/expenses/delete.procedure'
import { getGroupExpenseFacetsProcedure } from '@/trpc/routers/groups/expenses/facets.procedure'
import { getGroupExpenseProcedure } from '@/trpc/routers/groups/expenses/get.procedure'
import { listGroupExpensesProcedure } from '@/trpc/routers/groups/expenses/list.procedure'
import { restoreGroupExpenseProcedure } from '@/trpc/routers/groups/expenses/restore.procedure'
import { getGroupExpenseShortcutsProcedure } from '@/trpc/routers/groups/expenses/shortcuts.procedure'
import { getGroupExpensesSummaryProcedure } from '@/trpc/routers/groups/expenses/summary.procedure'
import { updateGroupExpenseProcedure } from '@/trpc/routers/groups/expenses/update.procedure'

export const groupExpensesRouter = createTRPCRouter({
  list: listGroupExpensesProcedure,
  summary: getGroupExpensesSummaryProcedure,
  facets: getGroupExpenseFacetsProcedure,
  shortcuts: getGroupExpenseShortcutsProcedure,
  get: getGroupExpenseProcedure,
  create: createGroupExpenseProcedure,
  update: updateGroupExpenseProcedure,
  delete: deleteGroupExpenseProcedure,
  restore: restoreGroupExpenseProcedure,
})
