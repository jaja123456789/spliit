'use client'
import { CreateFromReceiptButton } from '@/app/groups/[groupId]/expenses/create-from-receipt-button'
import { ExpenseCard } from '@/app/groups/[groupId]/expenses/expense-card'
import {
  ExpenseFiltersBar,
  useExpenseListFilters,
} from '@/app/groups/[groupId]/expenses/expense-filters-bar'
import { ExpenseListTotal } from '@/app/groups/[groupId]/expenses/expense-list-total'
import {
  PendingExpenses,
  useWarmOffline,
} from '@/app/groups/[groupId]/expenses/pending-expenses'
import { ShareButton } from '@/app/groups/[groupId]/share-button'
import { Money } from '@/components/money'
import { Button } from '@/components/ui/button'
import { SearchBar } from '@/components/ui/search-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { NEW_GROUP_ACTIVE_USER_KEY, writeActiveUser } from '@/lib/active-user'
import { assignAvatarHues } from '@/lib/avatar-hue'
import { ExpenseFilters, hasActiveFilters } from '@/lib/expense-filters'
import { useActiveUserState } from '@/lib/hooks'
import { useOutbox } from '@/lib/outbox'
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
import { ScanLine } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { ReactNode, forwardRef, useEffect, useMemo, useState } from 'react'
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
  // A group with nothing in it shows €0.00 and an export button above "Nothing here yet" — a figure
  // and an action about nothing. The list knows when that is the case; a search that found nothing
  // is not it.
  const [isEmptyGroup, setIsEmptyGroup] = useState(false)

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
      {/* Hidden, not unmounted: its scan button is the one that picks up a receipt shared to
          the app. Unmounted once the list came back empty, it closed the scanner it had just
          opened, with the photo already taken out of storage. */}
      <ExpenseListTotal actions={actions} hidden={isEmptyGroup} />
      {/* The search box and filters are rendered by the list, not above it: a group with nothing
          in it should not offer to search it. Passed down rather than hoisted so that a search
          returning no results still keeps them — otherwise the controls would vanish under the
          fingers of whoever just used them. */}
      <ExpenseListForSearch
        groupId={groupId}
        enableReceiptExtract={enableReceiptExtract}
        onEmptyChange={setIsEmptyGroup}
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
  onEmptyChange,
}: {
  groupId: string
  filters: ExpenseFilters
  onClearFilters: () => void
  searchBar: ReactNode
  enableReceiptExtract: boolean
  onEmptyChange?: (empty: boolean) => void
}) => {
  const { group } = useCurrentGroup()
  const avatarHues = useMemo(
    () => assignAvatarHues(group?.participants.map((p) => p.name) ?? []),
    [group?.participants],
  )
  const locale = useLocale()

  const t = useTranslations('Expenses')
  // The activity feed's "Today" and "Yesterday", which every language already has.
  const tDays = useTranslations('Activity.Groups')
  const tEmpty = useTranslations('Expenses.EmptyGroup')
  const tReceipt = useTranslations('CreateFromReceipt')
  const { ref: loadingRef, inView } = useInView()

  const filtered = hasActiveFilters(filters)
  const pending = useOutbox(groupId)
  useWarmOffline(groupId)
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
  const { data: monthTotals } = trpc.groups.expenses.monthTotals.useQuery(
    { groupId, ...filters },
    { placeholderData: keepPreviousData },
  )
  const isEmptyGroup =
    !isLoading &&
    !!expenses &&
    expenses.length === 0 &&
    pending.length === 0 &&
    !filtered
  useEffect(() => {
    onEmptyChange?.(isEmptyGroup)
  }, [isEmptyGroup, onEmptyChange])

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
  // Not when one is waiting to be sent: that group is not empty, it is offline.
  if (isEmptyGroup)
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
                  <ScanLine className="mr-2 h-4 w-4" />
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
      {pending.length > 0 && (
        <PendingExpenses items={pending} currency={currency} />
      )}
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
              className="section-label px-4 sm:px-6 pt-4 pb-1.5 sticky top-14 z-10 bg-card"
            >
              <span className="flex items-baseline justify-between gap-3">
                <time dateTime={month}>
                  {formatDateOnly(new Date(`${month}-01`), locale, {
                    month: 'long',
                    year: month.startsWith(thisYear) ? undefined : 'numeric',
                  })}
                </time>
                {/* What the month came to: the question a household asks of a month, which the
                    rows could not answer because they arrive twenty at a time. */}
                {monthTotals?.months[month] !== undefined && (
                  <Money
                    currency={currency}
                    amount={monthTotals.months[month]}
                    className="text-xs text-muted-foreground"
                  />
                )}
              </span>
            </h3>
            {expenses.map((expense) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                dateLabel={dayLabel(expense)}
                currency={currency}
                groupId={groupId}
                participantCount={group.participants.length}
                avatarHues={avatarHues}
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
      {filters.month && (
        <>
          {' · '}
          <Link
            href={`/groups/${groupId}/stats?month=${filters.month}`}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {t('statement')}
          </Link>
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
