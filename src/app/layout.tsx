import { ApplePwaSplash } from '@/app/apple-pwa-splash'
import { AppHeader } from '@/components/app-header'
import { AuthProvider } from '@/components/auth-provider'
import { EnvProvider } from '@/components/env-provider'
import { OfflineBanner } from '@/components/offline-banner'
import { OutboxFlusher } from '@/components/outbox-flusher'
import { ProgressBar } from '@/components/progress-bar'
import { ServiceWorkerRegistration } from '@/components/service-worker-registration'
import { ThemeColor } from '@/components/theme-color'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import { GroupsProvider } from '@/contexts'
import { env } from '@/lib/env'
import { skipLandingScript } from '@/lib/skip-landing'
import { TRPCProvider } from '@/trpc/client'
import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { IBM_Plex_Mono, Nunito_Sans } from 'next/font/google'
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
 * For strings that are code — the MCP tokens in Settings — and nothing else.
 *
 * Figures used to be set in it too, to give amounts a voice of their own and a fixed advance for
 * the sign column. Next to Nunito Sans it read as a terminal, the most dated thing on every screen.
 * Amounts are now Nunito Sans with its tabular figures (`tabular-nums`, on `Money`), which keeps the
 * decimals of a column in line; the sign column is `1ch` wide, a figure's width either way.
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
  // The browser's own bar matches the page's ground in both themes. It was a green band in light
  // mode, one more place the accent was spent on chrome. `ThemeColor` keeps it right when someone
  // picks a theme other than the system's.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBFAF9' },
    { media: '(prefers-color-scheme: dark)', color: '#131211' },
  ],
}

function Content({ children }: { children: React.ReactNode }) {
  const t = useTranslations()
  return (
    <TRPCProvider>
      <AuthProvider>
        <GroupsProvider>
          {/* First in the tab order, visible only when focused: past the bar's own links. */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
          >
            {t('Header.skipToContent')}
          </a>
          <AppHeader />

          <div
            id="main-content"
            tabIndex={-1}
            className="flex-1 flex flex-col outline-none"
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
      <ApplePwaSplash icon={`${basePath}/logo-with-text.png`} color="#FBFAF9" />
      {/* `bg-muted/30 dark:bg-background` until now: light --background was pure white, the same
          value as --card, so the ground had to be faked with a tinted muted. It is its own token
          in both themes now. */}
      <body className="min-h-[100dvh] flex flex-col items-stretch bg-background">
        {/* First, so a returning visitor leaves "/" before the front page paints. */}
        <script
          dangerouslySetInnerHTML={{ __html: skipLandingScript(basePath) }}
        />
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
