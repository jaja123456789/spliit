'use client'

import { Button } from '@/components/ui/button'
import { Cloud, X } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const ANNOUNCEMENT_CUTOFF = new Date('2026-03-24')
const STORAGE_KEY = 'sync-feature-dismissed'

export function SyncFeatureAnnouncement() {
  const { data: session } = useSession()
  const [isVisible, setIsVisible] = useState(false)
  const t = useTranslations('SyncAnnouncement')

  useEffect(() => {
    // Don't show if signed in
    if (session) {
      setIsVisible(false)
      return
    }

    // Check dismissal state
    const dismissed = localStorage.getItem(STORAGE_KEY)

    if (!dismissed) {
      setIsVisible(true)
      return
    }

    const dismissedDate = new Date(dismissed)
    const twoMonthsFromDismiss = new Date(dismissedDate)
    twoMonthsFromDismiss.setMonth(dismissedDate.getMonth() + 2)

    // Don't show if dismissed and either past 2 months or past cutoff
    if (
      new Date() >= twoMonthsFromDismiss ||
      new Date() >= ANNOUNCEMENT_CUTOFF
    ) {
      setIsVisible(false)
    } else {
      setIsVisible(true)
    }
  }, [session])

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString())
    setIsVisible(false)
  }

  if (!isVisible) return null

  // One line where it fits: the old banner put a title, a sentence and an inline link in three
  // places, and at phone width the link broke across two lines with Dismiss beside its second half.
  return (
    <div
      className="mb-4 flex items-center gap-3 rounded-lg border bg-card py-2 pl-3 pr-1 text-sm"
      role="status"
    >
      <Cloud className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="min-w-0 flex-1">
        {t.rich('line', { strong: (chunks) => <strong>{chunks}</strong> })}
      </p>
      <Button asChild variant="secondary" size="sm" className="shrink-0">
        <Link href="/settings">{t('actions.setUp')}</Link>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDismiss}
        className="h-9 w-9 shrink-0"
        aria-label={t('actions.dismiss')}
        title={t('actions.dismiss')}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
