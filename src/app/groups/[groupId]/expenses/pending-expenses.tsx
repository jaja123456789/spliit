'use client'
import { useEnv } from '@/components/env-provider'
import { Money } from '@/components/money'
import { Button } from '@/components/ui/button'
import { Currency } from '@/lib/currency'
import { OutboxItem, clearOutboxError, removeFromOutbox } from '@/lib/outbox'
import { amountAsMinorUnits } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { CloudOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { useCurrentGroup } from '../current-group-context'

/**
 * Expenses added on this device without a network, above the list until they are sent. They are
 * not in the totals or the balances yet — those come from the server — which is why they sit apart
 * from the rows that are.
 */
export function PendingExpenses({
  items,
  currency,
}: {
  items: OutboxItem[]
  currency: Currency
}) {
  const t = useTranslations('Offline')
  const { group } = useCurrentGroup()
  const nameOf = (participantId: string) =>
    group?.participants.find((p) => p.id === participantId)?.name ?? ''

  return (
    <section aria-labelledby="pending-expenses">
      <h3
        id="pending-expenses"
        className="section-label px-4 sm:px-6 pt-4 pb-1.5"
      >
        {t('pendingTitle')}
      </h3>
      {items.map((item) => (
        <div
          key={item.id}
          data-testid={`pending-expense-${item.id}`}
          className="flex items-start gap-3 border-b bg-muted/30 px-4 py-3.5 text-sm sm:px-6"
        >
          <CloudOff
            className="mt-1 h-4 w-4 shrink-0 text-subtle-foreground"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <div className="truncate text-base font-medium">
                {item.values.title}
              </div>
              <Money
                currency={currency}
                amount={amountAsMinorUnits(
                  Number(item.values.amount),
                  currency,
                )}
                className="shrink-0 text-base"
              />
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                {item.error
                  ? t('pendingError', { error: item.error })
                  : `${t('pending')} · ${nameOf(
                      item.values.paidBy[0]?.participant,
                    )}`}
              </span>
              {item.error && (
                <span className="flex shrink-0 gap-3">
                  {/* A refusal can still be worth another go: a participant restored, a group
                      setting changed back. Back in line, the next flush sends it. */}
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => clearOutboxError(item.id)}
                  >
                    {t('retry')}
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => removeFromOutbox(item.id)}
                  >
                    {t('discard')}
                  </Button>
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </section>
  )
}

/**
 * While online, makes sure this group can be added to offline later: the service worker saves the
 * create screen and the code it loads, and the two things that screen waits for — the categories
 * and the shortcuts — are asked for here, so the worker has an answer saved for each.
 */
export function useWarmOffline(groupId: string) {
  const utils = trpc.useUtils()
  const { NEXT_PUBLIC_BASE_PATH } = useEnv()

  useEffect(() => {
    if (!navigator.onLine || !('serviceWorker' in navigator)) return
    // Once per group per session: saving the create screen means the server rendering it, which
    // is not worth repeating on every visit to the list.
    const key = `spliit-warmed-${groupId}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      // No session storage: warm every time rather than never.
    }
    navigator.serviceWorker.ready.then(
      (registration) =>
        registration.active?.postMessage({
          type: 'warm',
          urls: [`${NEXT_PUBLIC_BASE_PATH}/groups/${groupId}/expenses/create`],
        }),
    )
    utils.categories.list.prefetch()
    utils.groups.expenses.shortcuts.prefetch({ groupId })
  }, [groupId, utils, NEXT_PUBLIC_BASE_PATH])
}
