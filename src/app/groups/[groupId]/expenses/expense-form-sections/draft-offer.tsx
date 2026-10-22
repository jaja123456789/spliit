'use client'

import { ExpenseFormValues } from '@/lib/schemas'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { useTranslations } from 'next-intl'
import { UseFormReturn } from 'react-hook-form'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>
type Form = UseFormReturn<ExpenseFormValues>
type Wording = 'Expense' | 'Income'

/** Says a draft of this expense was found, and offers it back. */
export function DraftOffer({
  onRestore,
  onDiscard,
}: {
  onRestore: () => void
  onDiscard: () => void
}) {
  const t = useTranslations('ExpenseForm')
  return (
    <div
      data-testid="draft-offer"
      className="mb-3 flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
    >
      <span className="min-w-0 truncate">{t('Draft.found')}</span>
      <span className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          data-testid="draft-restore"
          className="font-medium text-primary underline-offset-2 hover:underline"
          onClick={onRestore}
        >
          {t('Draft.restore')}
        </button>
        <button
          type="button"
          data-testid="draft-discard"
          className="underline-offset-2 hover:underline"
          onClick={onDiscard}
        >
          {t('Draft.discard')}
        </button>
      </span>
    </div>
  )
}
