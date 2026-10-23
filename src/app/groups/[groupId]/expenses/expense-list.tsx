'use client'
import { CreateFromReceiptButton } from '@/app/groups/[groupId]/expenses/create-from-receipt-button'
import { ExpenseCard } from '@/app/groups/[groupId]/expenses/expense-card'
import {
  ExpenseFiltersBar,
  useExpenseListFilters,
} from '@/app/groups/[groupId]/expenses/expense-filters-bar'
import { ExpenseListTotal } from '@/app/groups/[groupId]/expenses/expense-list-total'
import { ShareButton } from '@/app/groups/[groupId]/share-button'
import { Money } from '@/components/money'
import { Button } from '@/components/ui/button'
import { SearchBar } from '@/components/ui/search-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { NEW_GROUP_ACTIVE_USER_KEY, writeActiveUser } from '@/lib/active-user'
import { ExpenseFilters, hasActiveFilters } from '@/lib/expense-filters'
import { useActiveUserState } from '@/lib/hooks'
import {
  cn,
  formatDateOnly,
  getCurrencyFromGroup,
  toDateInputValue,
  todayAsDateOnly,
} from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { keepPreviousData } from '@tanstack/react-query'
import { Receipt } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { ReactNode, forwardRef, useEffect, useMemo } from 'react'
import { useInView } from 'react-intersection-observer'
import { useDebounce } from 'use-debounce'
import { useCurrentGroup } from '../current-group-context'

const PAGE_SIZE = 20

type Expense = AppRouterOutput['groups']['expenses']['list']['expenses'][number]

/**
 * Consecutive expenses in the same calendar month, in list order. The list arrives newest first, so
 * a month never comes back once left — even across pages, which is why this runs over all of them.
 *
 * Months, not days: in the 1,935-expense group a day holds 1.8 expenses on average, so a rule per
 * day cost nearly as much height as the date line on every row it replaced. Each row says its own
 * day, briefly, in its second line instead.
 *
 * Dates are read from their UTC parts, which is how date-only values are kept. `dayjs(date)` reads
 * them as local time, and west of UTC that filed every expense under the day before.
 */
function groupByMonth(expenses: Expense[]) {
  const months: { month: string; expenses: Expense[] }[] = []
  for (const expense of expenses) {
    const month = toDateInputValue(expense.expenseDate).slice(0, 7)
    const last = months.at(-1)
    if (last?.month === month) last.expenses.push(expense)
    else months.push({ month, expenses: [expense] })
  }
  return months
}

export function ExpenseList({
  actions,
  enableReceiptExtract = false,
}: {
  actions?: ReactNode
  enableReceiptExtract?: boolean
}) {
  const { groupId, group } = useCurrentGroup()
  const [filters, updateFilters] = useExpenseListFilters()
  const [search] = useDebounce(filters.search ?? '', 300)

  const participants = group?.participants

  useEffect(() => {
    if (!participants) return

    // The choice made while creating the group travels as a name, because participants had no ids
    // yet. Exchange it for an id now that they do, and clear the hand-off either way so a failed
    // name match cannot leave the modal asking again on every visit.
    const pendingName = localStorage.getItem(NEW_GROUP_ACTIVE_USER_KEY)
    const newUser = localStorage.getItem(`${groupId}-newUser`)
    if (pendingName || newUser) {
      localStorage.removeItem(NEW_GROUP_ACTIVE_USER_KEY)
      localStorage.removeItem(`${groupId}-newUser`)
      const matched = participants.find(
        (p) => p.name === (pendingName || newUser),
      )
      writeActiveUser(groupId, matched?.id ?? null)
    }
  }, [groupId, participants])

  return (
    <>
      <ExpenseListTotal actions={actions} />
      {/* The search box and filters are rendered by the list, not above it: a group with nothing
          in it should not offer to search it. Passed down rather than hoisted so that a search
          returning no results still keeps them — otherwise the controls would vanish under the
          fingers of whoever just used them. */}
      <ExpenseListForSearch
        groupId={groupId}
        enableReceiptExtract={enableReceiptExtract}
        filters={{
          search: search.trim() || undefined,
          paidBy: filters.paidBy,
          categoryId: filters.categoryId,
          month: filters.month,
        }}
        onClearFilters={() =>
          updateFilters({
            paidBy: undefined,
            categoryId: undefined,
            month: undefined,
          })
        }
        searchBar={
          <div className="flex flex-col gap-2">
            <SearchBar
              defaultValue={filters.search}
              onValueChange={(value) => updateFilters({ search: value })}
            />
            <ExpenseFiltersBar filters={filters} onChange={updateFilters} />
          </div>
        }
      />
    </>
  )
}

