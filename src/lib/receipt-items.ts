import { Currency } from '@/lib/currency'
import {
  allocateMinorUnits,
  amountAsDecimal,
  amountAsMinorUnits,
} from '@/lib/utils'

type ReceiptItem = {
  name?: string
  quantity?: number | null
  unitPrice?: number | null
  price: number
}

/**
 * A receipt's lines, as the itemised split wants them: one line per unit bought, so "3 × beer" can
 * be shared out one beer at a time, each priced in the receipt currency's own decimals.
 *
 * Only a whole quantity is a number of things. A weighed one — 2.5 kg of bananas, 1.5 kg of apples
 * — is one purchase; it used to become lines of 2, 2 and 1 (or 3.99 and 2.00), whose names claimed
 * three bags of bananas. And prices were cut to two decimals whatever the currency: ¥1,000 for
 * three became ¥333.33 a line, which a currency without minor units cannot hold.
 *
 * The line's own `price` is what was paid and is kept exactly; the units are spread over it with
 * the largest remainder method, so ¥1,000 for three is 334 + 333 + 333.
 */
export function expandReceiptItems(items: ReceiptItem[], currency: Currency) {
  const rounded = (price: number) =>
    amountAsDecimal(amountAsMinorUnits(price, currency), currency)
  return items.flatMap((item) => {
    const quantity = item.quantity ?? 1
    const isCount = Math.abs(quantity - Math.round(quantity)) < 1e-9
    const count = Math.round(quantity)
    if (!isCount || count <= 1) {
      return [{ name: item.name, price: rounded(item.price) }]
    }
    const totalMinor = amountAsMinorUnits(item.price, currency)
    return allocateMinorUnits(
      Array.from({ length: count }, () => totalMinor / count),
      totalMinor,
    ).map((minor) => ({
      name: item.name,
      price: amountAsDecimal(minor, currency),
    }))
  })
}
