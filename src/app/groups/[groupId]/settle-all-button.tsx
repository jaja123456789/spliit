'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Reimbursement } from '@/lib/balances'
import { todayAsDateOnly } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { Participant } from '@prisma/client'
import { Check, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

/**
 * Records every suggested payment at once.
 *
 * Owing three people meant three trips through the form. The reason this is a single button and not
 * a loop over the existing create mutation is that it has to be able to fail as one thing:
 * `groups.payments.settle` writes them inside a transaction, so a failure leaves the group exactly
 * as it was rather than partly settled with nothing on screen saying how far it got.
 *
 * It asks first. Recording several payments is easy to trigger and tedious to unpick — each one
 * would have to be found in the expense list and deleted individually.
 */
export function SettleAllButton({
  groupId,
  reimbursements,
  participants,
  activeUserId,
}: {
  groupId: string
  reimbursements: Reimbursement[]
  participants: Participant[]
  activeUserId?: string | null
}) {
  const t = useTranslations('Payment')
  const tDefault = useTranslations('Payment')
  const utils = trpc.useUtils()
  const { toast } = useToast()
  const { mutateAsync } = trpc.groups.payments.settle.useMutation()
  const [isSettling, setIsSettling] = useState(false)
  const [open, setOpen] = useState(false)

  // One suggestion is not a batch — the row's own button already does it in one tap.
  if (reimbursements.length < 2) return null

  const nameOf = (id: string) =>
    participants.find((p) => p.id === id)?.name ?? ''

  const settle = async () => {
    setIsSettling(true)
    try {
      await mutateAsync({
        groupId,
        participantId: activeUserId ?? undefined,
        date: todayAsDateOnly(),
        payments: reimbursements.map((r) => ({
          from: r.from,
          to: r.to,
          amount: r.amount,
          title: tDefault('defaultTitle', {
            from: nameOf(r.from),
            to: nameOf(r.to),
          }),
        })),
      })
      utils.groups.expenses.invalidate()
      utils.groups.balances.invalidate()
      utils.groups.payments.invalidate()
      setOpen(false)
    } catch {
      // The write is transactional, so "nothing was recorded" is a promise the server can keep.
      toast({ description: t('settleAllFailed'), variant: 'destructive' })
    } finally {
      setIsSettling(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          data-testid="settle-all"
        >
          <Check className="mr-1.5 h-3.5 w-3.5" />
          {t('settleAll', { count: reimbursements.length })}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('settleAllConfirmTitle', { count: reimbursements.length })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('settleAllConfirmBody')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSettling}>
            {t('settleAllCancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="settle-all-confirm"
            disabled={isSettling}
            onClick={(event) => {
              // Keep the dialog up while the write is in flight, so the confirmation cannot be
              // pressed twice on a slow connection.
              event.preventDefault()
              settle()
            }}
          >
            {isSettling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('settleAllConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
