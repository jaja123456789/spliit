'use client'
// No category glyph on the row. It repeated the same icon down the whole list — a group's expenses
// cluster in two or three categories — and cost 26px of every row's width to say something the
// title already said. The category is still chosen and shown on the expense itself.
import { DocumentsCount } from '@/app/groups/[groupId]/expenses/documents-count'
import {
  ExpenseRowMenu,
  ExpenseRowSheet,
  useLongPress,
} from '@/app/groups/[groupId]/expenses/expense-row-actions'
import { Money } from '@/components/money'
import { Locale } from '@/i18n/request'
import { getGroupExpenses } from '@/lib/api'
import { getBalances } from '@/lib/balances'
import { Currency, getCurrency } from '@/lib/currency'
import { useActiveUser } from '@/lib/hooks'
import { cn, toDateInputValue } from '@/lib/utils'
import { MessageSquare } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { Fragment, ReactNode, useState } from 'react'

type Expense = Awaited<ReturnType<typeof getGroupExpenses>>[number]

/**
 * Languages the shorter "Paid by X" is written in. Everywhere else the full sentence stays, rather
 * than one translated sentence turning into English halfway down the list.
 */
const SHORT_SENTENCE_LOCALES = new Set(['en-US'])

function Participants({
  expense,
  participantCount,
}: {
  expense: Expense
  participantCount: number
}) {
  const t = useTranslations('ExpenseCard')
  const locale = useLocale()
  const key = expense.amount > 0 ? 'paidBy' : 'receivedBy'

  // Handle multiple payers display
  let payerName = ''
  if (expense.paidBy.length === 1) {
    payerName = expense.paidBy[0].participant.name
  } else if (expense.paidBy.length > 1) {
    payerName = `${expense.paidBy[0].participant.name} & ${
      expense.paidBy.length - 1
    } more`
  } else {
    payerName = 'Unknown'
  }

  const strong = (chunks: ReactNode) => (
    <strong className="font-medium text-foreground">{chunks}</strong>
  )

  // Shared by the whole group — what nearly every expense is. Saying so on every row ("for Alice,
  // Bob") buried the rows that are not, which are the ones worth reading. A count is enough to
  // tell: removing someone from a group removes their shares with them, so every share belongs to
  // a current member.
  const forEveryone = expense.paidFor.length === participantCount
  if (forEveryone && SHORT_SENTENCE_LOCALES.has(locale)) {
    return (
      <>
        {t.rich(key === 'paidBy' ? 'paidByOnly' : 'receivedByOnly', {
          strong,
          paidBy: payerName,
        })}
      </>
    )
  }

  const paidFor =
    forEveryone && participantCount >= 4 ? (
      <strong>{t('everyone')}</strong>
    ) : (
      expense.paidFor.map((paidFor, index) => (
        <Fragment key={index}>
          {index !== 0 && <>, </>}
          <strong>{paidFor.participant.name}</strong>
        </Fragment>
      ))
    )
  const participants = t.rich(key, {
    strong,
    paidBy: payerName,
    paidFor: () => paidFor,
    forCount: expense.paidFor.length,
  })
  return <>{participants}</>
}

type Props = {
  expense: Expense
  /** The expense's day, as the list words it: "Today", "Oct 21". Its month heads the section. */
  dateLabel: string
  currency: Currency
  groupId: string
  participantCount: number
}

