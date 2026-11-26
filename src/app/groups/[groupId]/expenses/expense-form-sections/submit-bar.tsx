'use client'

import { DeletePopup } from '@/components/delete-popup'
import { SubmitButton } from '@/components/submit-button'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ExpenseFormValues } from '@/lib/schemas'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { Copy, MoreHorizontal, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'
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
  const [confirmDelete, setConfirmDelete] = useState(false)
  const hasMore = !!duplicateHref || (!isCreate && !!onDelete)
  return (
    <>
      {/* Sticky on a phone: the form is still a couple of screens tall once the split is open,
            and hunting for Save at the bottom was the last thing left of the old scroll. */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-4 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
        <SubmitButton
          className="h-11 flex-1 sm:h-10 sm:flex-none"
          loadingContent={t(isCreate ? 'creating' : 'saving')}
        >
          {/* The label alone: a floppy disk said "save" to nobody under thirty, and beside
              "Create" it said nothing at all. */}
          {t(isCreate ? 'create' : 'save')}
        </SubmitButton>
        {/* From `sm`, Duplicate and Delete sit beside Save. On a phone three buttons crowded the
            bar and Delete stood as large as Save, so they wait behind a ⋯ menu there; Delete
            still asks before it acts. */}
        {duplicateHref && (
          <Button
            variant="outline"
            className="hidden h-11 sm:inline-flex sm:h-10"
            asChild
          >
            <Link href={duplicateHref}>
              <Copy className="w-4 h-4 mr-2" />
              {t('duplicate')}
            </Link>
          </Button>
        )}
        {!isCreate && onDelete && (
          <span className="hidden sm:contents">
            <DeletePopup onDelete={onDelete} />
          </span>
        )}
        {hasMore && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-11 shrink-0 p-0 sm:hidden"
                aria-label={t('moreActions')}
                data-testid="expense-form-more"
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              {duplicateHref && (
                <DropdownMenuItem asChild className="min-h-11">
                  <Link href={duplicateHref}>
                    <Copy className="mr-2 h-4 w-4" />
                    {t('duplicate')}
                  </Link>
                </DropdownMenuItem>
              )}
              {!isCreate && onDelete && (
                <DropdownMenuItem
                  className="min-h-11 text-destructive focus:text-destructive"
                  onSelect={() => setConfirmDelete(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('DeletePopup.label')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {!isCreate && onDelete && (
          <DeletePopup
            onDelete={onDelete}
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            trigger={false}
          />
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
