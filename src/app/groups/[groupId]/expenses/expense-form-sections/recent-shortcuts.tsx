'use client'

import { Money } from '@/components/money'
import { Currency } from '@/lib/currency'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

/**
 * The expenses this group keeps entering, as a row of chips on an empty form. Picking one starts
 * the form over as a copy of its latest instance — "groceries, same as always" in one tap, then
 * the amount.
 *
 * It replaces the address rather than pushing to it, so Back still leaves the form, and it only
 * shows while the form is untouched (see the caller): a chip would otherwise throw away whatever
 * had been typed.
 */
export function RecentShortcuts({
  groupId,
  currency,
}: {
  groupId: string
  currency: Currency
}) {
  const t = useTranslations('ExpenseForm.Shortcuts')
  const router = useRouter()
  const { data } = trpc.groups.expenses.shortcuts.useQuery({ groupId })
  const shortcuts = data?.shortcuts ?? []
  if (shortcuts.length === 0) return null

  return (
    <div className="-mb-2 flex flex-col gap-2" data-testid="expense-shortcuts">
      <p className="text-xs text-muted-foreground">{t('label')}</p>
      {/* One scrolling line on a phone, so it never pushes the title down more than a row. */}
      <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {shortcuts.map((shortcut) => (
          <button
            key={shortcut.expenseId}
            type="button"
            onClick={() =>
              router.replace(
                `/groups/${groupId}/expenses/create?duplicate=${shortcut.expenseId}`,
              )
            }
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 h-8 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="max-w-[12rem] truncate">{shortcut.title}</span>
            <Money
              currency={currency}
              amount={shortcut.amount}
              className="text-xs text-muted-foreground"
            />
          </button>
        ))}
      </div>
    </div>
  )
}
