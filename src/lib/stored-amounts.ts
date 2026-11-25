import { Currency } from '@/lib/currency'
import { ExpenseFormValues } from '@/lib/schemas'
import { allocateMinorUnits, amountAsMinorUnits } from '@/lib/utils'

type Values = Pick<
  ExpenseFormValues,
  'amount' | 'paidBy' | 'paidFor' | 'splitMode' | 'items'
>

/**
 * An expense's figures as they are stored: whole minor units, with every set of parts adding up to
 * the amount exactly.
 *
 * Rounding each part on its own does not guarantee that. Two payers scaled down to the shared part
 * of an itemised bill (7.575 each) stored as 758 + 758 against an amount of 1515; €10.00 of items
 * three ways stored 333 × 3; payer amounts sent through the API with more decimals than the
 * currency has (10.005 + 10.005) stored 1001 + 1001 against 2001. Each left the balances a cent off
 * zero — money owed to or by nobody.
 *
 * So the amount is rounded once, and each set of parts is spread over it with the largest
 * remainder method: a part that was already a whole number of minor units keeps it, and only the
 * units rounding would lose or invent move, to the parts nearest to deserving them.
 */
export function toStoredAmounts(values: Values, currency: Currency) {
  const scale = 10 ** currency.decimal_digits
  const amount = amountAsMinorUnits(Number(values.amount), currency)
  const exact = (value: unknown) => Number(value) * scale

  const paidBy = allocateMinorUnits(
    values.paidBy.map((pb) => exact(pb.amount)),
    amount,
  )
  const paidForShares =
    values.splitMode === 'BY_AMOUNT'
      ? allocateMinorUnits(
          values.paidFor.map((pf) => exact(pf.shares)),
          amount,
        )
      : // Shares and percentages, not money: ×100 (a share of 1 is 100, 25% is 2500).
        values.paidFor.map((pf) => Math.round(Number(pf.shares) * 100))
  const items = values.items ?? []
  const itemPrices =
    items.length > 0
      ? allocateMinorUnits(
          items.map((item) => exact(item.price)),
          amount,
        )
      : []

  return { amount, paidBy, paidForShares, itemPrices }
}
