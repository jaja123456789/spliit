import { Logo } from '@/components/logo'
import { SkipLanding } from '@/components/skip-landing'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

// FIX for https://github.com/vercel/next.js/issues/58615
// export const dynamic = 'force-dynamic'

export default function HomePage() {
  const t = useTranslations()
  return (
    <>
      <SkipLanding />
      <main className="flex-1">
        <section className="py-16 md:py-24 lg:py-32">
          <div className="container flex max-w-screen-md flex-col items-center gap-4 text-center">
            {/* Ink, with weight for emphasis. The emphasised words were an emerald gradient: the
                most green on any screen, on the one page with nothing to do with money. */}
            <h1 className="!leading-none font-bold tracking-tight text-2xl sm:text-3xl md:text-4xl lg:text-5xl py-2 [&_strong]:font-extrabold">
              {t.rich('Homepage.title', {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </h1>
            <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8">
              {t.rich('Homepage.description', {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            {/* What someone arriving here came to do: start a group, or get back to theirs. The
                GitHub button was the second of two; it is for people running a server, not using
                one, and the footer keeps the credits. */}
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button asChild className="h-11 px-5">
                <Link href="/groups/create">{t('Homepage.button.create')}</Link>
              </Button>
              <Button asChild variant="secondary" className="h-11 px-5">
                <Link href="/groups">{t('Homepage.button.groups')}</Link>
              </Button>
            </div>
            <p className="max-w-[28rem] text-sm text-muted-foreground">
              {t('Homepage.joinHint')}
            </p>
          </div>
        </section>
      </main>
      {/* Credits belong to the front page. In the root layout they closed every screen of the app —
        about 190px of logo and links, the last lines behind the bottom tab bar. */}
      <footer className="sm:p-8 md:p-16 sm:mt-16 sm:text-sm md:text-base md:mt-32 bg-muted/50 dark:bg-card border-t p-6 mt-8 flex flex-col sm:flex-row sm:justify-between gap-4 text-xs [&_a]:underline">
        <div className="flex flex-col space-y-2">
          <div className="sm:text-lg font-semibold text-base flex space-x-2 items-center">
            <Link className="flex items-center gap-2" href="/">
              <Logo />
            </Link>
          </div>
          <div className="flex flex-col space-y a--no-underline-text-white">
            <span>{t('Footer.madeIn')}</span>
            <span>
              {t.rich('Footer.builtBy', {
                author: (txt) => (
                  <a href="https://scastiel.dev" target="_blank" rel="noopener">
                    {txt}
                  </a>
                ),
                source: (txt) => (
                  <a
                    href="https://github.com/spliit-app/spliit/graphs/contributors"
                    target="_blank"
                    rel="noopener"
                  >
                    {txt}
                  </a>
                ),
              })}
            </span>
          </div>
        </div>
      </footer>
    </>
  )
}
