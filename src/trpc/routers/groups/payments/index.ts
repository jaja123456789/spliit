import { createTRPCRouter } from '@/trpc/init'
import { settlePaymentsProcedure } from '@/trpc/routers/groups/payments/settle.procedure'

export const groupPaymentsRouter = createTRPCRouter({
  settle: settlePaymentsProcedure,
})
