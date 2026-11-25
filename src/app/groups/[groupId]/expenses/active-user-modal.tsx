'use client'

import { ProfileAvatar } from '@/components/profile-avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  forgetActiveUserIfGone,
  hasActiveUserChoice,
  seedActiveUser,
  writeActiveUser,
} from '@/lib/active-user'
import { assignAvatarHues } from '@/lib/avatar-hue'
import { useMediaQuery, useMobilePopoverState } from '@/lib/hooks'
import { FROM_SHARE_PARAM } from '@/lib/share-target'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

export function ActiveUserModal({ groupId }: { groupId: string }) {
  const t = useTranslations('Expenses.ActiveUserModal')
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  useMobilePopoverState(open, setOpen, isDesktop)
  const { data: groupData } = trpc.groups.get.useQuery({ groupId })
  const { status: sessionStatus } = useSession()
  // The same query the groups list makes, so usually already answered from its cache.
  const { data: syncedGroups, isPending: syncedPending } =
    trpc.sync.listGroups.useQuery(undefined, {
      enabled: sessionStatus === 'authenticated',
    })
  const synced = syncedGroups?.find((entry) => entry.groupId === groupId)

  const group = groupData?.group

  useEffect(() => {
    if (!group) return

    // A receipt arriving from the OS share sheet opens the scanner on this same page. Asking
    // "who are you?" on top of it would bury the thing the user came here to do; the question
    // keeps until their next visit.
    if (searchParams.get(FROM_SHARE_PARAM) === 'true') return
    const participantIds = group.participants.map((p) => p.id)
    // Someone since removed from the group is no answer: ask again.
    forgetActiveUserIfGone(group.id, participantIds)
    if (hasActiveUserChoice(group.id)) return
    // Signed in, the account may already know — answered on another device. Wait to find out
    // rather than ask a question that has an answer.
    if (sessionStatus === 'loading') return
    if (sessionStatus === 'authenticated' && syncedPending) return
    if (
      synced?.activeParticipantId &&
      participantIds.includes(synced.activeParticipantId)
    ) {
      seedActiveUser(group.id, synced.activeParticipantId)
      return
    }
    setOpen(true)
  }, [group, searchParams, sessionStatus, syncedPending, synced])

  function updateOpen(open: boolean) {
    if (!group) return

    // Dismissing without choosing still records a choice, so the modal does not reappear.
    if (!open && !hasActiveUserChoice(group.id)) writeActiveUser(group.id, null)
    setOpen(open)
  }

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={updateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>
          <ActiveUserForm
            group={group}
            synced={!!synced}
            close={() => setOpen(false)}
          />
          <DialogFooter className="sm:justify-center">
            <p className="text-sm text-center text-muted-foreground">
              {t('footer')}
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={updateOpen}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{t('title')}</DrawerTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DrawerHeader>
        <ActiveUserForm
          className="px-4"
          group={group}
          synced={!!synced}
          close={() => setOpen(false)}
        />
        <DrawerFooter className="pt-2">
          <p className="text-sm text-center text-muted-foreground">
            {t('footer')}
          </p>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

/**
 * One tap: your name, and the sheet closes. It used to be a list of radio buttons with "I don't
 * want to select anyone" already chosen and a Save button under them — two steps, with the
 * default being the answer that leaves every screen without a "you". Not choosing is still one
 * tap away, as a plain "Not now".
 */
function ActiveUserForm({
  group,
  synced,
  close,
  className,
}: {
  group?: AppRouterOutput['groups']['get']['group']
  /** Synced to the signed-in account, which then keeps the answer for the user's other devices. */
  synced: boolean
  close: () => void
  className?: string
}) {
  const t = useTranslations('Expenses.ActiveUserModal')
  const updateMetadata = trpc.sync.updateMetadata.useMutation()
  const avatarHues = assignAvatarHues(
    group?.participants.map((p) => p.name) ?? [],
  )

  const choose = (participantId: string | null) => {
    if (!group) return
    writeActiveUser(group.id, participantId)
    // Only a participant: the account has no way to say "nobody", and "nobody" is a choice
    // about this device anyway. Group Settings writes the same field.
    if (synced && participantId)
      updateMetadata.mutate({
        groupId: group.id,
        activeParticipantId: participantId,
      })
    close()
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <ul className="grid gap-1.5">
        {group?.participants.map((participant) => (
          <li key={participant.id}>
            <button
              type="button"
              onClick={() => choose(participant.id)}
              className="flex min-h-12 w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left text-base font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ProfileAvatar
                name={participant.name}
                hue={avatarHues.get(participant.name)}
                size={32}
              />
              {participant.name}
            </button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="ghost" onClick={() => choose(null)}>
        {t('notNow')}
      </Button>
    </div>
  )
}
