'use client'
import { useToast } from '@/components/ui/use-toast'
import { isNetworkError } from '@/lib/network-error'
import { markOutboxError, readOutbox, removeFromOutbox } from '@/lib/outbox'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'

/**
 * Sends the expenses added offline once there is a network again — on load, when the browser says
 * it is back online, and when the app comes back to the foreground (a phone does not always say).
 *
 * Oldest first, one at a time; a network failure stops the run until the next chance, while a
 * refusal from the server is kept on the item — retrying it would only be refused again.
 */
export function OutboxFlusher() {
  const utils = trpc.useUtils()
  const { toast } = useToast()
  const t = useTranslations('Offline')
  // Latest of each without restarting the listeners.
  const latest = useRef({ utils, toast, t })
  latest.current = { utils, toast, t }

  useEffect(() => {
    let running = false
    const flush = async () => {
      if (running || !navigator.onLine) return
      const waiting = readOutbox().filter((item) => !item.error)
      if (waiting.length === 0) return
      running = true
      const { utils, toast, t } = latest.current
      let added = 0
      try {
        for (const item of waiting) {
          try {
            await utils.client.groups.expenses.create.mutate({
              groupId: item.groupId,
              expenseFormValues: item.values,
              participantId: item.participantId,
              expenseId: item.id,
            })
            removeFromOutbox(item.id)
            added++
          } catch (error) {
            if (isNetworkError(error)) break
            markOutboxError(
              item.id,
              error instanceof Error ? error.message : String(error),
            )
          }
        }
      } finally {
        running = false
      }
      if (added > 0) {
        utils.groups.invalidate()
        toast({ title: t('flushed', { count: added }) })
      }
    }

    const whenVisible = () => {
      if (document.visibilityState === 'visible') flush()
    }
    flush()
    window.addEventListener('online', flush)
    document.addEventListener('visibilitychange', whenVisible)
    return () => {
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', whenVisible)
    }
  }, [])

  return null
}
