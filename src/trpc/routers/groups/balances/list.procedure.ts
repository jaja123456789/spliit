import { getGroup, getGroupExpenses } from '@/lib/api' // Import getGroup
import {
  getBalances,
  getPublicBalances,
  getSuggestedReimbursements,
  getDirectReimbursements, // Import new function
} from '@/lib/balances'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const listGroupBalancesProcedure = baseProcedure
  .input(z.object({ groupId: z.string().min(1) }))
  .query(async ({ input: { groupId } }) => {
    // 1. Fetch group to check simplifyDebts setting
    const group = await getGroup(groupId)
    if (!group) throw new Error('Group not found')

    const expenses = await getGroupExpenses(groupId)
    const balances = getBalances(expenses)
    
    // 2. Choose algorithm based on setting
    let reimbursements
    if (group.simplifyDebts) {
        reimbursements = getSuggestedReimbursements(balances)
    } else {
        reimbursements = getDirectReimbursements(expenses)
    }

    const publicBalances = getPublicBalances(reimbursements)
    return { balances: publicBalances, reimbursements }
  })