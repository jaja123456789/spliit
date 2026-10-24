'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

const THEMES = ['light', 'dark', 'system'] as const

/**
 * Light, dark or the system's — three buttons in Settings rather than a sun-and-moon menu in the
 * header of every screen. The header was the wrong place for something set about once, and a menu
 * hid which option was in force until it was opened.
 */
export function ThemeChoice() {
  const t = useTranslations('Settings.Appearance')
  const { theme, setTheme } = useTheme()
  // The stored theme is only known in the browser; marking none as pressed until then keeps the
  // server's markup and the first client render the same.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div
      role="group"
      aria-label={t('theme')}
      className="inline-flex rounded-md bg-muted p-1"
    >
      {THEMES.map((value) => {
        const active = mounted && (theme ?? 'system') === value
        return (
          <Button
            key={value}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={active}
            onClick={() => setTheme(value)}
            className={cn(
              'h-9 px-3',
              active
                ? 'bg-card text-foreground shadow-sm hover:bg-card'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(value)}
          </Button>
        )
      })}
    </div>
  )
}
