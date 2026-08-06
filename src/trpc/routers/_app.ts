import { categoriesRouter } from '@/trpc/routers/categories'
import { groupsRouter } from '@/trpc/routers/groups'
import { mcpRouter } from '@/trpc/routers/mcp'
import { pushRouter } from '@/trpc/routers/push'
import { syncRouter } from '@/trpc/routers/sync'
import { inferRouterOutputs } from '@trpc/server'
import { createTRPCRouter } from '../init'

export const appRouter = createTRPCRouter({
  groups: groupsRouter,
  categories: categoriesRouter,
  sync: syncRouter,
  push: pushRouter,
  mcp: mcpRouter,
})

export type AppRouter = typeof appRouter
export type AppRouterOutput = inferRouterOutputs<AppRouter>
