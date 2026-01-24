import { getServerSession } from '@/lib/auth'
import { baseProcedure } from '@/trpc/init'
import { TRPCError } from '@trpc/server'

/**
 * Protected procedure that requires authentication
 * Throws UNAUTHORIZED error if user is not logged in
 */
export const protectedProcedure = baseProcedure.use(async ({ next }) => {
  const session = await getServerSession()

  if (!session?.user?.email || !session?.user?.id) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to perform this action',
    })
  }

  return next({
    ctx: {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
    },
  })
})
