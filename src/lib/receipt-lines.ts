import { Currency } from './currency'
import { amountAsMinorUnits } from './utils'

export type ReceiptLinesCheck =
  | { kind: 'none' }
  | { kind: 'match' }
  | { kind: 'short' | 'over'; sum: number; difference: number }

/**
 * Do the extracted lines add up to the extracted total?
 *
 * Reading a receipt is a guess, and the most common way for it to be wrong is a misread digit in
 * one line. Nothing else on the review screen would reveal that, because the total and the lines
 * are both presented as facts — comparing them is the one check the screen can make for itself.
 *
 * `short` is the ordinary case rather than an error: what the lines do not cover is usually tax and
 * service, which the itemisation sheet already knows how to split. `over` is the suspicious one —
 * lines summing to more than the total generally means something was read twice.
 *
 * @param total the receipt total, in minor units
 * @param prices line prices in major units, as the extractor reports them
 * @returns amounts in minor units, so the caller formats them with its own currency
 */
export function checkReceiptLines(
  total: number,
  prices: number[],
  currency: Currency,
): ReceiptLinesCheck {
  if (prices.length === 0) return { kind: 'none' }

  const sum = prices.reduce(
    (running, price) =>
      running + amountAsMinorUnits(Number(price) || 0, currency),
    0,
  )
  const difference = total - sum
  // Under one minor unit is rounding, not disagreement.
  if (Math.abs(difference) < 1) return { kind: 'match' }
  return {
    kind: difference > 0 ? 'short' : 'over',
    sum,
    difference: Math.abs(difference),
  }
}
