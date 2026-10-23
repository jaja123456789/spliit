import { getExpenseShortcuts } from '@/lib/api'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const getGroupExpenseShortcutsProcedure = baseProcedure
  .input(z.object({ groupId: z.string().min(1) }))
  .query(async ({ input: { groupId } }) => ({
    shortcuts: await getExpenseShortcuts(groupId),
  }))
