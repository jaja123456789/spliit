'use client'
import { Currency } from '@/lib/currency'
import { cn, formatCurrency } from '@/lib/utils'
import { useLocale } from 'next-intl'

type Props = {
  currency: Currency
  amount: number
  bold?: boolean
  colored?: boolean
}

export function Money({
  currency,
  amount,
  bold = false,
  colored = false,
}: Props) {
  const locale = useLocale()
  return (
    <span
      className={cn(
        'tabular-nums',
        // Amounts are in minor units, so the boundary is 0, not 1. The previous thresholds were
        // `<= 1` / `>= 1`, which painted a settled balance of exactly 0 as a debt and overlapped
        // at 1 minor unit.
        colored && amount < 0 && 'text-debt',
        colored && amount > 0 && 'text-credit',
        bold && 'font-bold',
      )}
    >
      {formatCurrency(currency, amount, locale)}
    </span>
  )
}
