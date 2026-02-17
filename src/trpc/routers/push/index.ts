import { createTRPCRouter } from '@/trpc/init'
import { subscribeProcedure } from './subscribe.procedure'

export const pushRouter = createTRPCRouter({
  subscribe: subscribeProcedure,
})