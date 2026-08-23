'use client'

import { ActiveUserModal } from '@/app/groups/[groupId]/expenses/active-user-modal'
import { CreateFromReceiptButton } from '@/app/groups/[groupId]/expenses/create-from-receipt-button'
import { ExpenseList } from '@/app/groups/[groupId]/expenses/expense-list'
import ExportButton from '@/app/groups/[groupId]/export-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils' // Import cn
import { Plus } from 'lucide-react'
import { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useState } from 'react' // Import react hooks
import { useCurrentGroup } from '../current-group-context'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Expenses',
}

export default function GroupExpensesPageClient({
  enableReceiptExtract,
}: {
  enableReceiptExtract: boolean
}) {
  const t = useTranslations('Expenses')
  const { groupId } = useCurrentGroup()
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
      <Card bleed className="mb-20 sm:mb-4 overflow-hidden">
        <CardContent className="p-0 flex flex-col gap-3 pb-4 sm:pb-6 relative min-h-[300px]">
          <ExpenseList
            actions={
              <>
                <ExportButton groupId={groupId} />
                {enableReceiptExtract && <CreateFromReceiptButton />}

                {/* Desktop Add Button (hidden on mobile to favor FAB) */}
                <Button asChild size="icon" className="hidden sm:inline-flex">
                  <Link
                    href={`/groups/${groupId}/expenses/create`}
                    title={t('create')}
                  >
                    <Plus className="w-4 h-4" />
                  </Link>
                </Button>
              </>
            }
          />
        </CardContent>
      </Card>

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
