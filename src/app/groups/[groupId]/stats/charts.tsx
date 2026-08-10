'use client'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Currency } from '@/lib/currency'
import { formatCurrency, formatDateOnly } from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { useLocale, useTranslations } from 'next-intl'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type StatsData = AppRouterOutput['groups']['stats']['get']

// Every chart here plots one series whose job is magnitude, so they all share a single hue and the
// bar length does the encoding. Both steps are defined in globals.css and validated against their
// own surface, which is what keeps them readable in dark mode.
const MARK = 'hsl(var(--chart-1))'
const AXIS = 'hsl(var(--muted-foreground))'
const GRID = 'hsl(var(--border))'

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  borderColor: 'hsl(var(--border))',
  borderRadius: 'var(--radius)',
  color: 'hsl(var(--card-foreground))',
} as const

/** Recharts sizes the category axis in pixels, so long names need room to avoid being clipped. */
const NAME_AXIS_WIDTH = 96

function ChartCard({
  title,
  description,
  isEmpty,
  emptyLabel,
  className,
  children,
}: {
  title: string
  description: string
  isEmpty: boolean
  emptyLabel: string
  className?: string
  children: React.ReactElement
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          {isEmpty ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {emptyLabel}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {children}
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function Charts({
  data,
  currency,
}: {
  data: StatsData
  currency: Currency
}) {
  const t = useTranslations('Stats.Charts')
  const tCategories = useTranslations('Categories')
  const locale = useLocale()

  const formatVal = (value: number) => formatCurrency(currency, value, locale)

  // Category names live in the database in English and are translated everywhere else in the app
  // through the Categories namespace, so do the same here rather than printing the raw column.
  // A category with no message of its own falls back to its stored name, which is still readable —
  // better than an axis of "Home.Sauna" keys.
  const categoryData = data.categorySpending.map((category) => {
    const key = `${category.grouping}.${category.name}` as never
    return {
      ...category,
      label: tCategories.has(key) ? tCategories(key) : category.name,
    }
  })

  const formatBucket = (bucket: unknown) =>
    data.timeGranularity === 'month'
      ? formatDateOnly(new Date(`${bucket}-01T00:00:00.000Z`), locale, {
          month: 'short',
          year: 'numeric',
        })
      : formatDateOnly(new Date(`${bucket}T00:00:00.000Z`), locale, {
          month: 'short',
          day: 'numeric',
        })

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChartCard
        title={t('categoryTitle')}
        description={t('categoryDesc')}
        isEmpty={categoryData.length === 0}
        emptyLabel={t('noData')}
      >
        <BarChart
          data={categoryData}
          layout="vertical"
          margin={{ top: 4, right: 72, bottom: 4, left: 4 }}
        >
          <XAxis type="number" hide />
          <YAxis
            dataKey="label"
            type="category"
            width={NAME_AXIS_WIDTH}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: AXIS }}
          />
          <Tooltip
            formatter={(value) => formatVal(Number(value ?? 0))}
            cursor={{ fill: GRID, fillOpacity: 0.3 }}
            contentStyle={tooltipStyle}
            itemStyle={{ color: 'hsl(var(--card-foreground))' }}
          />
          <Bar
            dataKey="amount"
            fill={MARK}
            maxBarSize={24}
            radius={[0, 4, 4, 0]}
          >
            {/* The value at the tip, so the numbers are readable without a pointer. */}
            <LabelList
              dataKey="amount"
              position="right"
              className="fill-foreground"
              fontSize={12}
              formatter={(value) => formatVal(Number(value ?? 0))}
            />
          </Bar>
        </BarChart>
      </ChartCard>

      <ChartCard
        title={t('participantTitle')}
        description={t('participantDesc')}
        isEmpty={data.participantSpending.length === 0}
        emptyLabel={t('noData')}
      >
        <BarChart
          data={data.participantSpending}
          layout="vertical"
          margin={{ top: 4, right: 72, bottom: 4, left: 4 }}
        >
          <XAxis type="number" hide />
          <YAxis
            dataKey="name"
            type="category"
            width={NAME_AXIS_WIDTH}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: AXIS }}
          />
          <Tooltip
            formatter={(value) => formatVal(Number(value ?? 0))}
            cursor={{ fill: GRID, fillOpacity: 0.3 }}
            contentStyle={tooltipStyle}
            itemStyle={{ color: 'hsl(var(--card-foreground))' }}
          />
          <Bar
            dataKey="amount"
            fill={MARK}
            maxBarSize={24}
            radius={[0, 4, 4, 0]}
          >
            <LabelList
              dataKey="amount"
              position="right"
              className="fill-foreground"
              fontSize={12}
              formatter={(value) => formatVal(Number(value ?? 0))}
            />
          </Bar>
        </BarChart>
      </ChartCard>

      <ChartCard
        className="md:col-span-2"
        title={t('timeTitle')}
        description={t(
          data.timeGranularity === 'month'
            ? 'timeDescMonthly'
            : 'timeDescDaily',
        )}
        isEmpty={data.spendingOverTime.length === 0}
        emptyLabel={t('noData')}
      >
        <BarChart
          data={data.spendingOverTime}
          margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
        >
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="bucket"
            tickFormatter={formatBucket}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            tick={{ fontSize: 12, fill: AXIS }}
            minTickGap={16}
          />
          {/* Too many bars here to label each one, so the axis carries the scale instead. */}
          <YAxis
            tickFormatter={(value) => formatVal(Number(value ?? 0))}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: AXIS }}
            width={72}
          />
          <Tooltip
            formatter={(value) => formatVal(Number(value ?? 0))}
            labelFormatter={formatBucket}
            cursor={{ fill: GRID, fillOpacity: 0.3 }}
            contentStyle={tooltipStyle}
            itemStyle={{ color: 'hsl(var(--card-foreground))' }}
          />
          <Bar
            dataKey="amount"
            fill={MARK}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartCard>
    </div>
  )
}
