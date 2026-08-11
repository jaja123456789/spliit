'use client'

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
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  NO_ACTIVE_USER,
  hasActiveUserChoice,
  writeActiveUser,
} from '@/lib/active-user'
import { useMediaQuery, useMobilePopoverState } from '@/lib/hooks'
import { FROM_SHARE_PARAM } from '@/lib/share-target'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { ComponentProps, useEffect, useState } from 'react'

export function ActiveUserModal({ groupId }: { groupId: string }) {
  const t = useTranslations('Expenses.ActiveUserModal')
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  useMobilePopoverState(open, setOpen, isDesktop)
  const { data: groupData } = trpc.groups.get.useQuery({ groupId })

  const group = groupData?.group

  useEffect(() => {
    if (!group) return

    // A receipt arriving from the OS share sheet opens the scanner on this same page. Asking
    // "who are you?" on top of it would bury the thing the user came here to do; the question
    // keeps until their next visit.
    if (searchParams.get(FROM_SHARE_PARAM) === 'true') return
    if (!hasActiveUserChoice(group.id)) setOpen(true)
  }, [group, searchParams])

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
          <ActiveUserForm group={group} close={() => setOpen(false)} />
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

function ActiveUserForm({
  group,
  close,
  className,
}: ComponentProps<'form'> & {
  group?: AppRouterOutput['groups']['get']['group']
  close: () => void
}) {
  const t = useTranslations('Expenses.ActiveUserModal')
  const [selected, setSelected] = useState(NO_ACTIVE_USER)

  return (
    <form
      className={cn('grid items-start gap-4', className)}
      onSubmit={(event) => {
        if (!group) return

        event.preventDefault()
        writeActiveUser(group.id, selected === NO_ACTIVE_USER ? null : selected)
        close()
      }}
    >
      <RadioGroup defaultValue={NO_ACTIVE_USER} onValueChange={setSelected}>
        <div className="flex flex-col gap-4 my-4">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value={NO_ACTIVE_USER} id="none" />
            <Label htmlFor="none" className="italic font-normal flex-1">
              {t('nobody')}
            </Label>
          </div>
          {group?.participants.map((participant) => (
            <div key={participant.id} className="flex items-center space-x-2">
              <RadioGroupItem value={participant.id} id={participant.id} />
              <Label htmlFor={participant.id} className="flex-1">
                {participant.name}
              </Label>
            </div>
          ))}
        </div>
      </RadioGroup>
      <Button type="submit">{t('save')}</Button>
    </form>
  )
}
