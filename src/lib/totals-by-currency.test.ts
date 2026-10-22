import { getCurrency } from './currency'
import { totalsByCurrency } from './totals-by-currency'
import { getCurrencyFromGroup } from './utils'

const eur = getCurrency('EUR')
const usd = getCurrency('USD')
const cad = getCurrency('CAD')
const jpy = getCurrency('JPY')
const symbolOnly = (symbol: string) =>
  getCurrencyFromGroup({ currency: symbol, currencyCode: null })

const summary = (totals: ReturnType<typeof totalsByCurrency>) =>
  totals.map((t) => [t.currency.code || t.currency.symbol, t.amount])

describe('totalsByCurrency', () => {
  it('adds up groups in the same currency', () => {
    expect(
      summary(
        totalsByCurrency([
          { currency: eur, amount: -500 },
          { currency: eur, amount: 200 },
        ]),
      ),
    ).toEqual([['EUR', -300]])
  })

  it('never adds two currencies together', () => {
    // The case from the review: the card read "You owe €727.38".
    expect(
      summary(
        totalsByCurrency([
          { currency: eur, amount: -68567 },
          { currency: usd, amount: -4171 },
        ]),
      ),
    ).toEqual([
      ['EUR', -68567],
      ['USD', -4171],
    ])
  })

  it('folds a bare € into EUR', () => {
    expect(
      summary(
        totalsByCurrency([
          { currency: symbolOnly('€'), amount: -1000 },
          { currency: eur, amount: 250 },
        ]),
      ),
    ).toEqual([['EUR', -750]])
  })

  it('keeps a bare $ apart, since seven currencies are written that way', () => {
    // Even with USD the only dollar currency in view: the "$" group may well be Canadian.
    expect(
      summary(
        totalsByCurrency([
          { currency: symbolOnly('$'), amount: 100 },
          { currency: usd, amount: 200 },
          { currency: cad, amount: 300 },
        ]),
      ),
    ).toEqual([
      ['CAD', 300],
      ['USD', 200],
      ['$', 100],
    ])
  })

  it('leaves a bare € on its own when no EUR group is there to join', () => {
    expect(
      summary(totalsByCurrency([{ currency: symbolOnly('€'), amount: -100 }])),
    ).toEqual([['€', -100]])
  })

  it('does not fold a symbol whose decimals differ', () => {
    // A custom ¥ group counts in hundredths; JPY has no minor unit.
    expect(
      summary(
        totalsByCurrency([
          { currency: symbolOnly('¥'), amount: 1000 },
          { currency: jpy, amount: 1000 },
        ]),
      ).sort(),
    ).toEqual([
      ['JPY', 1000],
      ['¥', 1000],
    ])
  })

  it('returns nothing for nothing', () => {
    expect(totalsByCurrency([])).toEqual([])
  })
})
