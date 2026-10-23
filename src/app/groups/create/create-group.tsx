'use client'

import { GroupForm } from '@/components/group-form'
import { useGroupActions } from '@/contexts'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

export const CreateGroup = () => {
  const { mutateAsync } = trpc.groups.create.useMutation()
  const utils = trpc.useUtils()
  const router = useRouter()
  const { saveRecentGroup } = useGroupActions()
  const t = useTranslations('GroupForm')

  // The screen said what it was only in the browser tab: on a phone it opened straight onto the
  // first card's "Group information".
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{t('createTitle')}</h1>
      <GroupForm
        onSubmit={async (groupFormValues, participantId) => {
          const { groupId } = await mutateAsync({ groupFormValues })
          await utils.groups.invalidate()

          // Save to recent groups - context handles auto-sync if conditions met
          await saveRecentGroup({ id: groupId, name: groupFormValues.name })

          router.push(`/groups/${groupId}`)
        }}
      />
    </>
  )
}
