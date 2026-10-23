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
      /**
       * Chosen by the client so that sending the same expense twice creates it once: an expense
       * added offline is retried from the outbox until an answer gets back.
       */
      expenseId: z
        .string()
        .regex(/^[A-Za-z0-9_-]{10,40}$/)
        .optional(),
    }),
  )
  .mutation(
    async ({
      input: { groupId, expenseFormValues, participantId, expenseId },
    }) => {
      const cleanedPayers = expenseFormValues.paidBy.filter(
        (p) => Number(p.amount) !== 0,
      )
      expenseFormValues.paidBy =
        cleanedPayers.length > 0 ? cleanedPayers : [expenseFormValues.paidBy[0]] // Keep at least one to satisfy Zod
      const expense = await createExpense(
        expenseFormValues,
        groupId,
        participantId,
        { expenseId },
      )
      return { expenseId: expense.id }
    },
  )
