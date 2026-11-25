import { getCurrency } from './currency'
import { expandReceiptItems } from './receipt-items'

const EUR = getCurrency('EUR')
const JPY = getCurrency('JPY')
const KWD = { ...EUR, code: 'KWD', decimal_digits: 3 }

describe('expandReceiptItems', () => {
  it('splits a counted line into one line per unit', () => {
    expect(
      expandReceiptItems(
        [{ name: 'Beer', quantity: 3, unitPrice: 4.5, price: 13.5 }],
        EUR,
      ),
    ).toEqual([
      { name: 'Beer', price: 4.5 },
      { name: 'Beer', price: 4.5 },
      { name: 'Beer', price: 4.5 },
    ])
  })

  it('keeps a weighed line as one purchase', () => {
    expect(
      expandReceiptItems(
        [
          { name: 'Bananas', quantity: 2.5, unitPrice: 2, price: 5 },
          { name: 'Apples', quantity: 1.5, unitPrice: 3.99, price: 5.99 },
        ],
        EUR,
      ),
    ).toEqual([
      { name: 'Bananas', price: 5 },
      { name: 'Apples', price: 5.99 },
    ])
  })

  it('prices in the currency’s own decimals, adding up to what was paid', () => {
    expect(
      expandReceiptItems(
        [{ name: 'Gyoza', quantity: 3, price: 1000 }],
        JPY,
      ).map((i) => i.price),
    ).toEqual([334, 333, 333])
    expect(
      expandReceiptItems([{ name: 'Tea', quantity: 3, price: 1 }], KWD).map(
        (i) => i.price,
      ),
    ).toEqual([0.334, 0.333, 0.333])
  })

  it('keeps the line total when the unit price disagrees with it', () => {
    // A multi-buy discount: 3 at 2.00 listed, 5.00 paid.
    const lines = expandReceiptItems(
      [{ name: 'Juice', quantity: 3, unitPrice: 2, price: 5 }],
      EUR,
    )
    expect(lines.map((l) => l.price).sort()).toEqual([1.66, 1.67, 1.67])
  })

  it('leaves single lines alone apart from rounding to the currency', () => {
    expect(expandReceiptItems([{ name: 'Ramen', price: 1200.4 }], JPY)).toEqual(
      [{ name: 'Ramen', price: 1200 }],
    )
  })
})
