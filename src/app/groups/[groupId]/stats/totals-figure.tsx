'use client'
import { Money } from '@/components/money'
import { Currency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

/**
 * One labelled figure on the stats sheet — a ruled row, label left, figure right, like every other
 * list in the app.
 *
 * `tone` is deliberately opt-in. `--debt` and `--credit` mean "you owe" and "you are owed"
 * throughout this app, so a spending figure must not wear them: what you paid is not a debt, and
 * colouring an ordinary positive number as debt reads as a warning that isn't there. Only the
 * balance gets a tone.
 */
export function TotalsFigure({
  label,
  hint,
  amount,
  currency,
  tone = 'neutral',
  testId,
}: {
  label: string
  hint?: ReactNode
  amount: number
  currency: Currency
  tone?: 'neutral' | 'balance'
  testId?: string
}) {
  const isCredit = amount > 0
  const isSettled = Math.abs(amount) < 0.01

  return (
    <div
      data-testid={testId}
      className="flex items-baseline justify-between gap-4 border-b last:border-b-0 py-3"
    >
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && (
          <div className="mt-0.5 text-xs text-subtle-foreground">{hint}</div>
        )}
      </div>
      {/* Always the magnitude, and no sign column: the balance's label already says "You owe" or
          "You are owed", and "You owe -$81.49" reads as the opposite of what it means. Tone is
          passed as a class for the same reason — `colored` would read Math.abs as a credit. */}
      <Money
        currency={currency}
        amount={Math.abs(amount)}
        bold
        className={cn(
          'text-base shrink-0',
          tone === 'balance' &&
            !isSettled &&
            (isCredit ? 'text-credit' : 'text-debt'),
        )}
      />
    </div>
  )
}
