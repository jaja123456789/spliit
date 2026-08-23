import { createTRPCRouter } from '@/trpc/init'
import { listGroupPaymentsProcedure } from '@/trpc/routers/groups/payments/list.procedure'
import { settlePaymentsProcedure } from '@/trpc/routers/groups/payments/settle.procedure'

export const groupPaymentsRouter = createTRPCRouter({
  list: listGroupPaymentsProcedure,
  settle: settlePaymentsProcedure,
})
