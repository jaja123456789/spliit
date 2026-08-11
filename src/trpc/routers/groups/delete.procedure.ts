import { deleteGroup, getGroup } from '@/lib/api'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const deleteGroupProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      /**
       * The group's own name, typed by the user. This is not access control — anyone holding the
       * group link can already delete every expense in it — it is a guard against deleting the
       * wrong group, which is the realistic mistake when several are open.
       */
      confirmationName: z.string(),
    }),
  )
  .mutation(async ({ input: { groupId, confirmationName } }) => {
    const group = await getGroup(groupId)
    if (!group) throw new Error(`Invalid group ID: ${groupId}`)
    if (group.name.trim() !== confirmationName.trim()) {
      throw new Error('The typed name does not match this group')
    }

    await deleteGroup(groupId)
    return { success: true }
  })
