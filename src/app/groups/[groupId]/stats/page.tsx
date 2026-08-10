import { TotalsPageClient } from '@/app/groups/[groupId]/stats/page.client'
import { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

// Named after the tab that leads here. The page used to be titled "Totals" while the navigation
// called it "Stats", so the browser tab disagreed with the link the reader had just clicked.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Stats')
  return { title: t('title') }
}

export default async function TotalsPage() {
  return <TotalsPageClient />
}
