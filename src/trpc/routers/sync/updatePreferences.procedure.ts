import { prisma } from '@/lib/prisma'
import { protectedProcedure } from './protected'
import { updatePreferencesInputSchema } from './schemas'

export const updatePreferencesProcedure = protectedProcedure
  .input(updatePreferencesInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { user } = ctx
    const { syncNewGroups } = input

    // Ensure SyncVisitor exists
    const visitor = await prisma.syncVisitor.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    })

    // Build update data with only provided fields
    const updateData: {
      syncNewGroups?: boolean
    } = {}

    if (syncNewGroups !== undefined) updateData.syncNewGroups = syncNewGroups

    // Upsert preferences
    const preferences = await prisma.syncPreferences.upsert({
      where: { visitorId: visitor.id },
      create: {
        visitorId: visitor.id,
        syncNewGroups: syncNewGroups ?? false,
      },
      update: updateData,
    })

    return {
      syncNewGroups: preferences.syncNewGroups,
    }
  })
