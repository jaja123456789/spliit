'use client'

import BalancesAndReimbursements from '@/app/groups/[groupId]/balances/balances-and-reimbursements'
import { ActiveUserModal } from '@/app/groups/[groupId]/expenses/active-user-modal'
import { CreateFromReceiptButton } from '@/app/groups/[groupId]/expenses/create-from-receipt-button'
import { ExpenseList } from '@/app/groups/[groupId]/expenses/expense-list'
import ExportButton from '@/app/groups/[groupId]/export-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useMediaQueryAfterHydration } from '@/lib/hooks'
import { cn } from '@/lib/utils' // Import cn
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useState } from 'react' // Import react hooks
import { useCurrentGroup } from '../current-group-context'

export default function GroupExpensesPageClient({
  enableReceiptExtract,
}: {
  enableReceiptExtract: boolean
}) {
  const t = useTranslations('Expenses')
  const { groupId } = useCurrentGroup()
  const isWide = useMediaQueryAfterHydration('(min-width: 1024px)')
  const [isScrolled, setIsScrolled] = useState(false)

  // Detect scroll to show shadow on sticky headers if implemented,
  // or simply to handle FAB visibility interactions if needed later.
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <>
      {/* One sheet: header, search, then a run of ruled rows. It used to be a card whose rows were
          themselves bordered, rounded cards on anything wider than a phone — a card inside a card,
          with two competing edges around every expense.
          `mb-20` is load-bearing on mobile: it is the clearance that stops the FAB covering the
          last row. */}
      {/* From `lg`, two columns: the list, and the balances beside it — the question most visits
          end on — kept in view while the list scrolls. The grid is CSS, so the list's column is
          the right width from the first paint; only the panel's content waits for the client. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
        {/* `overflow-clip`, not `-hidden`: both keep the rows inside the rounded corners, but
            `hidden` makes the card a scroll container, and the month headings' `sticky` then
            stuck to the card — which never scrolls — instead of to the page. */}
        <Card bleed className="mb-20 sm:mb-4 overflow-clip">
          <CardContent className="p-0 flex flex-col gap-3 pb-4 sm:pb-6 relative min-h-[300px]">
            <ExpenseList
              enableReceiptExtract={enableReceiptExtract}
              actions={
                <>
                  <ExportButton groupId={groupId} />
                  {enableReceiptExtract && <CreateFromReceiptButton />}

                  {/* Desktop Add Button (hidden on mobile to favor FAB) */}
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
          className="hidden lg:block lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto"
        >
          {/* Mounted on wide screens only: a phone would fetch balances it never shows. */}
          {isWide && <BalancesAndReimbursements variant="panel" />}
        </aside>
      </div>

      {/* Mobile Floating Action Button (FAB) */}
      {/* Above the tab bar, not on it: the bar is 3.5rem plus the home indicator, and this
          keeps a 1rem gap over it. */}
      <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-6 z-40 sm:hidden">
        <Button
          asChild
          size="icon"
          className={cn(
            'h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 transition-transform active:scale-95',
            'border-2 border-background', // Contrast border
          )}
        >
          <Link href={`/groups/${groupId}/expenses/create`} title={t('create')}>
            <Plus className="w-8 h-8" />
          </Link>
        </Button>
      </div>

      <ActiveUserModal groupId={groupId} />
    </>
  )
}
