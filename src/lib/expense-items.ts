import Decimal from 'decimal.js'

type Item = { price: number | string; participantIds: string[] }
type Payer = { amount: number | string }

export type ItemDistribution<I, P> = {
  /** The group's share of the bill: the sum of the items somebody is paying for. */
  amount: number
  /** Only the included items. Items nobody is paying for are personal and are not stored. */
  items: I[]
  /** Payer amounts scaled down to the included total, so they still add up to `amount`. */
  paidBy: P[]
  /** What each participant owes, accumulated from the items they share. */
  paidFor: { participant: string; shares: number }[]
}

/**
 * Works out an itemised expense: which items the group is actually splitting, what that costs, and
 * what each participant owes for it.
 *
 * An item with no participants is somebody's personal line on a shared bill — the wine one person
 * drank on a table's tab. It stays part of what was paid, but not of what the group splits, so the
 * payer amounts are scaled down by the same proportion and the item itself is dropped.
 *
 * Shared by the expense form's schema and the MCP `add_expense` tool. Both need identical
 * behaviour, and quietly disagreeing about how a bill is split would misstate what people owe
 * each other without ever looking like an error.
 */
export function distributeItems<I extends Item, P extends Payer>(
  items: I[],
  paidBy: P[],
): ItemDistribution<I, P> {
  const inputTotal = paidBy
    .reduce((sum, p) => sum.add(new Decimal(p.amount || 0)), new Decimal(0))
    .toNumber()

  const includedItems = items.filter((i) => i.participantIds.length > 0)
  const splitTotal = includedItems
    .reduce(
      (sum, item) => sum.add(new Decimal(item.price || 0)),
      new Decimal(0),
    )
    .toNumber()

  // If the receipt was 100 and the group splits 80, payer amounts scale by 0.8.
  const ratio = inputTotal > 0 ? splitTotal / inputTotal : 0

  const distribution: Record<string, number> = {}
  for (const item of includedItems) {
    const share = Number(item.price) / item.participantIds.length
    for (const participantId of item.participantIds) {
      distribution[participantId] = (distribution[participantId] ?? 0) + share
    }
  }

  return {
    amount: splitTotal,
    items: includedItems,
    paidBy: paidBy.map((pb) => ({
      ...pb,
      amount: new Decimal(pb.amount).mul(ratio).toNumber(),
    })),
    paidFor: Object.entries(distribution).map(([participant, shares]) => ({
      participant,
      shares,
    })),
  }
}
