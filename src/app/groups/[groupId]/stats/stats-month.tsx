'use client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MONTH_PATTERN } from '@/lib/expense-filters'
import { formatDateOnly } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useCurrentGroup } from '../current-group-context'

export function monthLabel(month: string, locale: string) {
  return formatDateOnly(new Date(`${month}-01T00:00:00.000Z`), locale, {
    month: 'long',
    year: 'numeric',
  })
}

/**
 * The month Stats is showing, kept in the address (`?month=YYYY-MM`) so a month's statement can
 * be bookmarked and linked to — the expense list's month filter links here. Undefined is all time.
 */
export function useStatsMonth() {
  const searchParams = useSearchParams()
  const value = searchParams.get('month')
  const month = value && MONTH_PATTERN.test(value) ? value : undefined

  const setMonth = (next?: string) => {
    const params = new URLSearchParams(window.location.search)
    if (next) params.set('month', next)
    else params.delete('month')
    const query = params.toString()
    // The browser's own `replaceState`, which Next keeps `useSearchParams` in step with.
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}`,
    )
  }
  return [month, setMonth] as const
}

/** All time, or one of the months the group has expenses in, newest first. */
export function MonthPicker() {
  const t = useTranslations('Stats.Month')
  const locale = useLocale()
  const { groupId } = useCurrentGroup()
  const [month, setMonth] = useStatsMonth()
  const { data } = trpc.groups.expenses.facets.useQuery({ groupId })
  const months = (data?.months ?? []).map((entry) => entry.month)
  // A month arrived at by a link is offered even before the menu has loaded.
  if (month && !months.includes(month)) months.unshift(month)

  return (
    <Select
      value={month ?? 'all'}
      onValueChange={(next) => setMonth(next === 'all' ? undefined : next)}
    >
      <SelectTrigger
        className="w-full sm:w-64"
        aria-label={t('label')}
        data-testid="stats-month"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t('allTime')}</SelectItem>
        {months.map((entry) => (
          <SelectItem key={entry} value={entry}>
            {monthLabel(entry, locale)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
