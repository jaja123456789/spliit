import { Currency, currencyCodeForSymbol } from './currency'

export type CurrencyTotal = { currency: Currency; amount: number }

/**
 * Sums balances that may be in different currencies — one total per currency, never one total.
 *
 * Minor units of two currencies are not the same unit, so their sum is a number in no currency at
 * all. The group list did exactly that and then labelled the result with whichever group the
 * server returned first: −€685.67 in one group and −$41.71 in another read "You owe €727.38".
 *
 * A group with only a symbol and no code — the `€` most groups were created with — is folded into
 * the coded currency that symbol unambiguously names, when one is present and counts in the same
 * minor unit: `€` beside `EUR` is the same money. A symbol several currencies share stays a total
 * of its own, because `$` alone could be any of seven and guessing is how this went wrong.
 *
 * Largest first, so a mostly-euro life leads with the euros.
 */
export function totalsByCurrency(
  entries: { currency: Currency; amount: number }[],
): CurrencyTotal[] {
  const coded = new Map<string, CurrencyTotal>()
  const symbolOnly = new Map<string, CurrencyTotal>()

  for (const { currency, amount } of entries) {
    const byKey = currency.code ? coded : symbolOnly
    const key = currency.code || currency.symbol
    const total = byKey.get(key)
    if (total) total.amount += amount
    else byKey.set(key, { currency, amount })
  }

  for (const [symbol, total] of symbolOnly) {
    const code = currencyCodeForSymbol(symbol)
    const sameMoney = code ? coded.get(code) : undefined
    if (
      sameMoney &&
      sameMoney.currency.decimal_digits === total.currency.decimal_digits
    ) {
      sameMoney.amount += total.amount
      symbolOnly.delete(symbol)
    }
  }

  return [...coded.values(), ...symbolOnly.values()].sort(
    (a, b) => Math.abs(b.amount) - Math.abs(a.amount),
  )
}
