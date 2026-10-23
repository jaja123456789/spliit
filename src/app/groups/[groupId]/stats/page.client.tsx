'use client'
import { MonthlyStatementCard } from '@/app/groups/[groupId]/stats/monthly-statement'
import {
  MonthPicker,
  useStatsMonth,
} from '@/app/groups/[groupId]/stats/stats-month'
import { Totals } from '@/app/groups/[groupId]/stats/totals'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveUserState } from '@/lib/hooks'
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
      {/* The two bar charts are as tall as their rows now (see `rowsHeight`); a few rows is the
          usual case, so their placeholders are too. The chart over time keeps its 300px. */}
      <Skeleton className="h-[240px] w-full" />
      <Skeleton className="h-[240px] w-full" />
      <Skeleton className="h-[404px] w-full md:col-span-2" />
    </div>
  )
}

export function TotalsPageClient() {
  const t = useTranslations('Stats')
  const { groupId, group } = useCurrentGroup()
  const activeUser = useActiveUserState(groupId)

  const participantId = activeUser ?? undefined
  const [month] = useStatsMonth()
  // Not before we know who "you" are: see `useActiveUserState`.
  const { data } = trpc.groups.stats.get.useQuery(
    { groupId, participantId, month },
    { enabled: activeUser !== undefined },
  )

  return (
    <div className="space-y-4">
      {/* All time, or one month — and for a month, its statement. */}
      <MonthPicker />
      {/* One sheet. `Totals` owns its own header now, so there is no CardHeader here repeating the
          tab name over a sentence explaining that a summary is a summary. */}
      <Card bleed className="pb-2">
        <Totals />
      </Card>

      {/* Sibling of the totals, not a child of them: these are their own cards, and nesting three
          cards inside a fourth just added a frame around a frame. */}
      {month && data?.statement && (
        <MonthlyStatementCard month={month} statement={data.statement} />
      )}

      {!data || !group ? (
        <ChartsSkeleton />
      ) : data.categorySpending.length === 0 ? (
        <Card bleed>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t('Charts.noData')}
          </CardContent>
        </Card>
      ) : (
        <Charts
          data={data}
          currency={getCurrencyFromGroup(group)}
          activeUserId={participantId}
        />
      )}
    </div>
  )
}
