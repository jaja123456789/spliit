'use client'
// No category column on the row: a full icon repeated down the list cost 26px of every row's width.
// The category is a small coloured badge on the payer's plate instead, which costs none.
// The row leads with who paid instead: that changes from row to row, and a person's plate is the
// same colour on every screen, so a long list can be read by person at a glance.
import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import { DocumentsCount } from '@/app/groups/[groupId]/expenses/documents-count'
import {
  ExpenseRowMenu,
  ExpenseRowSheet,
  useLongPress,
} from '@/app/groups/[groupId]/expenses/expense-row-actions'
import { Money } from '@/components/money'
import { ProfileAvatar } from '@/components/profile-avatar'
import { Locale } from '@/i18n/request'
import { getGroupExpenses } from '@/lib/api'
import { getBalances } from '@/lib/balances'
import { categoryColor, isUncategorized } from '@/lib/category-colors'
import { Currency, getCurrency } from '@/lib/currency'
import { useActiveUser } from '@/lib/hooks'
import { cn, toDateInputValue } from '@/lib/utils'
import { ArrowLeftRight, MessageSquare, Repeat } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { Fragment, ReactNode, useState } from 'react'

type Expense = Awaited<ReturnType<typeof getGroupExpenses>>[number]

/**
 * Languages the shorter "Paid by X" is written in. Everywhere else the full sentence stays, rather
 * than one translated sentence turning into English halfway down the list.
 */
const SHORT_SENTENCE_LOCALES = new Set(['en-US'])

/**
 * Whether the row's avatar already says who paid, so the line under the title need not: English,
 * one payer, and an expense rather than income. "Paid by Alex" then moves into text only a screen
 * reader hears — the plate is decorative and hidden from it.
 */
function payerShownByAvatar(expense: Expense, locale: string) {
  return (
    SHORT_SENTENCE_LOCALES.has(locale) &&
    expense.paidBy.length === 1 &&
    expense.amount > 0
  )
}

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
  const hidePayer = payerShownByAvatar(expense, locale)

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
    const sentence = t.rich(
      key === 'paidBy' ? 'paidByOnly' : 'receivedByOnly',
      { strong, paidBy: payerName },
    )
    return hidePayer ? (
      <span className="sr-only">{sentence}</span>
    ) : (
      <>{sentence}</>
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
  if (hidePayer) {
    return (
      <>
        <span className="sr-only">
          {t.rich('paidByOnly', { strong, paidBy: payerName })}{' '}
        </span>
        {t.rich('forOnly', { strong, paidFor: () => paidFor })}
      </>
    )
  }
  const participants = t.rich(key, {
    strong,
    paidBy: payerName,
    paidFor: () => paidFor,
    forCount: expense.paidFor.length,
  })
  return <>{participants}</>
}

/**
 * A payment is a transfer between two people, so it reads as one: "Robin paid you". It used to read
 * as an expense titled "Payment" — "Paid by Robin for Alex" — with your balance change beside it,
 * which for a payment you received was −€350.00 in the debt colour: right in balance terms (you
 * are owed €350 less), and read as a loss on the one row that is good news.
 */
function PaymentLine({
  expense,
  activeUserId,
}: {
  expense: Expense
  activeUserId: string | null
}) {
  const t = useTranslations('ExpenseCard')
  const payer = expense.paidBy[0]?.participant
  const recipients = expense.paidFor.map(({ participant }) => participant)
  const names = (people: { name: string }[]) =>
    people.map(({ name }) => name).join(', ')
  if (activeUserId && payer?.id === activeUserId)
    return <>{t('paymentByYou', { to: names(recipients) })}</>
  if (
    activeUserId &&
    recipients.length === 1 &&
    recipients[0].id === activeUserId
  )
    return <>{t('paymentToYou', { from: payer?.name ?? '' })}</>
  return (
    <>
      {t('paymentBetween', { from: payer?.name ?? '', to: names(recipients) })}
    </>
  )
}

/**
 * The title a payment was saved with, when somebody wrote one. The app titles them itself —
 * "Payment from Robin to Alex", or plain "Payment" from older versions — and a row that already
 * says "Robin paid Alex" has no use for that, but a note like "October rent share" it does.
 */
