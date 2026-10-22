'use client'
// No category glyph on the row. It repeated the same icon down the whole list — a group's expenses
// cluster in two or three categories — and cost 26px of every row's width to say something the
// title already said. The category is still chosen and shown on the expense itself.
import { DocumentsCount } from '@/app/groups/[groupId]/expenses/documents-count'
import { Money } from '@/components/money'
import { Locale } from '@/i18n/request'
import { getGroupExpenses } from '@/lib/api'
import { getBalances } from '@/lib/balances'
import { Currency, getCurrency } from '@/lib/currency'
import { useActiveUser } from '@/lib/hooks'
import { cn, formatDateOnly } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { Fragment } from 'react'

type Expense = Awaited<ReturnType<typeof getGroupExpenses>>[number]

function Participants({
  expense,
  participantCount,
}: {
  expense: Expense
  participantCount: number
}) {
  const t = useTranslations('ExpenseCard')
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

  const paidFor =
    expense.paidFor.length == participantCount && participantCount >= 4 ? (
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
    strong: (chunks) => (
      <strong className="font-medium text-foreground">{chunks}</strong>
    ),
    paidBy: payerName,
    paidFor: () => paidFor,
    forCount: expense.paidFor.length,
  })
  return <>{participants}</>
}

type Props = {
  expense: Expense
  currency: Currency
  groupId: string
  participantCount: number
}

export function ExpenseCard({
  expense,
  currency,
  groupId,
  participantCount,
}: Props) {
  const locale = useLocale()
  const activeUserId = useActiveUser(groupId)

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
    // A link, not a `div` with a click handler. The row is the only way into an expense — and so
    // into editing or deleting it — and a `div` is not focusable: tabbing through the list went
    // from the search box straight to the footer, past every row. A link also answers to
    // middle-click and "open in new tab". Not prefetched: a list of a thousand rows would otherwise
    // fetch a route for every one that scrolls past.
    <Link
      href={`/groups/${groupId}/expenses/${expense.id}/edit`}
      prefetch={false}
      data-testid={`expense-item-${expense.id}`}
      className={cn(
        'group relative flex items-start gap-3 px-4 sm:px-6 py-3.5 text-sm transition-colors hover:bg-accent/50',
        'border-b last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
        expense.isReimbursement && 'italic bg-muted/20',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline gap-3">
          <div
            className={cn(
              'font-medium text-base truncate',
              expense.isReimbursement && 'italic text-muted-foreground',
            )}
            data-testid="expense-title"
          >
            {expense.title}
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

        <div className="flex items-center gap-3 mt-1 text-xs uppercase tracking-wider text-subtle-foreground font-medium">
          <span data-testid="expense-date">
            {formatDateOnly(expense.expenseDate, locale, {
              dateStyle: 'medium',
            })}
          </span>
          <DocumentsCount count={expense._count.documents} />
        </div>
      </div>

      <ChevronRight className="w-4 h-4 self-center shrink-0 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hidden sm:block" />
    </Link>
  )
}
