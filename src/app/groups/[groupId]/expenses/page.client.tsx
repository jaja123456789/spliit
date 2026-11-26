'use client'

import BalancesAndReimbursements from '@/app/groups/[groupId]/balances/balances-and-reimbursements'
import { ActiveUserModal } from '@/app/groups/[groupId]/expenses/active-user-modal'
import { CreateFromReceiptButton } from '@/app/groups/[groupId]/expenses/create-from-receipt-button'
import { ExpenseList } from '@/app/groups/[groupId]/expenses/expense-list'
import ExportButton from '@/app/groups/[groupId]/export-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useMediaQueryAfterHydration } from '@/lib/hooks'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useCurrentGroup } from '../current-group-context'

export default function GroupExpensesPageClient({
  enableReceiptExtract,
}: {
  enableReceiptExtract: boolean
}) {
  const t = useTranslations('Expenses')
  const { groupId } = useCurrentGroup()
  const isWide = useMediaQueryAfterHydration('(min-width: 1024px)')

  return (
    <>
      {/* One sheet: header, search, then a run of ruled rows. It used to be a card whose rows were
          themselves bordered, rounded cards on anything wider than a phone — a card inside a card,
          with two competing edges around every expense.
          The add button is in the tab bar now, so the list needs no clearance of its own beyond the
          bar's, which the group layout already reserves. */}
      {/* From `lg`, two columns: the list, and the balances beside it — the question most visits
          end on — kept in view while the list scrolls. The grid is CSS, so the list's column is
          the right width from the first paint; only the panel's content waits for the client. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
        {/* `overflow-clip`, not `-hidden`: both keep the rows inside the rounded corners, but
            `hidden` makes the card a scroll container, and the month headings' `sticky` then
            stuck to the card — which never scrolls — instead of to the page. */}
        <Card bleed className="mb-4 overflow-clip">
          <CardContent className="p-0 flex flex-col gap-3 pb-4 sm:pb-6 relative min-h-[300px]">
            <ExpenseList
              enableReceiptExtract={enableReceiptExtract}
              actions={
                <>
                  {/* On a phone, export is in the tab bar's More sheet. */}
                  <span className="hidden sm:contents">
                    <ExportButton groupId={groupId} />
                  </span>
                  {/* Hidden on a phone, where add is in the bar and the form's first row is Scan
                      a receipt; still mounted, so a photo shared to the app still opens it. */}
                  {enableReceiptExtract && (
                    <span className="hidden sm:contents">
                      <CreateFromReceiptButton />
                    </span>
                  )}

                  {/* Desktop only: on a phone, add is the middle of the tab bar. */}
                  <Button
                    asChild
                    className="hidden h-10 w-10 gap-2 p-0 sm:inline-flex xl:w-auto xl:px-3"
                  >
                    <Link
                      href={`/groups/${groupId}/expenses/create`}
                      title={t('create')}
                      aria-label={t('create')}
                    >
                      <Plus className="w-4 h-4" />
                      <span className="hidden xl:inline">{t('create')}</span>
                    </Link>
                  </Button>
                </>
              }
            />
          </CardContent>
        </Card>
        <aside
          aria-label={t('balancesPanel')}
          className="hidden lg:block lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto"
        >
          {/* Mounted on wide screens only: a phone would fetch balances it never shows. */}
          {isWide && <BalancesAndReimbursements variant="panel" />}
        </aside>
      </div>

      <ActiveUserModal groupId={groupId} />
    </>
  )
}
