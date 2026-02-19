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
    result[pf.participant.id] = rounded.toNumber()
    sumRounded = sumRounded.add(rounded)
    participantOrder.push(pf.participant.id)
  })

  let diff = amount.minus(sumRounded)
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
    let remaining = diff.abs().toNumber()

    // Simple string hash function
    const getHash = (str: string) => {
      let hash = 0
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i)
        hash |= 0
      }
      return Math.abs(hash)
    }

    // Seed based on amount + participant list.
    // This ensures if the expense doesn't change, the "random" person stays the same.
    const seed =
      amount.toString() +
      participantOrder.join('') +
      (expense.expenseDate?.toISOString() || '')
    let hash = getHash(seed)

    while (remaining > 0) {
      // Pick a participant based on the hash
      const targetIndex = hash % participantOrder.length
      const targetId = participantOrder[targetIndex]

      result[targetId] = (result[targetId] ?? 0) + direction
      remaining--

      // Mutate hash for next iteration (in case remaining > 1)
      hash = getHash(hash.toString())
    }
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

export function getTotalActiveUserShare(
  activeUserId: string | null,
  expenses: NonNullable<Awaited<ReturnType<typeof getGroupExpenses>>>,
): number {
  return expenses.reduce(
    (sum, expense) => sum + calculateShare(activeUserId, expense),
    0,
  )
}
