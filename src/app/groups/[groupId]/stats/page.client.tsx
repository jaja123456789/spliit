'use client'
import { Totals } from '@/app/groups/[groupId]/stats/totals'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveUser } from '@/lib/hooks'
import { getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { useCurrentGroup } from '../current-group-context'

// Recharts is ~100 kB gzipped and only ever renders here, below the totals, so let the numbers
// paint first and pull the charts in behind them.
const Charts = dynamic(() => import('./charts').then((m) => m.Charts), {
  ssr: false,
  loading: () => <ChartsSkeleton />,
})

function ChartsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Skeleton className="h-[404px] w-full" />
      <Skeleton className="h-[404px] w-full" />
      <Skeleton className="h-[404px] w-full md:col-span-2" />
    </div>
  )
}

export function TotalsPageClient() {
  const t = useTranslations('Stats')
  const { groupId, group } = useCurrentGroup()
  const activeUser = useActiveUser(groupId)

  const participantId =
    activeUser && activeUser !== 'None' ? activeUser : undefined
  const { data } = trpc.groups.stats.get.useQuery({ groupId, participantId })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('Totals.title')}</CardTitle>
          <CardDescription>{t('Totals.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Totals />
        </CardContent>
      </Card>

      {/* Sibling of the totals, not a child of them: these are their own cards, and nesting three
          cards inside a fourth just added a frame around a frame. */}
      {!data || !group ? (
        <ChartsSkeleton />
      ) : data.categorySpending.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t('Charts.noData')}
          </CardContent>
        </Card>
      ) : (
        <Charts data={data} currency={getCurrencyFromGroup(group)} />
      )}
    </div>
  )
}
