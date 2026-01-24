'use client'

import { GroupForm } from '@/components/group-form'
import { trpc } from '@/trpc/client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export const CreateGroup = () => {
  const { mutateAsync } = trpc.groups.create.useMutation()
  const utils = trpc.useUtils()
  const router = useRouter()
  const { data: session } = useSession()

  const { data: preferences } = trpc.sync.getPreferences.useQuery(undefined, {
    enabled: !!session,
  })

  const addGroup = trpc.sync.addGroup.useMutation()

  return (
    <GroupForm
      onSubmit={async (groupFormValues, participantId) => {
        const { groupId } = await mutateAsync({ groupFormValues })
        await utils.groups.invalidate()

        // Auto-sync if logged in and syncNewGroups is enabled
        if (session && preferences?.syncNewGroups) {
          try {
            await addGroup.mutateAsync({
              groupId,
              isStarred: false,
              isArchived: false,
              activeParticipantId: participantId,
            })
            console.log(`Auto-synced newly created group ${groupId}`)
          } catch (error) {
            console.error('Failed to auto-sync newly created group:', error)
            // Don't block navigation on sync failure
          }
        }

        router.push(`/groups/${groupId}`)
      }}
    />
  )
}
