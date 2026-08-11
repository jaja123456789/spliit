import { getBalancesForGroups } from '@/lib/api'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

/**
 * Balances across several groups at once, for the group list.
 *
 * Which participant "you" are lives in per-device local storage, so the client has to say — which
 * is also why a group where you never picked yourself simply returns nothing here.
 */
export const balancesForGroupsProcedure = baseProcedure
  .input(
    z.object({
      groups: z
        .array(
          z.object({
            groupId: z.string().min(1),
            participantId: z.string().min(1),
          }),
        )
        .max(200),
    }),
  )
  .query(async ({ input: { groups } }) => {
    return { balances: await getBalancesForGroups(groups) }
  })
