'use client'
import { Button } from '@/components/ui/button'
import { ActivityChange, decodeActivityData } from '@/lib/activity-changes'
import { Currency } from '@/lib/currency'
import { DateTimeStyle, cn, formatCurrency, formatDate } from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { ActivityType, Participant } from '@prisma/client'
import { ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export type Activity =
  AppRouterOutput['groups']['activities']['list']['activities'][number]

type Props = {
  groupId: string
  activity: Activity
  participant?: Participant
  dateStyle: DateTimeStyle
  currency?: Currency
}

function useSummary(activity: Activity, participantName?: string) {
  const t = useTranslations('Activity')
  const participant = participantName ?? t('someone')
  const expense = decodeActivityData(activity.data).title

  const tr = (key: string) =>
    t.rich(key, {
      expense,
      participant,
      em: (chunks) => <em>&ldquo;{chunks}&rdquo;</em>,
      strong: (chunks) => <strong>{chunks}</strong>,
    })

  if (activity.activityType == ActivityType.UPDATE_GROUP) {
    return <>{tr('settingsModified')}</>
  } else if (activity.activityType == ActivityType.CREATE_EXPENSE) {
    return <>{tr('expenseCreated')}</>
  } else if (activity.activityType == ActivityType.UPDATE_EXPENSE) {
    return <>{tr('expenseUpdated')}</>
  } else if (activity.activityType == ActivityType.DELETE_EXPENSE) {
    return <>{tr('expenseDeleted')}</>
  }
}

export function ActivityItem({
  groupId,
  activity,
  participant,
  dateStyle,
  currency,
}: Props) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('Activity.Changes')

  const expenseExists = activity.expense !== undefined
  const summary = useSummary(activity, participant?.name)
  const { changes } = decodeActivityData(activity.data)

  // Amounts are stored in minor units; everything else is already display text.
  const renderValue = (change: ActivityChange, value: string) =>
    change.field === 'amount' && currency
      ? formatCurrency(currency, Number(value), locale)
      : value

  return (
    <div
      className={cn(
        'flex justify-between sm:rounded-lg px-2 sm:pr-1 sm:pl-2 py-2 text-sm hover:bg-accent gap-1 items-stretch',
        expenseExists && 'cursor-pointer',
      )}
      onClick={() => {
        if (expenseExists) {
          router.push(`/groups/${groupId}/expenses/${activity.expenseId}/edit`)
        }
      }}
      data-testid={`activity-item-${activity.id}`}
    >
      <div className="flex flex-col justify-between items-start">
        {dateStyle !== undefined && (
          <div className="mt-1 text-xs/5 text-muted-foreground">
            {formatDate(activity.time, locale, { dateStyle })}
          </div>
        )}
        <div className="my-1 text-xs/5 text-muted-foreground">
          {formatDate(activity.time, locale, { timeStyle: 'short' })}
        </div>
      </div>
      <div className="flex-1">
        <div className="m-1">{summary}</div>
        {changes.length > 0 && (
          <ul className="m-1 mt-0 flex flex-col gap-0.5 text-xs text-muted-foreground">
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
      {expenseExists && (
        <Button
          size="icon"
          variant="link"
          className="self-center hidden sm:flex w-5 h-5"
          asChild
        >
          <Link href={`/groups/${groupId}/expenses/${activity.expenseId}/edit`}>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </Button>
      )}
    </div>
  )
}
