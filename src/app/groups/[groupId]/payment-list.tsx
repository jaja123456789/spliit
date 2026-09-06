'use client'

import { Money } from '@/components/money'
import { ProfileAvatar } from '@/components/profile-avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { assignAvatarHues } from '@/lib/avatar-hue'
import { Currency } from '@/lib/currency'
import { useActiveUser } from '@/lib/hooks'
import { trpc } from '@/trpc/client'
import { Participant } from '@prisma/client'
import { Plus } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'

type Props = {
  groupId: string
  participants: Participant[]
  currency: Currency
}

/**
 * The payments that have already been made.
 *
 * Until now these existed only as italic rows in the expense list — a payment filed among the
 * expenses it exists to cancel out, in the one list that has to remember to exclude it from every
 * total. Here they are the second half of the settling story: what is left to settle, then what has
 * been settled.
 *
 * The list is its own query rather than a filter over the expense list, because the expense list
 * pages twenty at a time: filtering it on the client would show the payments that happen to be on
 * page one and look right while being wrong.
 *
 * Every row links to the expense it is stored as, which is the only way to correct or delete one.
 */
export function PaymentList({ groupId, participants, currency }: Props) {
  const t = useTranslations('Balances.Payments')
  const tBalances = useTranslations('Balances')
  const format = useFormatter()
  const activeUserId = useActiveUser(groupId)
  const { data, isLoading } = trpc.groups.payments.list.useQuery({ groupId })

  const nameOf = (id: string | null) =>
    participants.find((p) => p.id === id)?.name ?? ''

  // A row titled after the payment rather than after a person falls through to the name's own
  // preference, which is the right answer: it is not one of the group's people.
  const avatarHues = assignAvatarHues(participants.map((p) => p.name))

  const recordRow = (
    <Link
      href={`/groups/${groupId}/payments/create`}
      className="flex items-center gap-2 py-3 text-sm font-medium text-primary hover:underline"
      data-testid="record-payment"
    >
      <Plus className="h-4 w-4" />
      {tBalances('recordPayment')}
    </Link>
  )

  if (isLoading) {
    return (
      <div data-testid="payments-list">
        <PaymentsLoading />
        {recordRow}
      </div>
    )
  }

  const payments = data?.payments ?? []

  return (
    <div data-testid="payments-list">
      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground pt-1">{t('none')}</p>
      ) : (
        payments.map((payment) => {
          // A payment recorded here is one payer and one payee. One created through the expense
          // form with the reimbursement box ticked need not be, so a row that cannot be read as a
          // direction falls back to its own title rather than inventing one.
          const fromName = nameOf(payment.from)
          const toName = nameOf(payment.to)
          const readsAsDirection = payment.isSimple && fromName && toName

          return (
            <Link
              key={payment.id}
              href={`/groups/${groupId}/expenses/${payment.id}/edit`}
              className="flex items-center gap-3 py-3 border-b last:border-0 hover:bg-muted/40 -mx-2 px-2 rounded-md"
              data-testid={`payment-row-${payment.id}`}
            >
              <ProfileAvatar
                name={readsAsDirection ? fromName : payment.title}
                hue={readsAsDirection ? avatarHues.get(fromName) : undefined}
                isActiveUser={!!activeUserId && activeUserId === payment.from}
                size={32}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {readsAsDirection ? (
                    <>
                      {fromName}
                      <span className="text-subtle-foreground"> → </span>
                      {activeUserId === payment.to ? tBalances('you') : toName}
                    </>
                  ) : (
                    payment.title
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {payment.notes
                    ? `${payment.notes} · ${format.dateTime(
                        payment.expenseDate,
                        { day: 'numeric', month: 'short' },
                      )}`
                    : format.dateTime(payment.expenseDate, {
                        day: 'numeric',
                        month: 'short',
                      })}
                </div>
              </div>
              {/* Uncoloured: a payment is not a credit or a debt, it is the thing that cancels
                  one. Colouring it would put a green figure next to a balance it made smaller. */}
              <Money currency={currency} amount={payment.amount} />
            </Link>
          )
        })
      )}
      {data?.hasMore && (
        <p className="pt-3 text-xs text-subtle-foreground">{t('more')}</p>
      )}
      {recordRow}
    </div>
  )
}

const PaymentsLoading = () => (
  <div className="flex flex-col">
    {Array(2)
      .fill(undefined)
      .map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 py-3 border-b last:border-0"
        >
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
  </div>
)
