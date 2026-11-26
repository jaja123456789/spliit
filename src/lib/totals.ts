import { getGroupExpenses } from '@/lib/api'
import Decimal from 'decimal.js'

export function getTotalGroupSpending(
  expenses: NonNullable<Awaited<ReturnType<typeof getGroupExpenses>>>,
): number {
  return expenses.reduce(
    (total, expense) =>
      expense.isReimbursement ? total : total + expense.amount,
    0,
  )
}

export function getTotalActiveUserPaidFor(
  activeUserId: string | null,
  expenses: NonNullable<Awaited<ReturnType<typeof getGroupExpenses>>>,
): number {
  return expenses.reduce((total, expense) => {
    const userPayment = expense.paidBy.find(
      (p) => p.participantId === activeUserId,
    )
    return userPayment && !expense.isReimbursement
      ? total + userPayment.amount
      : total
  }, 0)
}

type Expense = NonNullable<Awaited<ReturnType<typeof getGroupExpenses>>>[number]
type ExpenseForShares = Pick<
  Expense,
  'amount' | 'paidFor' | 'splitMode' | 'isReimbursement' | 'paidBy'
> & {
  expenseDate?: Expense['expenseDate']
  /** With `remainderRule` 2, draws who gets the spare minor units. */
  id?: string
  /** See `remainderRule` on Expense in the schema. Absent means the original rule, 1. */
  remainderRule?: number
}

/**
 * A stable, well-spread 32-bit number for a string: FNV-1a, then MurmurHash3's finaliser. FNV alone
 * leaves strings that differ only in their last character (`id:alice`, `id:bob`) close together, and
 * one participant then won the draw half the time instead of a third; the finaliser spreads them.
 */
function hash32(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

export function calculateShares(
  expense: ExpenseForShares,
): Record<string, number> {
  const result: Record<string, number> = {}
  const amount = new Decimal(expense.amount)
  const totalShares = expense.paidFor.reduce(
    (sum, pf) => sum.add(new Decimal(pf.shares ?? 0)),
    new Decimal(0),
  )
  let sumRounded = new Decimal(0)
  const participantOrder: string[] = []
  // How much each participant lost to truncation, kept from the same pass that computed it so the
  // two can never drift apart.
  const fractions: Array<{ id: string; frac: Decimal }> = []
  expense.paidFor.forEach((pf) => {
    const shares = new Decimal(pf.shares ?? 0)
    let part = new Decimal(0)
    switch (expense.splitMode) {
      case 'EVENLY':
        if (expense.paidFor.length > 0) {
          part = amount.div(expense.paidFor.length)
        }
        break
      case 'BY_AMOUNT':
        part = shares
        break
      case 'BY_PERCENTAGE':
        part = amount.mul(shares).div(10000)
        break
      case 'BY_SHARES':
        if (totalShares.gt(0)) {
          part = amount.mul(shares).div(totalShares)
        }
        break
      default:
        part = new Decimal(0)
    }
    const rounded = part.gte(0) ? part.floor() : part.ceil()
    // Accumulate rather than assign: the database can't produce a participant twice in one
    // expense, but `sumRounded` counts every row, so overwriting would drop that row's share from
    // the total and quietly lose the difference.
    result[pf.participant.id] =
      (result[pf.participant.id] ?? 0) + rounded.toNumber()
    sumRounded = sumRounded.add(rounded)
    participantOrder.push(pf.participant.id)
    fractions.push({ id: pf.participant.id, frac: part.minus(rounded).abs() })
  })

  const diff = amount.minus(sumRounded)
  if (diff.isZero()) {
    return result
  }

  // Get first payer ID for remainder attribution
  // In multi-payer, we arbitrarily pick the first one for now or check if there is one
  const firstPayerId =
    expense.paidBy[0]?.participantId ?? expense.paidFor[0]?.participant.id

  if (expense.splitMode === 'BY_AMOUNT') {
    if (firstPayerId) {
      result[firstPayerId] = (result[firstPayerId] ?? 0) + diff.toNumber()
    }
    return result
  }

  if (participantOrder.length === 0) {
    if (firstPayerId) {
      result[firstPayerId] = (result[firstPayerId] ?? 0) + diff.toNumber()
    }
    return result
  }

  if (!diff.isZero() && participantOrder.length > 0) {
    const direction = diff.gt(0) ? 1 : -1
    const remaining = diff.abs().toNumber()

    // Largest-remainder method: whoever lost the most to truncation is first in line for the
    // leftover minor units, so nobody is off by more than one. Ties go to the later participant,
    // which keeps the allocation stable for a given expense without needing a random seed.
    //
    // Rule 1, every expense from before `remainderRule` existed: ties go to the later participant.
    // In an even split everyone ties, so the first people in the list always got the smaller share
    // and the last the spare cent, expense after expense. It stays for those expenses so that no
    // existing balance moves.
    //
    // Rule 2, every expense since: ties go in an order drawn from the expense's id and each
    // participant's — different for each expense, so the spare cents spread over everyone, and
    // independent of the order the database returns the rows in.
    const orderIndex = new Map<string, number>(
      participantOrder.map((id, idx) => [id, idx]),
    )
    const drawn = expense.remainderRule === 2 && !!expense.id
    const draw = (participantId: string) =>
      hash32(`${expense.id}:${participantId}`)
    fractions.sort((a, b) => {
      const cmp = b.frac.comparedTo(a.frac)
      if (cmp !== 0) return cmp
      if (drawn) return draw(b.id) - draw(a.id)
      return (orderIndex.get(b.id) ?? 0) - (orderIndex.get(a.id) ?? 0)
    })

    // Hand out the leftover minor units round-robin down that sorted list, in closed form rather
    // than one unit per iteration. Normally `remaining` is smaller than the participant count, but
    // a BY_PERCENTAGE expense whose percentages don't add up to 100 makes it proportional to the
    // amount, and counting to it one cent at a time would hang on a large enough expense.
    const perParticipant = Math.floor(remaining / fractions.length)
    const extra = remaining % fractions.length
    fractions.forEach(({ id }, index) => {
      const units = perParticipant + (index < extra ? 1 : 0)
      if (units === 0) return
      result[id] = (result[id] ?? 0) + direction * units
    })
  }

  return result
}

export function calculateShare(
  participantId: string | null,
  expense: ExpenseForShares,
): number {
  if (!participantId) return 0
  return calculateShares(expense)[participantId] ?? 0
}

/**
 * What the participant consumed, for the stats page.
 *
 * Settling up is not consumption: being paid back doesn't mean you ate another dinner. Skipping
 * reimbursements here is what keeps everyone's share adding up to the group total, and matches
 * `getTotalGroupSpending` and `getTotalActiveUserPaidFor` above. Balances deliberately go the other
 * way and count reimbursements, because a settlement does move what people owe each other.
 */
export function getTotalActiveUserShare(
  activeUserId: string | null,
  expenses: NonNullable<Awaited<ReturnType<typeof getGroupExpenses>>>,
): number {
  return expenses.reduce(
    (sum, expense) =>
      expense.isReimbursement
        ? sum
        : sum + calculateShare(activeUserId, expense),
    0,
  )
}