const ExpenseListForSearch = ({
  groupId,
  filters,
  onClearFilters,
  searchBar,
  enableReceiptExtract,
}: {
  groupId: string
  filters: ExpenseFilters
  onClearFilters: () => void
  searchBar: ReactNode
  enableReceiptExtract: boolean
}) => {
  const { group } = useCurrentGroup()
  const locale = useLocale()

  const t = useTranslations('Expenses')
  // The activity feed's "Today" and "Yesterday", which every language already has.
  const tDays = useTranslations('Activity.Groups')
  const tEmpty = useTranslations('Expenses.EmptyGroup')
  const tReceipt = useTranslations('CreateFromReceipt')
  const { ref: loadingRef, inView } = useInView()

  const filtered = hasActiveFilters(filters)
  const {
    data,
    isLoading: expensesAreLoading,
    isPlaceholderData,
    fetchNextPage,
  } = trpc.groups.expenses.list.useInfiniteQuery(
    { groupId, limit: PAGE_SIZE, ...filters },
    {
      getNextPageParam: ({ nextCursor }) => nextCursor,
      // While a new search is on its way, the previous results stay up, dimmed, rather than the
      // list collapsing into a skeleton on every keystroke.
      placeholderData: keepPreviousData,
    },
  )
  const expenses = data?.pages.flatMap((page) => page.expenses)
  const hasMore = data?.pages.at(-1)?.hasMore ?? false

  const isLoading = expensesAreLoading || !expenses || !group

  useEffect(() => {
    if (inView && hasMore && !isLoading && !isPlaceholderData) fetchNextPage()
  }, [fetchNextPage, hasMore, inView, isLoading, isPlaceholderData])

  const months = useMemo(
    () => (expenses ? groupByMonth(expenses) : []),
    [expenses],
  )

  if (isLoading)
    return (
      <>
        {searchBar}
        <ExpensesLoading />
      </>
    )

  // A search that found nothing is not an empty group, and must not be answered with "invite the
  // others" — the controls stay, so the search can be changed.
  if (expenses.length === 0 && filtered) {
    const onlyText =
      !filters.paidBy && filters.categoryId === undefined && !filters.month
    return (
      <>
        {searchBar}
        <div className="px-4 sm:px-6 py-10 text-center text-sm text-muted-foreground">
          <p>
            {onlyText
              ? t('noResults', { search: filters.search ?? '' })
              : t('Filters.noResults')}
          </p>
          {!onlyText && (
            <Button variant="link" onClick={onClearFilters}>
              {t('Filters.clearAll')}
            </Button>
          )}
        </div>
      </>
    )
  }

  // A group with no expenses is nearly always a group nobody has been invited to yet, so that is
  // what it offers — rather than a sentence about the absence of expenses under a search box that
  // has nothing to search. Adding an expense stays available; it is just not the first move.
  if (expenses.length === 0)
    return (
      <div className="px-4 sm:px-6 py-10 text-center">
        <p className="text-base font-medium">{tEmpty('title')}</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
          {tEmpty('inviteHint')}
        </p>
        <div className="mt-5 flex flex-col items-center gap-2">
          {group && <ShareButton group={group} label={tEmpty('invite')} />}
          <Button variant="link" asChild>
            <Link href={`/groups/${groupId}/expenses/create`}>
              {t('createFirst')}
            </Link>
          </Button>
          {/* "…or scan a receipt to start from one". The scanner used to have exactly one entry
              point in the whole app — an icon in this sheet's header — which is not where anyone
              looks on a group that has nothing in it yet. */}
          {enableReceiptExtract && (
            <CreateFromReceiptButton
              trigger={
                <Button variant="link" className="text-muted-foreground">
                  <Receipt className="mr-2 h-4 w-4" />
                  {tReceipt('scanEntry')}
                </Button>
              }
            />
          )}
        </div>
      </div>
    )

  const currency = getCurrencyFromGroup(group)
  const today = todayAsDateOnly()
  const todayKey = toDateInputValue(today)
  const yesterdayKey = toDateInputValue(
    new Date(today.getTime() - 24 * 60 * 60 * 1000),
  )
  const thisYear = todayKey.slice(0, 4)
  const dayLabel = (expense: Expense) => {
    const day = toDateInputValue(expense.expenseDate)
    if (day === todayKey) return tDays('today')
    if (day === yesterdayKey) return tDays('yesterday')
    return formatDateOnly(expense.expenseDate, locale, {
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <>
      {searchBar}
      {filtered && <FilterSummary groupId={groupId} filters={filters} />}
      <div
        className={cn('transition-opacity', isPlaceholderData && 'opacity-50')}
        aria-busy={isPlaceholderData}
      >
        {months.map(({ month, expenses }) => (
          <section key={month} aria-labelledby={`month-${month}`}>
            {/* A month rule: mono caps, no border, sitting on the sheet it scrolls over. Every
                month is named, where relative buckets lumped a whole year into "Last year" and
                everything before it into "Older". */}
            <h3
              id={`month-${month}`}
              data-testid="expense-month"
              className="text-subtle-foreground text-xs font-mono uppercase tracking-[0.14em] px-4 sm:px-6 pt-4 pb-1.5 sticky top-16 z-10 bg-card"
            >
              <time dateTime={month}>
                {formatDateOnly(new Date(`${month}-01`), locale, {
                  month: 'long',
                  year: month.startsWith(thisYear) ? undefined : 'numeric',
                })}
              </time>
            </h3>
            {expenses.map((expense) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                dateLabel={dayLabel(expense)}
                currency={currency}
                groupId={groupId}
                participantCount={group.participants.length}
              />
            ))}
          </section>
        ))}
      </div>
      {hasMore && <ExpensesLoading ref={loadingRef} />}
    </>
  )
}

/**
 * What a search or filter matched, summed. The list is paginated, so this comes from the server
 * rather than from the rows on screen; it waits to know who "you" are, as the header does.
 */
function FilterSummary({
  groupId,
  filters,
}: {
  groupId: string
  filters: ExpenseFilters
}) {
  const t = useTranslations('Expenses.Filters')
  const { group } = useCurrentGroup()
  const activeUser = useActiveUserState(groupId)
  const { data } = trpc.groups.expenses.summary.useQuery(
    { groupId, participantId: activeUser ?? undefined, ...filters },
    { enabled: activeUser !== undefined, placeholderData: keepPreviousData },
  )
  if (!data || !group) return <Skeleton className="mx-4 sm:mx-6 h-4 w-56" />

  const currency = getCurrencyFromGroup(group)
  return (
    <p
      className="mx-4 sm:mx-6 text-sm text-muted-foreground"
      data-testid="expense-filter-summary"
    >
      {t('count', { count: data.count })}
      {data.total !== 0 && (
        <>
          {' · '}
          <Money
            currency={currency}
            amount={data.total}
            className="text-foreground"
          />
        </>
      )}
      {data.participantShare !== undefined && data.participantShare !== 0 && (
        <>
          {' · '}
          {t('yourShare')}{' '}
          <Money
            currency={currency}
            amount={data.participantShare}
            className="text-foreground"
          />
        </>
      )}
    </p>
  )
}

/** The expense row with the content taken out — same two lines, same two columns. */
const ExpensesLoading = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref}>
      <div className="px-4 sm:px-6 pt-3 pb-1.5">
        <Skeleton className="h-3 w-24" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="border-b px-4 sm:px-6 py-3.5">
          <div className="flex justify-between items-baseline gap-3 h-6">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="flex justify-between items-baseline gap-3 mt-0.5 h-5">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
})
ExpensesLoading.displayName = 'ExpensesLoading'
