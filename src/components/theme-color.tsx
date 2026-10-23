'use client'
import { useTheme } from 'next-themes'
import { useEffect } from 'react'

const COLORS = { light: '#047857', dark: '#101413' } as const

/**
 * Keeps the browser's bar in step with a theme picked in the app. The `theme-color` tags follow
 * the system's preference by media query, so choosing dark on a light system would otherwise leave
 * a green bar over a dark page.
 */
export function ThemeColor() {
  const { theme, resolvedTheme } = useTheme()

  useEffect(() => {
    const chosen =
      theme !== 'system' &&
      (resolvedTheme === 'light' || resolvedTheme === 'dark')
        ? COLORS[resolvedTheme]
        : null
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => {
        meta.content =
          chosen ?? (meta.media.includes('dark') ? COLORS.dark : COLORS.light)
      })
  }, [theme, resolvedTheme])

  return null
}