export function ExpenseCard({
  expense,
  dateLabel,
  currency,
  groupId,
  participantCount,
}: Props) {
  const locale = useLocale()
  const tComments = useTranslations('ExpenseComments')
  const activeUserId = useActiveUser(groupId)
  const [sheetOpen, setSheetOpen] = useState(false)
  const longPress = useLongPress(() => setSheetOpen(true))

  let userBalanceAmount = 0

  if (activeUserId) {
    const balances = getBalances([expense])
    if (balances[activeUserId]) {
      userBalanceAmount = balances[activeUserId].total
    }
  }

  // A converted row trades one piece of secondary information for the other rather than growing a
  // third line: the original amount takes the slot under the figure where your share would sit.
  const original =
    expense.originalCurrency &&
    expense.originalAmount !== null &&
    expense.originalCurrency !== currency.code
      ? {
          currency: getCurrency(expense.originalCurrency, locale as Locale),
          amount: expense.originalAmount,
        }
      : null

  return (
    // Its actions sit beside the link rather than inside it: a button within a link is two
    // controls fighting over one click.
    <div
      className={cn(
        'flex items-center border-b last:border-b-0 transition-colors hover:bg-accent/50',
        expense.isReimbursement && 'bg-muted/20',
      )}
    >
      {/* A link, not a `div` with a click handler. The row is the only way into an expense, and a
          `div` is not focusable: tabbing through the list went from the search box straight to
          the footer, past every row. A link also answers to middle-click and "open in new tab".
          Not prefetched: a list of a thousand rows would otherwise fetch a route for every one
          that scrolls past. Held down on a phone, it offers the row's actions instead. */}
      <Link
        href={`/groups/${groupId}/expenses/${expense.id}/edit`}
        prefetch={false}
        data-testid={`expense-item-${expense.id}`}
        {...longPress}
        className={cn(
          'relative flex flex-1 min-w-0 items-start gap-3 px-4 sm:pl-6 sm:pr-2 py-3.5 text-sm',
          'select-none [-webkit-touch-callout:none]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
          expense.isReimbursement && 'italic',
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline gap-3">
            <div className="flex items-baseline gap-2 min-w-0">
              <div
                className={cn(
                  'font-medium text-base truncate',
                  expense.isReimbursement && 'italic text-muted-foreground',
                )}
                data-testid="expense-title"
              >
                {expense.title}
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-subtle-foreground">
                <DocumentsCount count={expense._count.documents} />
                {expense._count.comments > 0 && (
                  <span
                    className="flex items-center"
                    aria-label={tComments('count', {
                      count: expense._count.comments,
                    })}
                    data-testid="expense-comment-count"
                  >
                    <MessageSquare
                      className="mr-1 mt-0.5 h-3.5 w-3.5"
                      aria-hidden
                    />
                    {expense._count.comments}
                  </span>
                )}
              </div>
            </div>
            <div className="shrink-0" data-testid="expense-amount">
              <Money
                currency={currency}
                amount={expense.amount}
                bold={!expense.isReimbursement}
                className={cn('text-base', expense.isReimbursement && 'italic')}
              />
            </div>
          </div>

          <div className="flex justify-between items-baseline gap-3 mt-0.5">
            <div className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {/* The day leads the line it shares with the payer: a line of its own under every row
                said the same thing as the rows around it. */}
              <time
                dateTime={toDateInputValue(expense.expenseDate)}
                data-testid="expense-date"
                className="text-subtle-foreground"
              >
                {dateLabel}
              </time>
              <span aria-hidden> · </span>
              <Participants
                expense={expense}
                participantCount={participantCount}
              />
            </div>
            <div className="shrink-0 text-xs">
              {original ? (
                <Money
                  currency={original.currency}
                  amount={original.amount}
                  className="text-subtle-foreground"
                />
              ) : (
                userBalanceAmount !== 0 && (
                  // Your share as a signed figure rather than a sentence. "You lent" and
                  // "You borrowed" were hard-coded English in a 23-locale app; the sign says the
                  // same thing in every one of them.
                  <Money
                    currency={currency}
                    amount={userBalanceAmount}
                    signed
                    colored
                  />
                )
              )}
            </div>
          </div>
        </div>
      </Link>
      <div className="hidden sm:flex shrink-0 pr-4">
        <ExpenseRowMenu
          groupId={groupId}
          expenseId={expense.id}
          title={expense.title}
        />
      </div>
      {sheetOpen && (
        <ExpenseRowSheet
          open
          onOpenChange={setSheetOpen}
          groupId={groupId}
          expenseId={expense.id}
          title={expense.title}
        />
      )}
    </div>
  )
}
