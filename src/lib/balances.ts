import { getGroupExpenses } from '@/lib/api'
import { calculateShares } from '@/lib/totals'
import { Participant } from '@prisma/client'

export type Balances = Record<
  Participant['id'],
  { paid: number; paidFor: number; total: number }
>

export type Reimbursement = {
  from: Participant['id']
  to: Participant['id']
  amount: number
}

export function getBalances(
  expenses: NonNullable<Awaited<ReturnType<typeof getGroupExpenses>>>,
): Balances {
  const balances: Balances = {}
  for (const expense of expenses) {
    // Handle multiple payers
    for (const payer of expense.paidBy) {
        const pid = payer.participantId
        if (!balances[pid]) balances[pid] = { paid: 0, paidFor: 0, total: 0 }
        balances[pid].paid += payer.amount
    }

    const shares = calculateShares(expense)
    for (const participantId in shares) {
      if (!balances[participantId])
        balances[participantId] = { paid: 0, paidFor: 0, total: 0 }
      balances[participantId].paidFor += shares[participantId]
    }
  }
  // add totals (shares are already integers)
  for (const participantId in balances) {
    balances[participantId].paidFor = balances[participantId].paidFor + 0
    balances[participantId].paid = balances[participantId].paid + 0
    balances[participantId].total =
      balances[participantId].paid - balances[participantId].paidFor
  }
  return balances
}

// ... rest of the file (getPublicBalances, getSuggestedReimbursements) remains unchanged
export function getPublicBalances(reimbursements: Reimbursement[]): Balances {
  const balances: Balances = {}
  reimbursements.forEach((reimbursement) => {
    if (!balances[reimbursement.from])
      balances[reimbursement.from] = { paid: 0, paidFor: 0, total: 0 }
    if (!balances[reimbursement.to])
      balances[reimbursement.to] = { paid: 0, paidFor: 0, total: 0 }
    balances[reimbursement.from].paidFor += reimbursement.amount
    balances[reimbursement.from].total -= reimbursement.amount
    balances[reimbursement.to].paid += reimbursement.amount
    balances[reimbursement.to].total += reimbursement.amount
  })
  return balances
}

function compareBalancesForReimbursements(b1: any, b2: any): number {
  if (b1.total > 0 && 0 > b2.total) {
    return -1
  } else if (b2.total > 0 && 0 > b1.total) {
    return 1
  }
  return b1.participantId < b2.participantId ? -1 : 1
}

export function getSuggestedReimbursements(
  balances: Balances,
): Reimbursement[] {
  const balancesArray = Object.entries(balances)
    .map(([participantId, { total }]) => ({ participantId, total }))
    .filter((b) => b.total !== 0)
  balancesArray.sort(compareBalancesForReimbursements)
  const reimbursements: Reimbursement[] = []
  while (balancesArray.length > 1) {
    const first = balancesArray[0]
    const last = balancesArray[balancesArray.length - 1]
    const amount = first.total + last.total
    if (first.total > -last.total) {
      reimbursements.push({
        from: last.participantId,
        to: first.participantId,
        amount: -last.total,
      })
      first.total = amount
      balancesArray.pop()
    } else {
      reimbursements.push({
        from: last.participantId,
        to: first.participantId,
        amount: first.total,
      })
      last.total = amount
      balancesArray.shift()
    }
  }
  return reimbursements.filter(({ amount }) => Math.round(amount) + 0 !== 0)
}