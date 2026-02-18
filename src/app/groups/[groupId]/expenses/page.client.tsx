'use client'

import { ActiveUserModal } from '@/app/groups/[groupId]/expenses/active-user-modal'
import { CreateFromReceiptButton } from '@/app/groups/[groupId]/expenses/create-from-receipt-button'
import { ExpenseList } from '@/app/groups/[groupId]/expenses/expense-list'
import ExportButton from '@/app/groups/[groupId]/export-button'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Plus } from 'lucide-react'
import { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useCurrentGroup } from '../current-group-context'
import { cn } from '@/lib/utils' // Import cn
import { useState, useEffect } from 'react' // Import react hooks

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
      <Card className="mb-20 sm:mb-4 rounded-none -mx-4 border-x-0 sm:border-x sm:rounded-lg sm:mx-0 shadow-sm">
        <div className="flex flex-1 items-center justify-between pr-4 sm:pr-6">
          <CardHeader className="flex-1 p-4 sm:p-6">
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </CardHeader>
          
          {/* Desktop Toolbar */}
          <div className="flex flex-row space-x-2">
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
          </div>
        </div>

        <CardContent className="p-0 pt-0 pb-4 sm:pb-6 flex flex-col gap-4 relative min-h-[300px]">
          <ExpenseList />
        </CardContent>
      </Card>

      {/* Mobile Floating Action Button (FAB) */}
      <div className="fixed bottom-6 right-6 z-40 sm:hidden">
        <Button
          asChild
          size="icon"
          className={cn(
            "h-14 w-14 rounded-full shadow-xl bg-primary hover:bg-primary/90 transition-transform active:scale-95",
            "border-2 border-background" // Contrast border
          )}
        >
          <Link
            href={`/groups/${groupId}/expenses/create`}
            title={t('create')}
          >
            <Plus className="w-8 h-8" />
          </Link>
        </Button>
      </div>

      <ActiveUserModal groupId={groupId} />
    </>
  )
}