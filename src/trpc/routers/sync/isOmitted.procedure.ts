import { prisma } from '@/lib/prisma'
import { protectedProcedure } from './protected'
import { isOmittedInputSchema } from './schemas'
import { hashGroupId } from './utils'

export const isOmittedProcedure = protectedProcedure
  .input(isOmittedInputSchema)
  .query(async ({ ctx, input }) => {
    const { user } = ctx
    const { groupId } = input

    // Ensure SyncProfile exists
    const syncProfile = await prisma.syncProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    })

    // Check if hash is in omittedGroupIds
    const groupHash = hashGroupId(groupId)
    const omitted = syncProfile.omittedGroupIds.includes(groupHash)

    return { omitted }
  })
