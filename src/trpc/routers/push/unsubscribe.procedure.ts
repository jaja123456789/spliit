import { prisma } from '@/lib/prisma'
import { protectedProcedure } from '@/trpc/routers/sync/protected'
import { z } from 'zod'

export const unsubscribeProcedure = protectedProcedure
  .input(z.object({ endpoint: z.string() }))
  .mutation(async ({ input }) => {
    // Delete the subscription with this specific endpoint
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: input.endpoint },
    })
    return { success: true }
  })
