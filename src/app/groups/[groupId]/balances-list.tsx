'use client'

import { Money } from '@/components/money'
import { ProfileAvatar } from '@/components/profile-avatar'
import { assignAvatarHues } from '@/lib/avatar-hue'
import { Balances } from '@/lib/balances'
import { Currency } from '@/lib/currency'
import { useActiveUser } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { Participant } from '@prisma/client'
import { useTranslations } from 'next-intl'

type Props = {
  balances: Balances
  participants: Participant[]
  currency: Currency
  groupId: string
}

export function BalancesList({
  balances,
  participants,
  currency,
  groupId,
}: Props) {
  const t = useTranslations('Balances')
  const activeUserId = useActiveUser(groupId)
  // `useActiveUser` is null both before its effect runs and when nobody is selected.
  const isActiveUser = (id: string) => !!activeUserId && activeUserId === id

  // Settled once for the whole group rather than per row, so no two people here wear the same
  // plate and each of them wears it on every other screen too.
  const avatarHues = assignAvatarHues(participants.map((p) => p.name))

  // `Math.max()` of an empty list is -Infinity, which would turn every width into NaN.
  const totals = Object.values(balances).map((b) => Math.abs(b.total))
  const maxBalance = totals.length > 0 ? Math.max(...totals) : 0

  return (
    <div className="flex flex-col gap-4" data-testid="balances-list">
      {participants.map((participant) => {
        const balance = balances[participant.id]?.total ?? 0
        const isPositive = balance > 0
        const isZero = Math.abs(balance) < 0.01 // Floating point safety
        const isYou = isActiveUser(participant.id)

        // The track is diverging: debts grow left from the centre, credits grow right. Each side
        // is therefore only half the track, so the largest balance fills 50%, not 100%.
        const percentage =
          maxBalance > 0 ? (Math.abs(balance) / maxBalance) * 50 : 0

        return (
          <div
            key={participant.id}
            className="flex items-center gap-3"
            data-testid={`balance-row-${participant.name}`}
          >
            <ProfileAvatar
              name={participant.name}
              hue={avatarHues.get(participant.name)}
              isActiveUser={isYou}
              size={40}
            />

            <div className="flex-1 min-w-0 flex flex-col gap-1">
              {/* Name & Amount Row */}
              <div className="flex justify-between items-baseline gap-2">
                <span className="font-medium truncate pr-2 text-sm">
                  {participant.name}
                  {/* Rendered inline so it doesn't reflow the row when it appears a frame late. */}
                  {isYou && (
                    <span className="ml-1.5 font-normal text-xs text-muted-foreground">
                      ({t('you')})
                    </span>
                  )}
                </span>
                <Money
                  currency={currency}
                  amount={balance}
                  signed
                  colored
                  bold
                  className="text-sm"
                />
              </div>

              {/* Diverging bar: direction is encoded in position as well as colour, so it still
                  reads for someone who cannot separate the two hues. */}
              <div className="relative h-1.5 w-full bg-secondary/50 rounded-full">
                <div
                  className="absolute inset-y-[-2px] left-1/2 w-px -translate-x-1/2 bg-border"
                  aria-hidden="true"
                />
                {!isZero && (
                  <div
                    className={cn(
                      'absolute inset-y-0 rounded-full transition-all duration-500 ease-out',
                      isPositive ? 'left-1/2 bg-credit' : 'right-1/2 bg-debt',
                    )}
                    style={{ width: `${percentage}%` }}
                  />
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                {isPositive
                  ? t('getsBack')
                  : isZero
                  ? t('settledUp')
                  : t('owes')}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
