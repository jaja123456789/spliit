import { prisma } from '@/lib/prisma'
import { protectedProcedure } from '@/trpc/routers/sync/protected'
import { z } from 'zod'

export const unsubscribeProcedure = protectedProcedure
  .input(z.object({ endpoint: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // Only your own: any signed-in user who knew another's endpoint could switch their
    // notifications off.
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: input.endpoint, userId: ctx.user.id },
    })
    return { success: true }
  })
