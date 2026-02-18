'use client'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Currency } from '@/lib/currency'
import { formatCurrency } from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { useLocale, useTranslations } from 'next-intl'
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type StatsData = AppRouterOutput['groups']['stats']['get']

const COLORS = [
  '#059669', // Emerald 600
  '#0ea5e9', // Sky 500
  '#e11d48', // Rose 600
  '#d97706', // Amber 600
  '#8b5cf6', // Violet 500
  '#64748b', // Slate 500
  '#84cc16', // Lime 500
  '#ec4899', // Pink 500
]

export function Charts({
  data,
  currency,
}: {
  data: StatsData
  currency: Currency
}) {
  const t = useTranslations('Stats.Charts')
  const locale = useLocale()

  const formatVal = (val: number) =>
    formatCurrency(currency, val, locale)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* 1. Category Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t('categoryTitle')}</CardTitle>
          <CardDescription>{t('categoryDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Wrapper div provides explicit dimensions for Recharts */}
          <div className="h-[300px] w-full">
            {data.categorySpending.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.categorySpending}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {data.categorySpending.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatVal(Number(value ?? 0))}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                {t('noData')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. Participant Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t('participantTitle')}</CardTitle>
          <CardDescription>{t('participantDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            {data.participantSpending.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.participantSpending}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={80}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value) => formatVal(Number(value ?? 0))}
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="amount" fill="#059669" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                {t('noData')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3. Daily Spending Bar Chart (Full Width) */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>{t('timeTitle')}</CardTitle>
          <CardDescription>{t('timeDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            {data.dailySpending.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dailySpending}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date) =>
                      new Date(date).toLocaleDateString(locale, {
                        month: 'short',
                        day: 'numeric',
                      })
                    }
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value) => formatVal(Number(value ?? 0))}
                    labelFormatter={(label) =>
                      new Date(label).toLocaleDateString(locale, {
                        dateStyle: 'medium',
                      })
                    }
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="value" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                {t('noData')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}