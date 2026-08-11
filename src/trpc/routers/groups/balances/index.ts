import { createTRPCRouter } from '@/trpc/init'
import { balancesForGroupsProcedure } from '@/trpc/routers/groups/balances/forGroups.procedure'
import { listGroupBalancesProcedure } from '@/trpc/routers/groups/balances/list.procedure'

export const groupBalancesRouter = createTRPCRouter({
  list: listGroupBalancesProcedure,
  forGroups: balancesForGroupsProcedure,
})
