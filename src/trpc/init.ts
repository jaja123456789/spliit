import { InvalidInputError } from '@/lib/errors'
import { Prisma } from '@prisma/client'
import { TRPCError, initTRPC } from '@trpc/server'
import { cache } from 'react'
import superjson from 'superjson'

superjson.registerCustom<Prisma.Decimal, string>(
  {
    isApplicable: (v): v is Prisma.Decimal => Prisma.Decimal.isDecimal(v),
    serialize: (v) => v.toJSON(),
    deserialize: (v) => new Prisma.Decimal(v),
  },
  'decimal.js',
)

export const createTRPCContext = cache(async () => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  return {}
})

// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.create({
  /**
   * @see https://trpc.io/docs/server/data-transformers
   */
  transformer: superjson,
})

// Base router and procedure helpers
export const createTRPCRouter = t.router
/**
 * A request that is wrong in itself answers 400, not the 500 an unexpected exception gets: the
 * offline outbox retries 5xx, and would otherwise retry these forever.
 */
const invalidInputIsBadRequest = t.middleware(async ({ next }) => {
  const result = await next()
  if (!result.ok && result.error.cause instanceof InvalidInputError) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: result.error.cause.message,
      cause: result.error.cause,
    })
  }
  return result
})

export const baseProcedure = t.procedure.use(invalidInputIsBadRequest)
