import { getBalances } from './balances'
import { getCurrency } from './currency'
import { distributeItems } from './expense-items'
import { toStoredAmounts } from './stored-amounts'

const EUR = getCurrency('EUR')
const JPY = getCurrency('JPY')
const sum = (values: number[]) => values.reduce((s, v) => s + v, 0)

/** The stored figures as `getBalances` reads them, and the balances' total, which must be 0. */
function balanceTotal(
  values: Parameters<typeof toStoredAmounts>[0],
  currency = EUR,
) {
  const stored = toStoredAmounts(values, currency)
  const balances = getBalances([
    {
      amount: stored.amount,
      splitMode: values.splitMode,
      isReimbursement: false,
      paidBy: values.paidBy.map((pb, i) => ({
        participant: { id: pb.participant },
        amount: stored.paidBy[i],
      })),
      paidFor: values.paidFor.map((pf, i) => ({
        participant: { id: pf.participant },
        shares: stored.paidForShares[i],
      })),
    } as any,
  ])
  return sum(Object.values(balances).map((b) => b.total))
}

describe('toStoredAmounts', () => {
  it('keeps two scaled payers of an itemised bill adding up to the amount', () => {
    // Two payers of 15.15 each; a 15.15 line shared by three and a personal 15.15 line.
    const distributed = distributeItems(
      [
        { price: 15.15, participantIds: ['a', 'b', 'c'] },
        { price: 15.15, participantIds: [] },
      ],
      [
        { participant: 'a', amount: 15.15 },
        { participant: 'b', amount: 15.15 },
      ],
    )
    const values = {
      amount: distributed.amount,
      paidBy: distributed.paidBy,
      paidFor: distributed.paidFor,
      items: distributed.items,
      splitMode: 'BY_AMOUNT',
    } as any
    const stored = toStoredAmounts(values, EUR)
    expect(stored.amount).toBe(1515)
    expect(sum(stored.paidBy)).toBe(1515)
    expect(sum(stored.paidForShares)).toBe(1515)
    expect(sum(stored.itemPrices)).toBe(1515)
    expect(balanceTotal(values)).toBe(0)
  })

  it('stores €10.00 of items three ways as a whole €10.00', () => {
    const distributed = distributeItems(
      [{ price: 10, participantIds: ['a', 'b', 'c'] }],
      [{ participant: 'a', amount: 10 }],
    )
    const stored = toStoredAmounts(
      { ...distributed, splitMode: 'BY_AMOUNT' } as any,
      EUR,
    )
    expect([...stored.paidForShares].sort()).toEqual([333, 333, 334])
  })

  it('rounds over-precise payer amounts to parts of the amount', () => {
    const values = {
      amount: 20.01,
      paidBy: [
        { participant: 'a', amount: 10.005 },
        { participant: 'b', amount: 10.005 },
      ],
      paidFor: [
        { participant: 'a', shares: 1 },
        { participant: 'b', shares: 1 },
      ],
      splitMode: 'EVENLY',
      items: [],
    } as any
    const stored = toStoredAmounts(values, EUR)
    expect(stored.amount).toBe(2001)
    expect(sum(stored.paidBy)).toBe(2001)
    expect(balanceTotal(values)).toBe(0)
  })

  it('leaves exact figures exactly as they were', () => {
    const stored = toStoredAmounts(
      {
        amount: 30.01,
        paidBy: [
          { participant: 'a', amount: 20 },
          { participant: 'b', amount: 10.01 },
        ],
        paidFor: [
          { participant: 'a', shares: 12.5 },
          { participant: 'b', shares: 17.51 },
        ],
        splitMode: 'BY_AMOUNT',
        items: [],
      } as any,
      EUR,
    )
    expect(stored).toEqual({
      amount: 3001,
      paidBy: [2000, 1001],
      paidForShares: [1250, 1751],
      itemPrices: [],
    })
  })

  it('keeps shares and percentages in hundredths', () => {
    const stored = toStoredAmounts(
      {
        amount: 100,
        paidBy: [{ participant: 'a', amount: 100 }],
        paidFor: [
          { participant: 'a', shares: 33.34 },
          { participant: 'b', shares: 66.66 },
        ],
        splitMode: 'BY_PERCENTAGE',
        items: [],
      } as any,
      EUR,
    )
    expect(stored.paidForShares).toEqual([3334, 6666])
  })

  it('works in a currency without minor units, and for an income', () => {
    const distributed = distributeItems(
      [{ price: -1000, participantIds: ['a', 'b', 'c'] }],
      [{ participant: 'a', amount: -1000 }],
    )
    const values = { ...distributed, splitMode: 'BY_AMOUNT' } as any
    const stored = toStoredAmounts(values, JPY)
    expect(stored.amount).toBe(-1000)
    expect(stored.paidBy).toEqual([-1000])
    expect(sum(stored.paidForShares)).toBe(-1000)
    expect(balanceTotal(values, JPY)).toBe(0)
  })

  it('scales the payers of an itemised income by what each received', () => {
    // A refund of 90 received 60 by a and 30 by b; 30 of it was b's alone.
    const distributed = distributeItems(
      [
        { price: -60, participantIds: ['a', 'b'] },
        { price: -30, participantIds: [] },
      ],
      [
        { participant: 'a', amount: -60 },
        { participant: 'b', amount: -30 },
      ],
    )
    expect(distributed.paidBy.map((p) => p.amount)).toEqual([-40, -20])
    const values = { ...distributed, splitMode: 'BY_AMOUNT' } as any
    expect(toStoredAmounts(values, EUR).paidBy).toEqual([-4000, -2000])
    expect(balanceTotal(values)).toBe(0)
  })
})
