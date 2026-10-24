'use client'
import { useRestoreExpense } from '@/app/groups/[groupId]/expenses/use-delete-expense'
import { Money } from '@/components/money'
import { ProfileAvatar } from '@/components/profile-avatar'
import { Button } from '@/components/ui/button'
import { ActivityChange, decodeActivityData } from '@/lib/activity-changes'
import { Currency } from '@/lib/currency'
import { useActiveUser } from '@/lib/hooks'
import { DateTimeStyle, cn, formatDate } from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { ActivityType, Participant } from '@prisma/client'
import { ArrowLeftRight, ChevronRight, Repeat, UserRound } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'

export type Activity =
  AppRouterOutput['groups']['activities']['list']['activities'][number]

type Props = {
  groupId: string
  activity: Activity
  participant?: Participant
  /** The group's people, to name both ends of a payment. */
  participants?: Participant[]
  /** The plates `assignAvatarHues` gave the group's names, so a face here matches the list's. */
  avatarHues?: Map<string, number>
  dateStyle: DateTimeStyle
  currency?: Currency
}

function useSummary(
  activity: Activity,
  participantName?: string,
  participants?: Participant[],
) {
  const t = useTranslations('Activity')
  const participant = participantName ?? t('someone')
  const {
    title: expense,
    occurrences,
    restored,
  } = decodeActivityData(activity.data)

  const tr = (key: string) =>
    t.rich(key, {
      expense,
      participant,
      count: occurrences ?? 1,
      em: (chunks) => <em>&ldquo;{chunks}&rdquo;</em>,
      strong: (chunks) => <strong>{chunks}</strong>,
    })

  // A payment is not an expense somebody created; it is money that moved. "Expense "Payment"
  // created by Robin" said neither who received it nor how much.
  const payment = isPaymentRecorded(activity) ? activity.expense : null
  const nameOf = (id?: string) =>
    participants?.find((p) => p.id === id)?.name ?? t('someone')
  if (payment) {
    return (
      <>
        {t.rich('paymentRecorded', {
          payer: nameOf(payment.paidBy[0]?.participantId),
          recipient: payment.paidFor
            .map((p) => nameOf(p.participantId))
            .join(', '),
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </>
    )
  }

  if (activity.activityType == ActivityType.UPDATE_GROUP) {
    return <>{tr('settingsModified')}</>
  } else if (
    activity.activityType == ActivityType.CREATE_EXPENSE &&
    occurrences !== undefined
  ) {
    // Nobody created these: the schedule did. "Created by Someone" was the closest the feed had.
    return <>{tr('recurringCreated')}</>
  } else if (activity.activityType == ActivityType.CREATE_EXPENSE && restored) {
    return <>{tr('expenseRestored')}</>
  } else if (activity.activityType == ActivityType.CREATE_EXPENSE) {
    return <>{tr('expenseCreated')}</>
  } else if (activity.activityType == ActivityType.UPDATE_EXPENSE) {
    return <>{tr('expenseUpdated')}</>
  } else if (activity.activityType == ActivityType.DELETE_EXPENSE) {
    return <>{tr('expenseDeleted')}</>
  } else if (activity.activityType == ActivityType.COMMENT_EXPENSE) {
    return <>{tr('expenseCommented')}</>
  }
}

/** A payment's own line, rather than "Expense "Payment" created": only when one is first recorded. */
function isPaymentRecorded(activity: Activity) {
  const { occurrences, restored } = decodeActivityData(activity.data)
  return (
    !!activity.expense?.isReimbursement &&
    activity.activityType == ActivityType.CREATE_EXPENSE &&
    occurrences === undefined &&
    !restored
  )
}

const MARK =
  'grid h-8 w-8 place-items-center rounded-full bg-muted text-subtle-foreground'

export function ActivityItem({
  groupId,
  activity,
  participant,
  participants,
  avatarHues,
  dateStyle,
  currency,
}: Props) {
  const locale = useLocale()
  const t = useTranslations('Activity.Changes')
  const tActivity = useTranslations('Activity')
  const activeUser = useActiveUser(groupId)
  const restore = useRestoreExpense(groupId)
  const [restoring, setRestoring] = useState(false)

  const expenseExists = activity.expense !== undefined
  const summary = useSummary(activity, participant?.name, participants)
  const { changes, deleted, comment, occurrences } = decodeActivityData(
    activity.data,
  )
  const isDeletion = activity.activityType === ActivityType.DELETE_EXPENSE
  // A deletion that kept a copy of the expense, which is not back yet.
  const restorable = isDeletion && !!deleted && !expenseExists

  // What the row is about, in money: the expense as it stands now or, for a deletion, as it stood
  // when it went. A comment and a change of settings are not about an amount.
  const amount = isDeletion
    ? deleted?.amount
    : activity.activityType === ActivityType.COMMENT_EXPENSE ||
      activity.activityType === ActivityType.UPDATE_GROUP
    ? undefined
    : activity.expense?.amount

  // Who did it, as the expense list shows who paid: a face where there is a person, a mark where
  // there is not. A payment leads with the ⇄ its row has in the list — its sentence already names
  // both people, and the face of whoever typed it in would read as one of them. Catching up a
  // recurring expense was the schedule's doing.
  const lead = isPaymentRecorded(activity) ? (
    <span aria-hidden className={MARK}>
      <ArrowLeftRight className="h-4 w-4" />
    </span>
  ) : occurrences !== undefined ? (
    <span aria-hidden className={MARK}>
      <Repeat className="h-4 w-4" />
    </span>
  ) : participant ? (
    <ProfileAvatar
      name={participant.name}
      hue={avatarHues?.get(participant.name)}
      isActiveUser={!!activeUser && participant.id === activeUser}
      size={32}
    />
  ) : (
    <span aria-hidden className={MARK}>
      <UserRound className="h-4 w-4" />
    </span>
  )

  // Amounts are stored in minor units; everything else is already display text.
  const renderValue = (change: ActivityChange, value: string) =>
    change.field === 'amount' && currency ? (
      <Money currency={currency} amount={Number(value)} />
    ) : (
      value
    )

  // `-mx-2 px-2`: the face lines up with the date rules above it, and the hover still reaches past
  // the text on both sides.
  const rowClassName = cn(
    '-mx-2 flex items-start gap-3 sm:rounded-lg px-2 py-2.5 text-sm hover:bg-accent',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
  )
  const testId = `activity-item-${activity.id}`

  const content = (
    <>
      <div className="shrink-0">{lead}</div>
      <div className="min-w-0 flex-1">
        <div className="leading-snug">{summary}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {dateStyle !== undefined && (
            <>{formatDate(activity.time, locale, { dateStyle })} · </>
          )}
          {formatDate(activity.time, locale, { timeStyle: 'short' })}
        </div>
        {comment && (
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
            &ldquo;{comment}&rdquo;
          </p>
        )}
        {changes.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
            {changes.map((change, index) => (
              <li key={index}>
                {t(change.field)}{' '}
                <span className="line-through">
                  {renderValue(change, change.from)}
                </span>{' '}
                <span className="text-foreground">
                  {renderValue(change, change.to)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {((amount !== undefined && currency) || restorable) && (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {amount !== undefined && currency && (
            <span
              data-testid="activity-amount"
              // Struck through once deleted: it no longer counts, as in the list of changes.
              className={cn(
                'leading-snug',
                isDeletion && 'text-muted-foreground line-through',
              )}
            >
              {/* A catch-up adds several at once; the figure is each one, not their sum. */}
              {occurrences !== undefined && occurrences > 1 && (
                <span className="text-xs text-muted-foreground">
                  {occurrences} ×{' '}
                </span>
              )}
              <Money currency={currency} amount={amount} />
            </span>
          )}
          {restorable && (
            <Button
              variant="outline"
              size="sm"
              disabled={restoring}
              onClick={async () => {
                setRestoring(true)
                await restore({
                  activityId: activity.id,
                  title: deleted.title,
                  participantId: activeUser ?? undefined,
                })
                setRestoring(false)
              }}
            >
              {tActivity('restore')}
            </Button>
          )}
        </div>
      )}
      {expenseExists && (
        <ChevronRight
          aria-hidden
          className="self-center hidden sm:block w-4 h-4 shrink-0 text-subtle-foreground"
        />
      )}
    </>
  )

  // A link when there is an expense to open, so a keyboard can reach it too. It was a `div` with a
  // click handler, and its one focusable part — the chevron — is hidden on phones.
  return expenseExists ? (
    <Link
      href={`/groups/${groupId}/expenses/${activity.expenseId}/edit`}
      prefetch={false}
      className={rowClassName}
      data-testid={testId}
    >
      {content}
    </Link>
  ) : (
    <div className={rowClassName} data-testid={testId}>
      {content}
    </div>
  )
}
