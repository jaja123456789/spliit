import { createPayments } from '@/lib/api'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

/**
 * Records a batch of payments in one transaction.
 *
 * The UI offers "settle everything" as a single action, so it has to behave like one: either every
 * suggested payment is recorded or none is. Looping `expenses.create` on the client would leave a
 * partially settled group behind on the first failure, with nothing on screen saying which of the
 * payments went through.
 */
export const settlePaymentsProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      participantId: z.string().optional(),
      // The day as the person settling sees it. The server's own clock is the wrong calendar for a
      // date-only field: in Europe after midnight its UTC date is still yesterday.
      date: z.coerce.date().optional(),
      payments: z
        .array(
          z.object({
            from: z.string().min(1),
            to: z.string().min(1),
            // Minor units, matching the balances these come from.
            amount: z.number().int().positive(),
            title: z.string().min(1),
          }),
        )
        .min(1),
    }),
  )
  .mutation(async ({ input: { groupId, payments, participantId, date } }) => {
    const expenseIds = await createPayments(
      groupId,
      payments,
      participantId,
      date,
    )
    return { expenseIds }
  })
