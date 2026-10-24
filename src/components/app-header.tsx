'use client'

import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** Inside a group — anything under /groups/<id>, which /groups/create is not. */
export const isGroupPath = (pathname: string) =>
  /^\/groups\/(?!create(?:\/|$))[^/]+/.test(pathname)

/**
 * The app's bar, on the screens that are not inside a group: the group list, settings, the front
 * page. Inside a group the group's own bar takes its place (`GroupHeader`), because the two stacked
 * — this one with the logo, Groups, Settings, a language menu and a theme toggle, and the group's
 * name with Share under it — took the first 124px of a phone before the group's content began.
 *
 * Language and theme are set in Settings. They were on every screen to be changed about once.
 */
export function AppHeader() {
  const t = useTranslations('Header')
  const pathname = usePathname()
  if (isGroupPath(pathname)) return null

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b bg-background px-2">
        {/* Not a heading. Every page has its own <h1>, and the logo made it two on every screen.
            Named by its text, "Spliit". */}
        <Link className="flex items-center px-1" href="/groups">
          <Logo />
        </Link>
        <nav aria-label="Menu">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="min-h-[44px] text-foreground sm:min-h-0"
          >
            <Link href="/settings">{t('settings')}</Link>
          </Button>
        </nav>
      </header>
      <div aria-hidden="true" className="h-14 shrink-0" />
    </>
  )
}
