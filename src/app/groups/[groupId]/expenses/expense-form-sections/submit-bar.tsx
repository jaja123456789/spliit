'use client'

import { DeletePopup } from '@/components/delete-popup'
import { SubmitButton } from '@/components/submit-button'
import { Button } from '@/components/ui/button'
import { ExpenseFormValues } from '@/lib/schemas'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { Copy, Save } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { UseFormReturn } from 'react-hook-form'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>
type Form = UseFormReturn<ExpenseFormValues>
type Wording = 'Expense' | 'Income'

export function SubmitBar({
  isCreate,
  duplicateHref,
  onDelete,
}: {
  isCreate: boolean
  /** Where a copy of this expense starts — the create form, filled in from it. */
  duplicateHref?: string
  onDelete?: () => Promise<void>
}) {
  const t = useTranslations('ExpenseForm')
  return (
    <>
      {/* Sticky on a phone: the form is still a couple of screens tall once the split is open,
            and hunting for Save at the bottom was the last thing left of the old scroll. */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-4 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
        <SubmitButton
          className="h-11 flex-1 sm:h-10 sm:flex-none"
          loadingContent={t(isCreate ? 'creating' : 'saving')}
        >
          <Save className="w-4 h-4 mr-2" />
          {t(isCreate ? 'create' : 'save')}
        </SubmitButton>
        {duplicateHref && (
          <Button variant="outline" className="h-11 sm:h-10" asChild>
            <Link href={duplicateHref}>
              <Copy className="w-4 h-4 mr-2" />
              {t('duplicate')}
            </Link>
          </Button>
        )}
        {!isCreate && onDelete && (
          <DeletePopup onDelete={onDelete}></DeletePopup>
        )}
        {/* Cancel is gone. It duplicated the exit the chevron and the device's own back
              button already are, and it was the only one of the three that threw the draft away —
              so the same gesture meant "keep this" or "lose it" depending on which of two
              adjacent controls you reached for. Leaving now always keeps; discarding is offered
              on the way back in, on the banner that says a draft was found. */}
      </div>
    </>
  )
}
