'use client'
import { SheetHeader } from '@/components/sheet-header'
import { Card, CardContent } from '@/components/ui/card'
import { assignAvatarHues } from '@/lib/avatar-hue'
import { categoryColor } from '@/lib/category-colors'
import { Currency } from '@/lib/currency'
import { amountAsDecimal, formatCurrency, formatDateOnly } from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type StatsData = AppRouterOutput['groups']['stats']['get']

// Every chart here plots one series whose job is magnitude, so bar length does the encoding and the
// bars are neutral. The accent means "you" everywhere else in this app, so it is spent on exactly
// one bar on this page — yours, in the by-member chart. Both steps are defined in globals.css and
// validated against the surface they land on, which is what keeps them readable in dark mode.
const YOU = 'hsl(var(--foreground))'
const MARK = 'hsl(var(--chart-2))'
const TIME = 'hsl(var(--chart-time))'
const AXIS = 'hsl(var(--muted-foreground))'
const GRID = 'hsl(var(--border))'

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  borderColor: 'hsl(var(--border))',
  borderRadius: 'var(--radius)',
  color: 'hsl(var(--card-foreground))',
} as const

/**
 * Recharts sizes the category axis in pixels and draws nothing past it. It was a fixed 96px, which
 * at phone width clipped "TV/Phone/Internet" to "V/Phone/Internet" and wrapped "Household
 * Supplies" onto two lines. The widest name now decides, within these limits; a name past the
 * limit is shortened with an ellipsis and keeps its full text as a tooltip.
 */
const NAME_AXIS_MIN = 56
const NAME_AXIS_MAX = 140
const NAME_FONT_SIZE = 12

/** How wide the name axis has to be for these labels, and each label as it fits there. */
function useNameAxis(labels: string[]) {
  const key = JSON.stringify(labels)
  const [axis, setAxis] = useState<{ width: number; fit: Map<string, string> }>(
    { width: NAME_AXIS_MAX, fit: new Map() },
  )
  useEffect(() => {
    const context = document.createElement('canvas').getContext('2d')
    if (!context) return
    const measure = () => {
      context.font = `${NAME_FONT_SIZE}px ${
        getComputedStyle(document.body).fontFamily
      }`
      const widths = labels.map((label) => context.measureText(label).width)
      const width = Math.min(
        NAME_AXIS_MAX,
        Math.max(NAME_AXIS_MIN, Math.ceil(Math.max(0, ...widths)) + 12),
      )
      const room = width - 12
      const fit = new Map<string, string>()
      labels.forEach((label, index) => {
        if (widths[index] <= room) return fit.set(label, label)
        let short = label
        while (
          short.length > 1 &&
          context.measureText(`${short}…`).width > room
        )
          short = short.slice(0, -1)
        fit.set(label, `${short.trimEnd()}…`)
      })
      setAxis({ width, fit })
    }
    measure()
    // The face is swapped in once it has loaded, and it is not as wide as the fallback.
    document.fonts?.ready.then(measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return axis
}

function NameTick({
  x,
  y,
  payload,
  fit,
}: {
  x?: number | string
  y?: number | string
  payload?: { value?: unknown }
  fit: Map<string, string>
}) {
  const label = String(payload?.value ?? '')
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      fontSize={NAME_FONT_SIZE}
      fill={AXIS}
    >
      <title>{label}</title>
      {fit.get(label) ?? label}
    </text>
  )
}

/**
 * A horizontal bar chart is as tall as its rows. At a fixed 300px, two people's bars were drawn
 * some 150px apart in an otherwise empty card; the bar itself is capped at 24px either way.
 */
const ROW_HEIGHT = 36
const rowsHeight = (rows: number) => Math.max(rows, 2) * ROW_HEIGHT + 8

function ChartCard({
  title,
  description,
  isEmpty,
  emptyLabel,
  className,
  height = 300,
  children,
}: {
  title: string
  description: string
  isEmpty: boolean
  emptyLabel: string
  className?: string
  height?: number
  children: React.ReactElement
}) {
  return (
    <Card bleed className={className}>
      {/* Same header as every other sheet: the chart's name is a caps label, not a headline. A
          20px title over a sentence above each of three charts was three times as much chrome as
          chart. */}
      <SheetHeader label={title} context={description} />
      <CardContent className="px-2 sm:px-4">
        <div className="w-full" style={{ height: isEmpty ? 120 : height }}>
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
  activeUserId,
}: {
  data: StatsData
  currency: Currency
  activeUserId?: string
}) {
  const t = useTranslations('Stats.Charts')
  const tCategories = useTranslations('Categories')
  const locale = useLocale()

  const formatVal = (value: number) => formatCurrency(currency, value, locale)
  // The scale needs whole units: "€2,600.00" on every gridline is cents nobody reads.
  const formatAxis = (value: number) => {
    const formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.code.length ? currency.code : 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amountAsDecimal(value, currency))
    return currency.code.length
      ? formatted
      : formatted.replace('€', currency.symbol)
  }

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

  const categoryAxis = useNameAxis(categoryData.map((c) => c.label))
  const memberAxis = useNameAxis(data.participantSpending.map((p) => p.name))
  const memberHues = assignAvatarHues(
    data.participantSpending.map((p) => p.name),
  )

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
        height={rowsHeight(categoryData.length)}
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
            width={categoryAxis.width}
            tickLine={false}
            axisLine={false}
            tick={(props) => <NameTick {...props} fit={categoryAxis.fit} />}
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
            {/* Each in its group's colour, the one its expenses wear in the list. */}
            {categoryData.map((category) => (
              <Cell key={category.id} fill={categoryColor(category.grouping)} />
            ))}
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
        height={rowsHeight(data.participantSpending.length)}
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
            width={memberAxis.width}
            tickLine={false}
            axisLine={false}
            tick={(props) => <NameTick {...props} fit={memberAxis.fit} />}
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
            {/* The one accented bar on this page. `participantSpending` carries the participant id,
                so this is a direct match rather than a join through the group by name. */}
            {/* Each person in their own plate colour, as everywhere else they appear; you are
                outlined in ink, as your plate is ringed. */}
            {data.participantSpending.map((participant) => (
              <Cell
                key={participant.id}
                fill={`hsl(var(--avatar-${
                  (memberHues.get(participant.name) ?? 0) + 1
                }))`}
                stroke={participant.id === activeUserId ? YOU : undefined}
                strokeWidth={participant.id === activeUserId ? 2 : 0}
              />
            ))}
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
            tickFormatter={(value) => formatAxis(Number(value ?? 0))}
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
            fill={TIME}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartCard>
    </div>
  )
}
