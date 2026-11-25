'use client'

import { DeleteGroup } from '@/app/groups/[groupId]/edit/delete-group'
import { GroupForm } from '@/components/group-form'
import { useToast } from '@/components/ui/use-toast'
import { trpc } from '@/trpc/client'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useCurrentGroup } from '../current-group-context'

export const EditGroup = () => {
  const { groupId } = useCurrentGroup()
  const { data, isLoading } = trpc.groups.getDetails.useQuery({ groupId })
  const { mutateAsync } = trpc.groups.update.useMutation()
  const utils = trpc.useUtils()
  const { data: session } = useSession()
  const { toast } = useToast()
  const t = useTranslations('GroupForm.SaveErrors')
  // The form reads the group once, as its defaults. Bumped after every save so the form is rebuilt
  // from what was saved: a participant added here only gets an id on the server, and a form still
  // holding them without one would delete and re-create them — shares and all — on the next save.
  const [savedCount, setSavedCount] = useState(0)

  // Check if group is synced
  const { data: syncedGroups } = trpc.sync.listGroups.useQuery(undefined, {
    enabled: !!session,
  })

  const updateMetadata = trpc.sync.updateMetadata.useMutation()

  if (isLoading) return <></>

  return (
    <>
      <GroupForm
        key={savedCount}
        group={data?.group}
        onSubmit={async (groupFormValues, participantId) => {
          try {
            await mutateAsync({ groupId, participantId, groupFormValues })
          } catch (error) {
            const reason = (error as { message?: string })?.message
            toast({
              title:
                reason === 'participantHasExpenses'
                  ? t('participantHasExpenses')
                  : t('generic'),
              variant: 'destructive',
            })
            return
          }
          // Awaited: it refetches the details before the form is rebuilt from them.
          await utils.groups.invalidate()
          setSavedCount((count) => count + 1)

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
