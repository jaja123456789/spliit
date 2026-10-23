'use client'
import { useOnline } from '@/lib/hooks'
import { CloudOff } from 'lucide-react'
import { useTranslations } from 'next-intl'

/** Says the app is offline, and what that means here: saved pages, and adds that will wait. */
export function OfflineBanner() {
  const t = useTranslations('Offline')
  const online = useOnline()
  if (online) return null
  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="flex items-center justify-center gap-2 border-b bg-muted px-4 py-2 text-center text-sm text-muted-foreground"
    >
      <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>{t('banner')}</span>
    </div>
  )
}
