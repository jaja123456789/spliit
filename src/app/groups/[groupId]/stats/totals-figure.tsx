'use client'
import { Currency } from '@/lib/currency'
import { cn, formatCurrency } from '@/lib/utils'
import { useLocale } from 'next-intl'

/**
 * One labelled figure on the stats page.
 *
 * `tone` is deliberately opt-in. Red and green mean "you owe" and "you are owed" throughout this
 * app, so a spending figure must not wear them: what you paid is not a debt, and colouring an
 * ordinary positive number red reads as a warning that isn't there. Only the balance gets a tone.
 */
export function TotalsFigure({
  label,
  amount,
  currency,
  tone = 'neutral',
  testId,
}: {
  label: string
  amount: number
  currency: Currency
  tone?: 'neutral' | 'balance'
  testId?: string
}) {
  const locale = useLocale()
  const isCredit = amount > 0
  const isSettled = Math.abs(amount) < 0.01

  return (
    <div data-testid={testId}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div
        className={cn(
          'text-lg',
          tone === 'balance' &&
            !isSettled &&
            (isCredit ? 'text-green-600' : 'text-red-600'),
        )}
      >
        {/* Always the magnitude: the balance's label already says "You owe" or "You are owed",
            and "You owe -$81.49" reads as the opposite of what it means. */}
        {formatCurrency(currency, Math.abs(amount), locale)}
      </div>
    </div>
  )
}
