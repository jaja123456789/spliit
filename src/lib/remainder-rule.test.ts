import { calculateShares } from './totals'

const evenly = (
  amount: number,
  people: string[],
  rule?: { id: string; remainderRule: number },
) =>
  calculateShares({
    amount,
    splitMode: 'EVENLY',
    isReimbursement: false,
    paidBy: [{ participantId: people[0], amount } as any],
    paidFor: people.map(
      (id) => ({ participant: { id, name: id }, shares: 100 }) as any,
    ),
    ...rule,
  })

describe('who gets the spare cent of an even split', () => {
  it('rule 1, every expense from before: the later participants, as it always was', () => {
    expect(evenly(1000, ['a', 'b', 'c'])).toEqual({ a: 333, b: 333, c: 334 })
    expect(evenly(1001, ['a', 'b', 'c'])).toEqual({ a: 333, b: 334, c: 334 })
    expect(
      evenly(1000, ['a', 'b', 'c'], { id: 'x', remainderRule: 1 }),
    ).toEqual({ a: 333, b: 333, c: 334 })
  })

  it('rule 2: still adds up, and nobody is off by more than a cent', () => {
    for (let i = 0; i < 500; i++) {
      const shares = evenly(1000 + (i % 7), ['a', 'b', 'c', 'd'], {
        id: `expense-${i}`,
        remainderRule: 2,
      })
      const values = Object.values(shares)
      expect(values.reduce((s, v) => s + v, 0)).toBe(1000 + (i % 7))
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
    }
  })

  it('rule 2: over many expenses the spare cent lands on everyone, first included', () => {
    const extra: Record<string, number> = { a: 0, b: 0, c: 0 }
    const runs = 3000
    for (let i = 0; i < runs; i++) {
      const shares = evenly(1000, ['a', 'b', 'c'], {
        id: `e${i}-${(i * 2654435761) >>> 0}`,
        remainderRule: 2,
      })
      for (const [who, value] of Object.entries(shares))
        if (value === 334) extra[who]++
    }
    // A third each, give or take; under rule 1 `a` would have none and `c` all 3,000.
    for (const who of ['a', 'b', 'c']) {
      expect(extra[who]).toBeGreaterThan(runs / 3 - 150)
      expect(extra[who]).toBeLessThan(runs / 3 + 150)
    }
  })

  it('rule 2: the same expense splits the same whatever order the rows come in', () => {
    const rule = { id: 'abc123', remainderRule: 2 }
    expect(evenly(1001, ['a', 'b', 'c'], rule)).toEqual(
      evenly(1001, ['c', 'a', 'b'], rule),
    )
  })
})
