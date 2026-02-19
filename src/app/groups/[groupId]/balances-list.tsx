import { ProfileAvatar } from '@/components/profile-avatar'
import { Balances } from '@/lib/balances'
import { Currency } from '@/lib/currency'
import { cn, formatCurrency } from '@/lib/utils'
import { Participant } from '@prisma/client'
import { useLocale } from 'next-intl'

type Props = {
  balances: Balances
  participants: Participant[]
  currency: Currency
}

export function BalancesList({ balances, participants, currency }: Props) {
  const locale = useLocale()
  const maxBalance = Math.max(
    ...Object.values(balances).map((b) => Math.abs(b.total)),
  )

  return (
    <div className="flex flex-col gap-4" data-testid="balances-list">
      {participants.map((participant) => {
        const balance = balances[participant.id]?.total ?? 0
        const isPositive = balance > 0
        const isZero = Math.abs(balance) < 0.01 // Floating point safety

        // Calculate bar width (percentage of max)
        // Ensure at least a tiny sliver is visible if there's any balance
        const percentage =
          maxBalance > 0 ? (Math.abs(balance) / maxBalance) * 100 : 0

        return (
          <div
            key={participant.id}
            className="flex items-center gap-3"
            data-testid={`balance-row-${participant.name}`}
          >
            {/* Avatar */}
            <ProfileAvatar
              name={participant.name}
              size={40}
              fontSize="text-sm"
            />

            <div className="flex-1 min-w-0 flex flex-col gap-1">
              {/* Name & Amount Row */}
              <div className="flex justify-between items-baseline">
                <span className="font-medium truncate pr-2 text-sm">
                  {participant.name}
                </span>
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums whitespace-nowrap',
                    isPositive
                      ? 'text-emerald-600 dark:text-emerald-500'
                      : isZero
                      ? 'text-muted-foreground'
                      : 'text-orange-600 dark:text-orange-500',
                  )}
                >
                  {formatCurrency(currency, balance, locale)}
                </span>
              </div>

              {/* Visual Bar Container */}
              <div className="h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden flex">
                {/* 
                  To visualize negative/positive:
                  We can split the bar in half, or just show color.
                  Standard splitwise style is simple colored bars. 
                  Let's align them.
                */}

                {isZero ? (
                  <div className="w-full h-full bg-transparent" />
                ) : (
                  // Bar wrapper
                  <div className="w-full h-full relative">
                    <div
                      className={cn(
                        'absolute h-full rounded-full transition-all duration-500 ease-out',
                        isPositive
                          ? 'bg-emerald-500 right-0'
                          : 'bg-orange-500 left-0', // Align right for positive? Or strictly left? Strictly left is easier to read usually.
                      )}
                      // Let's stick to left-aligned for mobile readability, but color coded
                      style={{ width: `${percentage}%`, left: 0 }}
                    />
                  </div>
                )}
              </div>

              {/* Optional: Text description below bar for context */}
              <div className="text-[10px] text-muted-foreground">
                {isPositive ? 'gets back' : isZero ? 'settled up' : 'owes'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
