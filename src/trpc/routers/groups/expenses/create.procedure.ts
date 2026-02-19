import { createExpense } from '@/lib/api'
import { expenseFormSchema } from '@/lib/schemas'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const createGroupExpenseProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      expenseFormValues: expenseFormSchema,
      participantId: z.string().optional(),
    }),
  )
  .mutation(
    async ({ input: { groupId, expenseFormValues, participantId } }) => {
      const cleanedPayers = expenseFormValues.paidBy.filter(
        (p) => Number(p.amount) !== 0,
      )
      expenseFormValues.paidBy =
        cleanedPayers.length > 0 ? cleanedPayers : [expenseFormValues.paidBy[0]] // Keep at least one to satisfy Zod
      const expense = await createExpense(
        expenseFormValues,
        groupId,
        participantId,
      )
      return { expenseId: expense.id }
    },
  )
