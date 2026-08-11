'use client'

import { DeleteGroup } from '@/app/groups/[groupId]/edit/delete-group'
import { GroupForm } from '@/components/group-form'
import { trpc } from '@/trpc/client'
import { useSession } from 'next-auth/react'
import { useCurrentGroup } from '../current-group-context'

export const EditGroup = () => {
  const { groupId } = useCurrentGroup()
  const { data, isLoading } = trpc.groups.getDetails.useQuery({ groupId })
  const { mutateAsync } = trpc.groups.update.useMutation()
  const utils = trpc.useUtils()
  const { data: session } = useSession()

  // Check if group is synced
  const { data: syncedGroups } = trpc.sync.listGroups.useQuery(undefined, {
    enabled: !!session,
  })

  const updateMetadata = trpc.sync.updateMetadata.useMutation()

  if (isLoading) return <></>

  return (
    <>
      <GroupForm
        group={data?.group}
        onSubmit={async (groupFormValues, participantId) => {
          await mutateAsync({ groupId, participantId, groupFormValues })
          await utils.groups.invalidate()

          // Sync activeParticipantId to server if logged in and group is synced
          const isSynced = syncedGroups?.some(
            (sg: { groupId: string }) => sg.groupId === groupId,
          )
          if (session && isSynced && participantId) {
            updateMetadata.mutate({
              groupId,
              activeParticipantId: participantId,
            })
          }
        }}
        protectedParticipantIds={data?.participantsWithExpenses}
      />
      {data?.group && (
        <DeleteGroup groupId={groupId} groupName={data.group.name} />
      )}
    </>
  )
}
