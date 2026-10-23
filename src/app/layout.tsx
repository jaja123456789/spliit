import { ApplePwaSplash } from '@/app/apple-pwa-splash'
import { AuthProvider } from '@/components/auth-provider'
import { EnvProvider } from '@/components/env-provider'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { OfflineBanner } from '@/components/offline-banner'
import { OutboxFlusher } from '@/components/outbox-flusher'
import { ProgressBar } from '@/components/progress-bar'
import { ServiceWorkerRegistration } from '@/components/service-worker-registration'
import { ThemeColor } from '@/components/theme-color'
import { ThemeProvider } from '@/components/theme-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/toaster'
import { GroupsProvider } from '@/contexts'
import { env } from '@/lib/env'
import { TRPCProvider } from '@/trpc/client'
import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { IBM_Plex_Mono, Nunito_Sans } from 'next/font/google'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import './globals.css'

/**
 * The config used to carry a dead `fontFamily.rounded` stack (Quicksand, Comfortaa, Arial Rounded)
 * that nothing referenced, so the app rendered in whatever the OS supplied. Nunito Sans honours the
 * intent behind that stack — humanist, softly rounded terminals, approachable — without the cost of
 * a display-rounded face: it is drawn for UI, holds up at the 12px captions this app is full of,
 * and ships real tabular figures, which the amount columns depend on.
 *
 * Loaded through next/font, so it is self-hosted and subsetted at build time; no third-party
 * request at runtime, which matters for an app with no offline story.
 */
const nunitoSans = Nunito_Sans({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-sans',
})

/**
 * The second voice, for figures only.
 *
 * This is a money app whose figures were set in the same face as its prose, at the same weight, so
 * an amount read as another word in the sentence. A mono face separates the two registers and — the
 * part that actually matters — puts every glyph on the same advance, so a column of amounts lines
 * up on the decimal without any per-row measurement. Nunito Sans has tabular figures, but tabular
 * figures still sit in a proportional face; the sign column this design depends on needs a fixed
 * advance to sit in.
 *
 * IBM Plex Mono rather than a technical mono: it is humanist, with the same open apertures and
 * slightly soft terminals as Nunito Sans, and its 0/O and 1/l are unambiguous at 12px.
 *
 * Three weights: 400 so a bare `font-mono` (the MCP token strings) gets a face rather than the
 * nearest substitute, 500 for row figures, 600 for headline ones. Deliberately no 700 — nothing in
 * the app should ask the browser to synthesise a weight that was never downloaded, which means
 * `font-mono font-bold` is a mistake wherever it appears.
 */
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-mono',
})

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_BASE_URL),
  title: {
    default: 'Spliit · Share Expenses with Friends & Family',
    template: '%s · Spliit',
  },
  description:
    'Spliit is a minimalist web application to share expenses with friends and family. No ads, no account, no problem.',
  manifest: `${env.NEXT_PUBLIC_BASE_PATH}/manifest.webmanifest`,
  openGraph: {
    title: 'Spliit · Share Expenses with Friends & Family',
    description:
      'Spliit is a minimalist web application to share expenses with friends and family. No ads, no account, no problem.',
    images: `${env.NEXT_PUBLIC_BASE_PATH}/banner.png`,
    type: 'website',
    url: env.NEXT_PUBLIC_BASE_PATH || '/',
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@scastiel',
    site: '@scastiel',
    images: `${env.NEXT_PUBLIC_BASE_PATH}/banner.png`,
    title: 'Spliit · Share Expenses with Friends & Family',
    description:
      'Spliit is a minimalist web application to share expenses with friends and family. No ads, no account, no problem.',
  },
  appleWebApp: {
    capable: true,
    title: 'Spliit',
  },
  applicationName: 'Spliit',
  icons: [
    {
      url: `${env.NEXT_PUBLIC_BASE_PATH}/android-chrome-192x192.png`,
      sizes: '192x192',
      type: 'image/png',
    },
    {
      url: `${env.NEXT_PUBLIC_BASE_PATH}/android-chrome-512x512.png`,
      sizes: '512x512',
      type: 'image/png',
    },
  ],
}

export const viewport: Viewport = {
  // The browser's own bar matches the page's ground in dark mode, rather than staying a green band
  // over a dark app. `ThemeColor` keeps it right when someone picks a theme other than the system's.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#047857' },
    { media: '(prefers-color-scheme: dark)', color: '#101413' },
  ],
}

function Content({ children }: { children: React.ReactNode }) {
  const t = useTranslations()
  const basePath = env.NEXT_PUBLIC_BASE_PATH
  return (
    <TRPCProvider>
      <AuthProvider>
        <GroupsProvider>
          {/* First in the tab order, visible only when focused: past the header's four links. */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
          >
            {t('Header.skipToContent')}
          </a>
          <header className="fixed top-0 left-0 right-0 h-16 flex justify-between bg-background/60 supports-[backdrop-filter]:bg-background/50 p-2 border-b backdrop-blur-sm z-50">
            {/* Not a heading. Every page has its own <h1> — the group's name, the page's title —
                and the logo made it two on every screen. The height is pinned rather than left to
                `h-auto`, which drew the logo at whatever size the served image happened to be. */}
            <Link
              className="flex items-center gap-2 hover:scale-105 transition-transform"
              href="/"
            >
              <Image
                src={`${basePath}/logo-with-text.png`}
                className="m-1 h-[35px] w-auto"
                width={(35 * 522) / 180}
                height={35}
                alt="Spliit"
              />
            </Link>
            <div role="navigation" aria-label="Menu" className="flex">
              <ul className="flex items-center text-sm">
                <li>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="-my-3 min-h-[44px] text-primary sm:min-h-0"
                  >
                    <Link href="/groups">{t('Header.groups')}</Link>
                  </Button>
                </li>
                <li>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="-my-3 min-h-[44px] text-primary sm:min-h-0"
                  >
                    <Link href="/settings">{t('Header.settings')}</Link>
                  </Button>
                </li>
                <li>
                  <LocaleSwitcher />
                </li>
                <li>
                  <ThemeToggle />
                </li>
              </ul>
            </div>
          </header>

          <div
            id="main-content"
            tabIndex={-1}
            className="pt-16 flex-1 flex flex-col outline-none"
          >
            <OfflineBanner />
            {children}
          </div>

          <OutboxFlusher />
          <Toaster />
        </GroupsProvider>
      </AuthProvider>
    </TRPCProvider>
  )
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()
  const basePath = env.NEXT_PUBLIC_BASE_PATH

  return (
    <html
      lang={locale}
      className={`${nunitoSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <ApplePwaSplash icon={`${basePath}/logo-with-text.png`} color="#027756" />
      {/* `bg-muted/30 dark:bg-background` until now: light --background was pure white, the same
          value as --card, so the ground had to be faked with a tinted muted. It is its own token
          in both themes now. */}
      <body className="min-h-[100dvh] flex flex-col items-stretch bg-background">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <EnvProvider
              basePath={basePath}
              enableExpenseDocuments={env.NEXT_PUBLIC_ENABLE_EXPENSE_DOCUMENTS}
            >
              <Suspense>
                <ProgressBar />
              </Suspense>
              <ThemeColor />
              <ServiceWorkerRegistration />
              <Content>{children}</Content>
            </EnvProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
