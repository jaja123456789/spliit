'use client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { useGroupActions } from '@/contexts'
import { activeUserStorageKey } from '@/lib/active-user'
import { trpc } from '@/trpc/client'
import { Loader2, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Deleting a group takes everyone's copy with it — including the synced copy on other people's
 * profiles — and there is no undo. Hence typing the name rather than a plain "are you sure": the
 * realistic mistake is deleting the wrong group, not deleting one by accident.
 */
export function DeleteGroup({
  groupId,
  groupName,
}: {
  groupId: string
  groupName: string
}) {
  const t = useTranslations('GroupForm.DangerZone')
  const router = useRouter()
  const { toast } = useToast()
  const { deleteRecentGroup } = useGroupActions()
  const utils = trpc.useUtils()
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const { mutateAsync } = trpc.groups.delete.useMutation()

  const matches = typed.trim() === groupName.trim()

  const handleDelete = async () => {
    setPending(true)
    try {
      await mutateAsync({ groupId, confirmationName: typed })
      // Drop every local trace, so the group does not linger on this device as a card pointing at
      // a page that now 404s.
      deleteRecentGroup(groupId)
      localStorage.removeItem(activeUserStorageKey(groupId))
      localStorage.removeItem(`${groupId}-defaultSplittingOptions`)
      await utils.groups.invalidate()
      toast({ title: t('deletedToast', { name: groupName }) })
      router.push('/groups')
    } catch (error) {
      toast({
        title: t('errorToast'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
      setPending(false)
    }
  }

  return (
    <Card bleed className="mb-4 border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog
          onOpenChange={(open) => {
            if (!open) setTyped('')
          }}
        >
          <DialogTrigger asChild>
            <Button variant="destructive" type="button">
              <Trash2 className="w-4 h-4 mr-2" />
              {t('deleteGroup')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('confirmDescription', { name: groupName })}
            </DialogDescription>
            <div className="space-y-2">
              <Label htmlFor="delete-group-confirm">
                {t('confirmLabel', { name: groupName })}
              </Label>
              <Input
                id="delete-group-confirm"
                className="text-base sm:text-base"
                autoComplete="off"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
            </div>
            <DialogFooter className="flex flex-col gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={!matches || pending}
                onClick={handleDelete}
              >
                {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('confirmDelete')}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t('cancel')}
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
