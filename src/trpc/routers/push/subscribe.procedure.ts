import { prisma } from '@/lib/prisma'
import { protectedProcedure } from '@/trpc/routers/sync/protected'
import { z } from 'zod'

export const subscribeProcedure = protectedProcedure
  .input(
    z.object({
      endpoint: z.string(),
      keys: z.object({
        p256dh: z.string(),
        auth: z.string(),
      }),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const { user } = ctx
    await prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userId: user.id,
      },
      update: {
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userId: user.id, // Update user ownership if it changed
      },
    })
    return { success: true }
  })
