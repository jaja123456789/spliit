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

/**
 * Calculates reimbursements based on pairwise relationships.
 * If A pays for B, B owes A specifically.
 * Debts are aggregated between pairs (A->B $10, B->A $5 becomes A->B $5).
 */
export function getDirectReimbursements(
  expenses: NonNullable<Awaited<ReturnType<typeof getGroupExpenses>>>,
): Reimbursement[] {
  // Matrix: debts[debtorId][creditorId] = amount
  const debts: Record<string, Record<string, number>> = {}

  for (const expense of expenses) {
    // 1. Calculate balances for THIS expense only
    const shares = calculateShares(expense)
    const expenseBalances: Record<string, number> = {}
    
    // Initialize
    const participantIds = new Set([
        ...expense.paidBy.map(p => p.participantId),
        ...Object.keys(shares)
    ])
    
    participantIds.forEach(id => {
        const paid = expense.paidBy.find(p => p.participantId === id)?.amount ?? 0
        const share = shares[id] ?? 0
        expenseBalances[id] = paid - share
    })

    // 2. Settle this expense internally (Debtors pay Creditors)
    // We use the same greedy approach but LOCALLY to this expense
    const debtors = Object.entries(expenseBalances)
        .filter(([, bal]) => bal < -0.01)
        .sort(([, a], [, b]) => a - b) // Ascending (largest debt first)
    
    const creditors = Object.entries(expenseBalances)
        .filter(([, bal]) => bal > 0.01)
        .sort(([, a], [, b]) => b - a) // Descending (largest credit first)

    let i = 0; // debtor index
    let j = 0; // creditor index

    while (i < debtors.length && j < creditors.length) {
        const [debtorId, debtorBal] = debtors[i]
        const [creditorId, creditorBal] = creditors[j]
        
        const amount = Math.min(Math.abs(debtorBal), creditorBal)
        
        // Accumulate into global matrix
        if (!debts[debtorId]) debts[debtorId] = {}
        debts[debtorId][creditorId] = (debts[debtorId][creditorId] ?? 0) + amount

        // Update local balances for next iteration
        debtors[i][1] += amount
        creditors[j][1] -= amount

        if (Math.abs(debtors[i][1]) < 0.01) i++
        if (creditors[j][1] < 0.01) j++
    }
  }

  // 3. Simplify Mutual Debts (A->B and B->A)
  const reimbursements: Reimbursement[] = []
  const pairsProcessed = new Set<string>()

  Object.keys(debts).forEach(debtorId => {
    Object.keys(debts[debtorId]).forEach(creditorId => {
        const pairKey = [debtorId, creditorId].sort().join(':')
        if (pairsProcessed.has(pairKey)) return
        pairsProcessed.add(pairKey)

        const aToB = debts[debtorId]?.[creditorId] ?? 0
        const bToA = debts[creditorId]?.[debtorId] ?? 0

        if (aToB > bToA) {
            reimbursements.push({ from: debtorId, to: creditorId, amount: aToB - bToA })
        } else if (bToA > aToB) {
            reimbursements.push({ from: creditorId, to: debtorId, amount: bToA - aToB })
        }
    })
  })

  return reimbursements.filter(r => r.amount > 0.5) // Filter tiny amounts
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
    .filter((b) => Math.abs(b.total) > 0.01) // Filter out zero or near-zero balances

  const reimbursements: Reimbursement[] = []

  // Optimization Step 1: Find Exact Matches
  // Detect if A owes 100 and B is owed 100. Settle them directly.
  // This prevents the greedy algorithm from splitting A's debt to C(50) and D(50) if B also needed 100.
  const settledIndices = new Set<number>()
  
  for (let i = 0; i < balancesArray.length; i++) {
    if (settledIndices.has(i)) continue;
    
    // Look for a perfect opposite
    for (let j = i + 1; j < balancesArray.length; j++) {
        if (settledIndices.has(j)) continue;
        
        // Check if totals sum to 0 (within epsilon)
        if (Math.abs(balancesArray[i].total + balancesArray[j].total) < 0.01) {
            const p1 = balancesArray[i];
            const p2 = balancesArray[j];
            
            if (p1.total > 0) {
                // p1 is creditor, p2 is debtor
                reimbursements.push({ from: p2.participantId, to: p1.participantId, amount: p1.total });
            } else {
                // p2 is creditor, p1 is debtor
                reimbursements.push({ from: p1.participantId, to: p2.participantId, amount: p2.total });
            }
            settledIndices.add(i);
            settledIndices.add(j);
            break;
        }
    }
  }

  // Filter out the settled participants for the greedy pass
  let remainingBalances = balancesArray.filter((_, idx) => !settledIndices.has(idx));

  // Sort remaining balances for greedy approach
  remainingBalances.sort(compareBalancesForReimbursements);

  // Standard Greedy Matching for remaining
  while (remainingBalances.length > 1) {
    const first = remainingBalances[0] // Max creditor
    const last = remainingBalances[remainingBalances.length - 1] // Max debtor
    
    // Safety check for convergence
    if (Math.abs(first.total) < 0.01) {
        remainingBalances.shift();
        continue;
    }
    if (Math.abs(last.total) < 0.01) {
        remainingBalances.pop();
        continue;
    }

    const amount = first.total + last.total

    if (first.total > -last.total) {
      // Creditor needs more than Debtor owes
      // Debtor pays all they owe to Creditor
      reimbursements.push({
        from: last.participantId,
        to: first.participantId,
        amount: -last.total,
      })
      first.total = amount
      remainingBalances.pop() // Last is settled
    } else {
      // Creditor needs less (or equal) than Debtor owes
      // Debtor pays Creditor what Creditor needs
      reimbursements.push({
        from: last.participantId,
        to: first.participantId,
        amount: first.total,
      })
      last.total = amount
      remainingBalances.shift() // First is settled
    }
  }

  return reimbursements.filter(({ amount }) => Math.round(amount) + 0 !== 0)
}