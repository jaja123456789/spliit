import { createTRPCRouter } from '@/trpc/init'
import { subscribeProcedure } from './subscribe.procedure'
import { unsubscribeProcedure } from './unsubscribe.procedure'

export const pushRouter = createTRPCRouter({
  subscribe: subscribeProcedure,
  unsubscribe: unsubscribeProcedure,
})
