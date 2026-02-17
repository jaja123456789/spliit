import { categoriesRouter } from '@/trpc/routers/categories'
import { groupsRouter } from '@/trpc/routers/groups'
import { syncRouter } from '@/trpc/routers/sync'
import { inferRouterOutputs } from '@trpc/server'
import { createTRPCRouter } from '../init'
import { pushRouter } from '@/trpc/routers/push'


export const appRouter = createTRPCRouter({
  groups: groupsRouter,
  categories: categoriesRouter,
  sync: syncRouter,
  push: pushRouter,
})

export type AppRouter = typeof appRouter
export type AppRouterOutput = inferRouterOutputs<AppRouter>