function usePaymentNote(expense: Expense) {
  const t = useTranslations('Payment')
  const from = expense.paidBy[0]?.participant.name ?? ''
  const to = expense.paidFor
    .map(({ participant }) => participant.name)
    .join(', ')
  const title = expense.title.trim()
  const generated =
    title === '' ||
    /^payment$/i.test(title) ||
    /^payment from .+ to .+$/i.test(title) ||
    title === t('defaultTitle', { from, to })
  return generated ? null : title
}

type Props = {
  expense: Expense
  /** The expense's day, as the list words it: "Today", "Oct 21". Its month heads the section. */
  dateLabel: string
  currency: Currency
  groupId: string
  participantCount: number
  /** The group's plates, settled once for the whole list by `assignAvatarHues`. */
  avatarHues?: Map<string, number>
}

export function ExpenseCard({
  expense,
  dateLabel,
  currency,
  groupId,
  participantCount,
  avatarHues,
}: Props) {
  const locale = useLocale()
  const tComments = useTranslations('ExpenseComments')
  const tCard = useTranslations('ExpenseCard')
  const activeUserId = useActiveUser(groupId)
  const [sheetOpen, setSheetOpen] = useState(false)
  const longPress = useLongPress(() => setSheetOpen(true))
  const isPayment = expense.isReimbursement
  const paymentNote = usePaymentNote(expense)

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
    <div className="flex items-center border-b last:border-b-0 transition-colors hover:bg-accent/50">
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
        )}
      >
        <div className="shrink-0 self-center">
          {isPayment ? (
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-full bg-muted text-subtle-foreground"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </span>
          ) : (
            expense.paidBy[0] && (
              // The category rides on the payer's plate as a badge: colour and a glyph in the
              // corner, where it costs the row no width — the reason a full category icon was taken
              // off the row. General and Payment carry none; they would say nothing.
              <span className="relative block">
                <ProfileAvatar
                  name={expense.paidBy[0].participant.name}
                  hue={avatarHues?.get(expense.paidBy[0].participant.name)}
                  isActiveUser={
                    !!activeUserId &&
                    expense.paidBy[0].participant.id === activeUserId
                  }
                  size={32}
                />
                {!isUncategorized(expense.category?.grouping) && (
                  <span
                    aria-hidden
                    data-testid="category-badge"
                    className="absolute -bottom-1.5 -right-2.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-card ring-2 ring-card"
                    style={{ color: categoryColor(expense.category?.grouping) }}
                  >
                    <CategoryIcon
                      category={expense.category}
                      className="h-3 w-3"
                      strokeWidth={2.5}
                    />
                  </span>
                )}
              </span>
            )
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline gap-3">
            <div className="flex items-baseline gap-2 min-w-0">
              <div
                className="flex min-w-0 items-center gap-1.5 font-medium text-base"
                data-testid="expense-title"
              >
                <span className="truncate">
                  {isPayment ? (
                    <PaymentLine
                      expense={expense}
                      activeUserId={activeUserId}
                    />
                  ) : (
                    expense.title
                  )}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-subtle-foreground">
                {expense.recurrenceRule &&
                  expense.recurrenceRule !== 'NONE' && (
                    // Rent, internet, a subscription: written by the schedule, not by someone.
                    <span
                      className="flex items-center"
                      data-testid="expense-recurring"
                      title={tCard('recurring')}
                    >
                      <Repeat className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">{tCard('recurring')}</span>
                    </span>
                  )}
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
                bold={!isPayment}
                className="text-base"
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
              {isPayment ? (
                paymentNote && (
                  <>
                    <span aria-hidden> · </span>
                    {paymentNote}
                  </>
                )
              ) : (
                <>
                  {!(
                    payerShownByAvatar(expense, locale) &&
                    expense.paidFor.length === participantCount
                  ) && <span aria-hidden> · </span>}
                  <Participants
                    expense={expense}
                    participantCount={participantCount}
                  />
                </>
              )}
            </div>
            <div className="shrink-0 text-xs">
              {original ? (
                <Money
                  currency={original.currency}
                  amount={original.amount}
                  className="text-subtle-foreground"
                />
              ) : (
                !isPayment &&
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
