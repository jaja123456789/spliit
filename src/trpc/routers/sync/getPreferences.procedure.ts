import { prisma } from '@/lib/prisma'
import { protectedProcedure } from './protected'

export const getPreferencesProcedure = protectedProcedure.query(
  async ({ ctx }) => {
    const { user } = ctx

    // Ensure SyncVisitor exists
    const visitor = await prisma.syncVisitor.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    })

    // Get preferences or return defaults
    const preferences = await prisma.syncPreferences.findUnique({
      where: { visitorId: visitor.id },
    })

    return {
      syncExisting: preferences?.syncExisting ?? false,
      syncNewGroups: preferences?.syncNewGroups ?? false,
    }
  },
)
