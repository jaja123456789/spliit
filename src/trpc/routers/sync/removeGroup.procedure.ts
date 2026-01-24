import { prisma } from '@/lib/prisma'
import { protectedProcedure } from './protected'
import { removeGroupInputSchema } from './schemas'
import { hashGroupId } from './utils'

export const removeGroupProcedure = protectedProcedure
  .input(removeGroupInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { user } = ctx
    const { groupId } = input

    return await prisma.$transaction(async (tx) => {
      // Ensure SyncVisitor exists
      const visitor = await tx.syncVisitor.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      })

      // Delete SyncedGroup
      await tx.syncedGroup.deleteMany({
        where: {
          visitorId: visitor.id,
          groupId,
        },
      })

      // Calculate hash and add to omittedGroupIds (atomic operation using push)
      const groupHash = hashGroupId(groupId)

      // Use push which is atomic and won't duplicate if already exists
      await tx.syncVisitor.update({
        where: { id: visitor.id },
        data: {
          omittedGroupIds: {
            push: groupHash,
          },
        },
      })

      return { success: true }
    })
  })
