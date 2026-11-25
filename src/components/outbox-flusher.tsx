'use client'
import { useToast } from '@/components/ui/use-toast'
import { isRetryableError } from '@/lib/network-error'
import {
  markOutboxError,
  onOutboxChange,
  readOutbox,
  removeFromOutbox,
} from '@/lib/outbox'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'

/** How often a waiting expense is tried again while the page stays open. */
const RETRY_INTERVAL_MS = 30_000

/**
 * Sends the expenses added offline once they can be — on load, when the browser says it is back
 * online, when the app comes back to the foreground (a phone does not always say), whenever
 * something is added to the outbox, and every half-minute while anything waits. The last two
 * matter when the browser thinks it is online and the request fails anyway: flaky Wi-Fi, or a
 * server restarting. No event says when that is over.
 *
 * Oldest first, one at a time. A failure that can pass — no network, or the server answering
 * 5xx — stops the run until the next chance; a refusal is kept on the item, which the list then
 * offers to try again or discard. Each item carries its own id, so sending it twice creates it once.
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
    // Asked for while a run was going: one more run afterwards picks up anything added meanwhile.
    // A retryable failure writes nothing, so this settles after at most one extra pass.
    let again = false
    const flush = async () => {
      if (running) {
        again = true
        return
      }
      if (!navigator.onLine) return
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
            if (isRetryableError(error)) break
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
      if (again) {
        again = false
        // Only what is new since this run: what just failed waits for the timer.
        const tried = new Set(waiting.map((item) => item.id))
        if (readOutbox().some((item) => !item.error && !tried.has(item.id)))
          flush()
      }
    }

    const whenVisible = () => {
      if (document.visibilityState === 'visible') flush()
    }
    flush()
    window.addEventListener('online', flush)
    document.addEventListener('visibilitychange', whenVisible)
    const unsubscribe = onOutboxChange(flush)
    const timer = window.setInterval(flush, RETRY_INTERVAL_MS)
    return () => {
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', whenVisible)
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [])

  return null
}
