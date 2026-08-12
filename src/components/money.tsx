'use client'
import { Currency } from '@/lib/currency'
import { cn, formatCurrency, formatCurrencyMagnitude } from '@/lib/utils'
import { useLocale } from 'next-intl'

type Props = {
  currency: Currency
  amount: number
  /**
   * Direction matters here, so the sign gets a column of its own and a settled figure is marked as
   * settled rather than left to read as an ordinary zero. Use it for balances, not for prices.
   */
  signed?: boolean
  /** Credit / debt / settled ink. Independent of `signed`: a figure can carry one without the other. */
  colored?: boolean
  bold?: boolean
  /**
   * Set when `amount` is already in major units (12.50 rather than 1250). The itemisation builder
   * works in major units throughout, because item prices are typed as decimals.
   */
  fractions?: boolean
  className?: string
}

/**
 * Every figure the app *displays* goes through here — the expense list, balances, reimbursements,
 * totals and the activity feed. The expense form and the itemisation builder still format inline;
 * they are being rebuilt around a single split control, and routing them through this first would
 * mean editing the same lines twice.
 *
 * Amounts used to be set in the body face at body weight, which made them read as more words in the
 * sentence, and direction was carried by colour alone — so a debt and a credit were the same shape
 * to anyone who could not separate the two hues, in greyscale, or in a screenshot.
 *
 * The sign now occupies a fixed column ahead of the digits. That does three things at once: the
 * decimals line up down a list, direction survives without colour, and a settled balance says so
 * (·) instead of being an unremarkable 0.00. Colour becomes reinforcement rather than the message.
 *
 * The sign is rendered separately from the figure, never sliced off it — the app ships 23 locales
 * and several of them trail the sign or move the symbol with it. See `formatCurrencyMagnitude`.
 */
export function Money({
  currency,
  amount,
  signed = false,
  colored = false,
  bold = false,
  fractions = false,
  className,
}: Props) {
  const locale = useLocale()
  // Amounts are integers in minor units, so the boundary is exactly 0. The previous thresholds were
  // `<= 1` / `>= 1`, which painted a settled balance as a debt and overlapped at 1 minor unit.
  const direction = amount > 0 ? 'credit' : amount < 0 ? 'debt' : 'settled'

  return (
    <span
      className={cn(
        'font-mono tabular-nums whitespace-nowrap',
        bold ? 'font-semibold' : 'font-medium',
        colored && direction === 'credit' && 'text-credit',
        colored && direction === 'debt' && 'text-debt',
        colored && direction === 'settled' && 'text-subtle-foreground',
        className,
      )}
    >
      {signed && (
        <span
          className="inline-block w-[1ch] text-center"
          // A middle dot is a typographic mark, not information — the figure that follows already
          // says zero. '+' and '-' are left audible because they are the whole point.
          aria-hidden={direction === 'settled' ? 'true' : undefined}
        >
          {direction === 'credit' ? '+' : direction === 'debt' ? '-' : '·'}
        </span>
      )}
      {signed
        ? formatCurrencyMagnitude(currency, amount, locale, fractions)
        : formatCurrency(currency, amount, locale, fractions)}
    </span>
  )
}
