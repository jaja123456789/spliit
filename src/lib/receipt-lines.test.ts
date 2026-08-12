import { Currency } from './currency'
import { checkReceiptLines } from './receipt-lines'

const usd: Currency = {
  name: 'US Dollar',
  symbol_native: '$',
  symbol: '$',
  code: 'USD',
  name_plural: 'US dollars',
  rounding: 0,
  decimal_digits: 2,
}

const jpy: Currency = {
  name: 'Japanese Yen',
  symbol_native: '￥',
  symbol: '¥',
  code: 'JPY',
  name_plural: 'Japanese yen',
  rounding: 0,
  decimal_digits: 0,
}

describe('checkReceiptLines', () => {
  it('says nothing was read when there are no lines', () => {
    expect(checkReceiptLines(7400, [], usd)).toEqual({ kind: 'none' })
  })

  it('matches when the lines add up exactly', () => {
    expect(checkReceiptLines(7400, [24, 32, 18], usd)).toEqual({
      kind: 'match',
    })
  })

  it('reports the shortfall, which is usually tax and service', () => {
    // 24.00 + 32.00 + 18.00 = 74.00 against an 87.40 total.
    expect(checkReceiptLines(8740, [24, 32, 18], usd)).toEqual({
      kind: 'short',
      sum: 7400,
      difference: 1340,
    })
  })

  it('reports lines that overshoot, which usually means a double read', () => {
    expect(checkReceiptLines(5000, [24, 32], usd)).toEqual({
      kind: 'over',
      sum: 5600,
      difference: 600,
    })
  })

  it('treats a sub-unit difference as rounding rather than disagreement', () => {
    // Three lines of 10/3 each: 3.33 + 3.33 + 3.34 against 10.00.
    expect(checkReceiptLines(1000, [3.33, 3.33, 3.34], usd)).toEqual({
      kind: 'match',
    })
  })

  it('works in a currency with no minor unit', () => {
    // Nothing here may assume two decimal places: 4200 yen is 4200, not 42.
    expect(checkReceiptLines(4200, [1200, 3000], jpy)).toEqual({
      kind: 'match',
    })
    expect(checkReceiptLines(5000, [1200, 3000], jpy)).toEqual({
      kind: 'short',
      sum: 4200,
      difference: 800,
    })
  })
})
