'use client'
import { ToastAction } from '@/components/ui/toast'
import { useToast } from '@/components/ui/use-toast'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'

/**
 * Restores a deleted expense from the copy its deletion kept, and says how that went. Through the
 * plain client rather than a mutation hook: the toast offering it outlives the screen that deleted
 * the expense.
 */
export function useRestoreExpense(groupId: string) {
  const t = useTranslations('Expenses.Deleted')
  const { toast } = useToast()
  const utils = trpc.useUtils()

  return async ({
    activityId,
    title,
    participantId,
  }: {
    activityId: string
    title: string
    participantId?: string
  }) => {
    try {
      await utils.client.groups.expenses.restore.mutate({
        groupId,
        activityId,
        participantId,
      })
      utils.groups.invalidate()
      toast({ title: t('restored', { title }) })
    } catch {
      toast({ title: t('restoreFailed'), variant: 'destructive' })
    }
  }
}

/**
 * Deletes an expense, then offers to undo it for ten seconds. Undoing is a restore, not a delay:
 * the deletion happens at once, for everyone, and the copy it keeps is what comes back.
 */
export function useDeleteExpense(groupId: string) {
  const t = useTranslations('Expenses.Deleted')
  const { toast } = useToast()
  const utils = trpc.useUtils()
  const restore = useRestoreExpense(groupId)

  return async ({
    expenseId,
    title,
    participantId,
  }: {
    expenseId: string
    title: string
    participantId?: string
  }) => {
    let activityId: string
    try {
      ;({ activityId } = await utils.client.groups.expenses.delete.mutate({
        groupId,
        expenseId,
        participantId,
      }))
    } catch {
      // Most often already deleted, by someone else. The rejection used to go unhandled: no
      // message, and the row stayed on screen until something else refreshed the list.
      utils.groups.invalidate()
      toast({ title: t('deleteFailed'), variant: 'destructive' })
      return
    }
    utils.groups.invalidate()
    toast({
      title: t('title', { title }),
      duration: 10_000,
      action: (
        <ToastAction
          altText={t('undo')}
          onClick={() => restore({ activityId, title, participantId })}
        >
          {t('undo')}
        </ToastAction>
      ),
    })
  }
}
