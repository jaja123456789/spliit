'use client'
import { ExpenseCard } from '@/app/groups/[groupId]/expenses/expense-card'
import { getGroupExpensesAction } from '@/app/groups/[groupId]/expenses/expense-list-fetch-action'
import { ExpenseListTotal } from '@/app/groups/[groupId]/expenses/expense-list-total'
import { ShareButton } from '@/app/groups/[groupId]/share-button'
import { Button } from '@/components/ui/button'
import { SearchBar } from '@/components/ui/search-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { NEW_GROUP_ACTIVE_USER_KEY, writeActiveUser } from '@/lib/active-user'
import { getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ReactNode, forwardRef, useEffect, useMemo, useState } from 'react'
import { useInView } from 'react-intersection-observer'
import { useDebounce } from 'use-debounce'
import { useCurrentGroup } from '../current-group-context'

const PAGE_SIZE = 20

type ExpensesType = NonNullable<
  Awaited<ReturnType<typeof getGroupExpensesAction>>
>

const EXPENSE_GROUPS = {
  UPCOMING: 'upcoming',
  THIS_WEEK: 'thisWeek',
  EARLIER_THIS_MONTH: 'earlierThisMonth',
  LAST_MONTH: 'lastMonth',
  EARLIER_THIS_YEAR: 'earlierThisYear',
  LAST_YEAR: 'lastYear',
  OLDER: 'older',
}

function getExpenseGroup(date: Dayjs, today: Dayjs) {
  if (today.isBefore(date)) {
    return EXPENSE_GROUPS.UPCOMING
  } else if (today.isSame(date, 'week')) {
    return EXPENSE_GROUPS.THIS_WEEK
  } else if (today.isSame(date, 'month')) {
    return EXPENSE_GROUPS.EARLIER_THIS_MONTH
  } else if (today.subtract(1, 'month').isSame(date, 'month')) {
    return EXPENSE_GROUPS.LAST_MONTH
  } else if (today.isSame(date, 'year')) {
    return EXPENSE_GROUPS.EARLIER_THIS_YEAR
  } else if (today.subtract(1, 'year').isSame(date, 'year')) {
    return EXPENSE_GROUPS.LAST_YEAR
  } else {
    return EXPENSE_GROUPS.OLDER
  }
}

function getGroupedExpensesByDate(expenses: ExpensesType) {
  const today = dayjs()
  return expenses.reduce((result: { [key: string]: ExpensesType }, expense) => {
    const expenseGroup = getExpenseGroup(dayjs(expense.expenseDate), today)
    result[expenseGroup] = result[expenseGroup] ?? []
    result[expenseGroup].push(expense)
    return result
  }, {})
}

export function ExpenseList({ actions }: { actions?: ReactNode }) {
  const { groupId, group } = useCurrentGroup()
  const [searchText, setSearchText] = useState('')
  const [debouncedSearchText] = useDebounce(searchText, 300)

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
      {/* The search box is rendered by the list, not above it: a group with nothing in it should
          not offer to search it. Passed down rather than hoisted so that a search returning no
          results still keeps the box — otherwise the control would vanish under the fingers of
          whoever just typed into it. */}
      <ExpenseListForSearch
        groupId={groupId}
        searchText={debouncedSearchText}
        searchBar={
          <SearchBar onValueChange={(value) => setSearchText(value)} />
        }
      />
    </>
  )
}

const ExpenseListForSearch = ({
  groupId,
  searchText,
  searchBar,
}: {
  groupId: string
  searchText: string
  searchBar: ReactNode
}) => {
  const utils = trpc.useUtils()
  const { group } = useCurrentGroup()

  useEffect(() => {
    // Until we use tRPC more widely and can invalidate the cache on expense
    // update, it's easier and safer to invalidate the cache on page load.
    utils.groups.expenses.invalidate()
  }, [utils])

  const t = useTranslations('Expenses')
  const tEmpty = useTranslations('Expenses.EmptyGroup')
  const { ref: loadingRef, inView } = useInView()

  const {
    data,
    isLoading: expensesAreLoading,
    fetchNextPage,
  } = trpc.groups.expenses.list.useInfiniteQuery(
    { groupId, limit: PAGE_SIZE, filter: searchText },
    { getNextPageParam: ({ nextCursor }) => nextCursor },
  )
  const expenses = data?.pages.flatMap((page) => page.expenses)
  const hasMore = data?.pages.at(-1)?.hasMore ?? false

  const isLoading = expensesAreLoading || !expenses || !group

  useEffect(() => {
    if (inView && hasMore && !isLoading) fetchNextPage()
  }, [fetchNextPage, hasMore, inView, isLoading])

  const groupedExpensesByDate = useMemo(
    () => (expenses ? getGroupedExpensesByDate(expenses) : {}),
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
  // others" — the box stays, so the search can be changed.
  if (expenses.length === 0 && searchText)
    return (
      <>
        {searchBar}
        <p className="px-4 sm:px-6 py-10 text-center text-sm text-muted-foreground">
          {t('noResults', { search: searchText })}
        </p>
      </>
    )

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
        </div>
      </div>
    )

  return (
    <>
      {searchBar}
      {Object.values(EXPENSE_GROUPS).map((expenseGroup: string) => {
        let groupExpenses = groupedExpensesByDate[expenseGroup]
        if (!groupExpenses || groupExpenses.length === 0) return null

        return (
          <div key={expenseGroup}>
            {/* A section rule: mono caps, no border, sitting on the sheet it scrolls over. It was
                `bg-background`, which was indistinguishable from the sheet only because light
                --background and --card were both pure white. */}
            <div className="text-subtle-foreground text-xs font-mono uppercase tracking-[0.14em] px-4 sm:px-6 pt-4 pb-1.5 sticky top-16 z-10 bg-card">
              {t(`Groups.${expenseGroup}`)}
            </div>
            {groupExpenses.map((expense) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                currency={getCurrencyFromGroup(group)}
                groupId={groupId}
                participantCount={group.participants.length}
              />
            ))}
          </div>
        )
      })}
      {hasMore && <ExpensesLoading ref={loadingRef} />}
    </>
  )
}

/** The expense row with the content taken out — same three lines, same two columns. */
const ExpensesLoading = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref}>
      <div className="px-4 sm:px-6 pt-4 pb-1.5">
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
          <div className="mt-1 h-4 flex items-center">
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
})
ExpensesLoading.displayName = 'ExpensesLoading'
