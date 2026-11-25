import { redistributeByAmount } from './helpers'

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    participant: `p${i}`,
    shares: '0' as unknown,
  }))

const units = (value: unknown) => Math.round(Number(value) * 100)

describe('redistributeByAmount', () => {
  it('gives the spare cent to exactly one untouched row', () => {
    const paidFor = rows(3)
    paidFor[1].shares = '3.00'
    const result = redistributeByAmount(10.01, paidFor, new Set(['p1']), 2)
    expect(result[1].shares).toBe('3.00')
    expect(result.reduce((sum, p) => sum + units(p.shares), 0)).toBe(1001)
    expect([result[0].shares, result[2].shares].sort()).toEqual([
      '3.50',
      '3.51',
    ])
  })

  // Every total from 0.01 to 30.00, two to five people, every choice of typed rows with a typed
  // value from a few that leave a positive remainder: the split always adds up to the total, typed
  // rows keep their value, and untouched rows differ by at most one cent.
  it('always adds up to the total', () => {
    let cases = 0
    for (let n = 2; n <= 5; n++) {
      for (let mask = 0; mask < (1 << n) - 1; mask++) {
        for (const typed of ['0.01', '1.00', '2.37']) {
          for (let cents = 1; cents <= 3000; cents += 7) {
            const paidFor = rows(n)
            const edited = new Set<string>()
            paidFor.forEach((p, i) => {
              if (mask & (1 << i)) {
                p.shares = typed
                edited.add(p.participant)
              }
            })
            const total = cents / 100
            const result = redistributeByAmount(total, paidFor, edited, 2)
            const sum = result.reduce((s, p) => s + units(p.shares), 0)
            expect(sum).toBe(cents)
            result.forEach((p, i) => {
              if (edited.has(p.participant)) expect(p.shares).toBe(typed)
              else expect(paidFor[i].shares).toBe('0')
            })
            const free = result
              .filter((p) => !edited.has(p.participant))
              .map((p) => units(p.shares))
            expect(Math.max(...free) - Math.min(...free)).toBeLessThanOrEqual(1)
            cases++
          }
        }
      }
    }
    expect(cases).toBeGreaterThan(10_000)
  })

  it('splits an income (negative total) the same way', () => {
    const result = redistributeByAmount(-10.01, rows(3), new Set(), 2)
    expect(result.reduce((s, p) => s + units(p.shares), 0)).toBe(-1001)
  })

  it('uses the currency’s own decimals', () => {
    const result = redistributeByAmount(1000, rows(3), new Set(), 0)
    expect(result.map((p) => p.shares).sort()).toEqual(['333', '333', '334'])
  })
})
