import { getCurrency } from './currency'
import {
  amountAsDecimal,
  amountAsMinorUnits,
  convertAmount,
  convertAmountParts,
  convertAmountPartsBack,
} from './utils'

/**
 * A converted expense is stored in the group currency and reopened in the currency it was entered
 * in. Saving it again unchanged must store the same cents — it used to move one in about 2% of
 * two-payer USD→EUR expenses.
 */
describe('convertAmountPartsBack', () => {
  let seed = 777
  const random = () =>
    (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648

  it.each([
    ['USD', 'EUR', 0.85, 0.95, 2],
    ['USD', 'EUR', 0.85, 0.95, 4],
    ['JPY', 'EUR', 0.0058, 0.0066, 2],
    ['EUR', 'JPY', 150, 170, 3],
    ['USD', 'EUR', 0.005, 2, 3],
  ])(
    '%s → %s at %p–%p, %p parts: saving unchanged stores the same cents',
    (from, to, low, high, count) => {
      const original = getCurrency(from)
      const group = getCurrency(to)
      for (let k = 0; k < 5000; k++) {
        const rate = Number((low + random() * (high - low)).toFixed(6))
        const parts = Array.from({ length: count }, () =>
          amountAsDecimal(1 + Math.floor(random() * 20000), original),
        )
        const total = parts.reduce((a, b) => a + b, 0)
        const toStored = (values: number[], sum: number) =>
          convertAmountParts(values, sum, rate, group).map((p) =>
            amountAsMinorUnits(p, group),
          )
        const stored = toStored(parts, total)
        expect(
          amountAsMinorUnits(convertAmount(total, rate, group), group),
        ).toBe(stored.reduce((a, b) => a + b, 0))

        const reopened = convertAmountPartsBack(
          stored,
          rate,
          group,
          amountAsMinorUnits(total, original),
          original,
        ).map((minor) => amountAsDecimal(minor, original))
        expect(
          amountAsMinorUnits(
            reopened.reduce((a, b) => a + b, 0),
            original,
          ),
        ).toBe(amountAsMinorUnits(total, original))
        expect(toStored(reopened, total)).toEqual(stored)
      }
    },
  )

  it('gives back what was typed when the group currency is finer', () => {
    const stored = convertAmountParts(
      [68.07, 2.02],
      70.09,
      0.9032,
      getCurrency('EUR'),
    ).map((p) => amountAsMinorUnits(p, getCurrency('EUR')))
    expect(
      convertAmountPartsBack(
        stored,
        0.9032,
        getCurrency('EUR'),
        7009,
        getCurrency('USD'),
      ),
    ).toEqual([6807, 202])
  })
})
