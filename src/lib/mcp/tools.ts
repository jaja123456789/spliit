import { createExpense, getGroup, getGroupExpenses } from '@/lib/api'
import {
  getBalances,
  getDirectReimbursements,
  getSuggestedReimbursements,
} from '@/lib/balances'
import { getCurrency, normalizeCurrencyCode } from '@/lib/currency'
import { ExchangeRateError, getExchangeRate } from '@/lib/currency-rates'
import { distributeItems } from '@/lib/expense-items'
import { prisma } from '@/lib/prisma'
import { ExpenseFormValues } from '@/lib/schemas'
import {
  amountAsDecimal,
  convertAmount,
  convertAmountParts,
  formatAmountAsDecimal,
  getCurrencyFromGroup,
  normalizeString,
} from '@/lib/utils'
import { RecurrenceRule, SplitMode } from '@prisma/client'
import dayjs from 'dayjs'
import { McpUser } from './tokens'

/** Returned to the model as an error message rather than thrown as a protocol failure. */
export class McpToolError extends Error {}

/**
 * Every tool goes through here. A token is scoped to the groups on its owner's sync profile, so a
 * group the user has not added is indistinguishable from one that does not exist — without this,
 * a token would be able to read any group in the instance, since groups are ID-addressable.
 */
async function requireSyncedGroup(user: McpUser, groupId: string) {
  const syncedGroup = await prisma.syncedGroup.findFirst({
    where: { groupId, profile: { userId: user.id } },
    select: { activeParticipantId: true },
  })
  if (!syncedGroup) {
    throw new McpToolError(
      `No group "${groupId}" in your synced groups. Call list_groups to see the groups you can use.`,
    )
  }
  const group = await getGroup(groupId)
  if (!group) throw new McpToolError(`Group "${groupId}" no longer exists.`)
  return { group, activeParticipantId: syncedGroup.activeParticipantId }
}

type Participant = { id: string; name: string }

/**
 * Resolves a participant given either an id or a name, so the model can pass through whatever the
 * user said. Ambiguity is an error rather than a guess — picking the wrong person silently moves
 * real money between real people.
 */
function resolveParticipant(
  participants: Participant[],
  reference: string,
  field: string,
): Participant {
  const byId = participants.find((p) => p.id === reference)
  if (byId) return byId

  const needle = normalizeString(reference.trim())
  const matches = participants.filter((p) => normalizeString(p.name) === needle)
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    throw new McpToolError(
      `${field}: "${reference}" matches more than one participant. Use the participant id instead.`,
    )
  }

  const partial = participants.filter((p) =>
    normalizeString(p.name).includes(needle),
  )
  if (partial.length === 1) return partial[0]

  throw new McpToolError(
    `${field}: no participant matching "${reference}". This group has: ${participants
      .map((p) => `${p.name} (${p.id})`)
      .join(', ')}.`,
  )
}

export async function listGroups(user: McpUser) {
  const syncedGroups = await prisma.syncedGroup.findMany({
    where: { profile: { userId: user.id } },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          currency: true,
          currencyCode: true,
          participants: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { syncedAt: 'desc' },
  })

  return {
    groups: syncedGroups.map((sg) => ({
      id: sg.group.id,
      name: sg.group.name,
      currency: sg.group.currencyCode ?? sg.group.currency,
      isStarred: sg.isStarred,
      isArchived: sg.isArchived,
      // Who the user is in this group; the default payer for expenses added here.
      you: sg.activeParticipantId
        ? sg.group.participants.find((p) => p.id === sg.activeParticipantId)
            ?.name ?? null
        : null,
      participants: sg.group.participants,
    })),
  }
}

export async function listExpenses(
  user: McpUser,
  { groupId, limit = 20 }: { groupId: string; limit?: number },
) {
  const { group } = await requireSyncedGroup(user, groupId)
  const currency = getCurrencyFromGroup(group)
  const expenses = await getGroupExpenses(groupId, { length: limit })

  return {
    groupName: group.name,
    currency: currency.code || group.currency,
    expenses: expenses.map((expense) => ({
      id: expense.id,
      title: expense.title,
      date: dayjs(expense.expenseDate).format('YYYY-MM-DD'),
      amount: Number(formatAmountAsDecimal(expense.amount, currency)),
      // Present when the expense was entered in a different currency than the group's.
      originalAmount: expense.originalAmount
        ? Number(
            formatAmountAsDecimal(
              expense.originalAmount,
              getCurrency(expense.originalCurrency),
            ),
          )
        : undefined,
      originalCurrency: expense.originalCurrency ?? undefined,
      category: expense.category?.name,
      isReimbursement: expense.isReimbursement,
      paidBy: expense.paidBy.map((pb) => pb.participant.name),
      paidFor: expense.paidFor.map((pf) => pf.participant.name),
    })),
  }
}

export async function getGroupBalances(
  user: McpUser,
  { groupId }: { groupId: string },
) {
  const { group, activeParticipantId } = await requireSyncedGroup(user, groupId)
  const currency = getCurrencyFromGroup(group)
  const expenses = await getGroupExpenses(groupId)
  const balances = getBalances(expenses)
  const reimbursements = group.simplifyDebts
    ? getSuggestedReimbursements(balances)
    : getDirectReimbursements(expenses)

  const nameOf = (id: string) =>
    group.participants.find((p) => p.id === id)?.name ?? id

  return {
    groupName: group.name,
    currency: currency.code || group.currency,
    you: activeParticipantId ? nameOf(activeParticipantId) : null,
    balances: Object.entries(balances).map(([participantId, balance]) => ({
      participant: nameOf(participantId),
      // Positive means the group owes them, negative means they owe the group.
      balance: Number(formatAmountAsDecimal(balance.total, currency)),
    })),
    suggestedReimbursements: reimbursements.map((r) => ({
      from: nameOf(r.from),
      to: nameOf(r.to),
      amount: Number(formatAmountAsDecimal(r.amount, currency)),
    })),
  }
}

export type AddExpenseInput = {
  groupId: string
  title: string
  amount: number
  currency?: string
  date?: string
  paidBy?: string
  paidFor?: string[]
  splitEvenly?: boolean
  amountsPerParticipant?: { participant: string; amount: number }[]
  /**
   * Lines of the bill. They must add up to `amount`. An item with an empty `participants` list is
   * personal: still part of the bill, but excluded from what the group splits.
   */
  items?: { name: string; price: number; participants?: string[] }[]
  notes?: string
  conversionRate?: number
  isReimbursement?: boolean
  allowDuplicate?: boolean
}

/**
 * A retried tool call arrives with identical arguments moments after the first, so an expense that
 * matches one just created is treated as that same call rather than a second expense. Two genuinely
 * identical expenses in the same couple of minutes are rare, and `allowDuplicate` covers them.
 */
const DUPLICATE_WINDOW_MINUTES = 5

async function findRecentDuplicate(
  groupId: string,
  title: string,
  amountInMinorUnits: number,
  expenseDate: Date,
) {
  return prisma.expense.findFirst({
    where: {
      groupId,
      title,
      amount: amountInMinorUnits,
      expenseDate,
      createdAt: {
        gte: dayjs().subtract(DUPLICATE_WINDOW_MINUTES, 'minute').toDate(),
      },
    },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function addExpense(user: McpUser, input: AddExpenseInput) {
  const { group, activeParticipantId } = await requireSyncedGroup(
    user,
    input.groupId,
  )
  const participants = group.participants.map((p) => ({
    id: p.id,
    name: p.name,
  }))
  const groupCurrency = getCurrencyFromGroup(group)

  if (!Number.isFinite(input.amount) || input.amount === 0) {
    throw new McpToolError('amount must be a non-zero number.')
  }

  // Parsed without dayjs' customParseFormat plugin, which this app does not load, so the shape is
  // checked explicitly rather than relying on lenient parsing.
  if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new McpToolError(`date "${input.date}" must be in YYYY-MM-DD format.`)
  }
  const expenseDate = input.date ? dayjs(input.date) : dayjs()
  if (!expenseDate.isValid()) {
    throw new McpToolError(`date "${input.date}" is not a valid date.`)
  }

  // Payer: whoever was asked for, otherwise whoever this user is in this group.
  const payerReference = input.paidBy ?? activeParticipantId
  if (!payerReference) {
    throw new McpToolError(
      'This group has no participant linked to your account, so there is nobody to record as the payer. Pass paid_by explicitly.',
    )
  }
  const payer = resolveParticipant(participants, payerReference, 'paid_by')

  const beneficiaries = input.paidFor?.length
    ? input.paidFor.map((ref) =>
        resolveParticipant(participants, ref, 'paid_for'),
      )
    : participants
  if (beneficiaries.length === 0) {
    throw new McpToolError('paid_for must name at least one participant.')
  }

  // --- Currency -----------------------------------------------------------------------------
  // Amounts arrive in whatever currency the user spoke in. Only the total is converted; it is
  // stored exactly the way the expense form stores it, so the expense is indistinguishable from
  // one entered in the app and reopens correctly for editing.
  const requestedCode = input.currency
    ? normalizeCurrencyCode(input.currency)
    : undefined
  if (input.currency && !requestedCode) {
    throw new McpToolError(
      `"${input.currency}" is not a currency this app supports. Use an ISO 4217 code such as USD or EUR.`,
    )
  }

  const conversionRequired =
    !!requestedCode &&
    !!groupCurrency.code &&
    requestedCode !== groupCurrency.code
  if (requestedCode && !groupCurrency.code) {
    throw new McpToolError(
      `This group uses a custom currency symbol ("${group.currency}") rather than a currency code, so amounts cannot be converted. Pass the amount in the group's own currency and omit currency.`,
    )
  }

  const expenseCurrency = conversionRequired
    ? getCurrency(requestedCode)
    : groupCurrency

  let rate = 1
  if (conversionRequired) {
    if (input.conversionRate !== undefined) {
      if (!Number.isFinite(input.conversionRate) || input.conversionRate <= 0) {
        throw new McpToolError('conversion_rate must be greater than zero.')
      }
      rate = input.conversionRate
    } else {
      try {
        rate = await getExchangeRate(
          expenseDate.toDate(),
          expenseCurrency.code,
          groupCurrency.code,
        )
      } catch (error) {
        if (error instanceof ExchangeRateError) {
          throw new McpToolError(
            `${error.message} You can pass conversion_rate to set the rate yourself.`,
          )
        }
        throw error
      }
    }
  }

  // --- Split ------------------------------------------------------------------------------
  // Everything below is computed in the currency the amounts were given in; conversion happens
  // once, afterwards, exactly as the expense form does it.
  let splitMode: SplitMode = 'EVENLY'
  let paidFor: { participant: string; shares: number }[]
  let items: { name: string; price: number; participantIds: string[] }[] = []
  // What the group splits, and what the payer put toward it. These differ when some items are
  // personal: the bill was 74 but the group only splits 54 of it.
  let groupTotal = input.amount
  let payerAmount = input.amount

  if (input.items?.length) {
    if (input.amountsPerParticipant?.length) {
      throw new McpToolError(
        'Pass either items or amounts_per_participant, not both: itemised expenses derive the split from the items.',
      )
    }

    const resolvedItems = input.items.map((item) => {
      if (!Number.isFinite(item.price)) {
        throw new McpToolError(`items: "${item.name}" needs a numeric price.`)
      }
      return {
        name: item.name,
        price: item.price,
        // Omitted means everyone (or paid_for, if given); an empty list means the item is
        // personal — part of the bill, but not of what the group splits.
        participantIds:
          item.participants === undefined
            ? beneficiaries.map((p) => p.id)
            : item.participants.map(
                (ref) => resolveParticipant(participants, ref, 'items').id,
              ),
      }
    })

    const itemsTotal = resolvedItems.reduce((sum, i) => sum + i.price, 0)
    if (Math.abs(itemsTotal - input.amount) >= 0.01) {
      throw new McpToolError(
        `The items add up to ${itemsTotal}, but the expense total is ${input.amount}. Every line of the bill has to be listed, including anything only one person is paying for.`,
      )
    }

    // Shared with the expense form's schema, so both split a bill the same way.
    const distributed = distributeItems(resolvedItems, [
      { participant: payer.id, amount: input.amount },
    ])
    if (Math.abs(distributed.amount) < 0.01) {
      throw new McpToolError(
        'Every item is marked as personal, so there is nothing for the group to split.',
      )
    }

    groupTotal = distributed.amount
    payerAmount = distributed.paidBy[0].amount
    paidFor = distributed.paidFor
    items = distributed.items
    splitMode = 'BY_AMOUNT'
  } else if (
    input.amountsPerParticipant?.length &&
    input.splitEvenly !== true
  ) {
    const shares = input.amountsPerParticipant.map((entry) => ({
      participant: resolveParticipant(
        participants,
        entry.participant,
        'amounts_per_participant',
      ).id,
      shares: entry.amount,
    }))
    const total = shares.reduce((sum, s) => sum + s.shares, 0)
    if (Math.abs(total - input.amount) >= 0.01) {
      throw new McpToolError(
        `amounts_per_participant adds up to ${total}, but the expense total is ${input.amount}. They must match.`,
      )
    }
    paidFor = shares
    splitMode = 'BY_AMOUNT'
  } else {
    paidFor = beneficiaries.map((p) => ({ participant: p.id, shares: 1 }))
  }

  // --- Convert -----------------------------------------------------------------------------
  // Each set of parts already adds up to groupTotal, so distributing them over the converted
  // total keeps them adding up to it exactly.
  const convertParts = (parts: number[]) =>
    convertAmountParts(parts, groupTotal, rate, groupCurrency)

  const finalAmount = conversionRequired
    ? convertAmount(groupTotal, rate, groupCurrency)
    : groupTotal
  const finalPayerAmount = conversionRequired
    ? convertParts([payerAmount])[0]
    : payerAmount
  // Shares are money in BY_AMOUNT mode; in EVENLY they are unitless weights, so leave them be.
  const finalPaidFor =
    conversionRequired && splitMode === 'BY_AMOUNT'
      ? (() => {
          const converted = convertParts(paidFor.map((pf) => pf.shares))
          return paidFor.map((pf, index) => ({
            ...pf,
            shares: converted[index],
          }))
        })()
      : paidFor
  const finalItems = conversionRequired
    ? (() => {
        const converted = convertParts(items.map((i) => i.price))
        return items.map((item, index) => ({
          ...item,
          price: converted[index],
        }))
      })()
    : items

  // --- Build the same value object the form submits -----------------------------------------
  const values: ExpenseFormValues = {
    expenseDate: expenseDate.startOf('day').toDate(),
    title: input.title,
    category: 0,
    amount: finalAmount,
    // The original amount records what the group splits, matching `amount`, not the whole bill.
    originalAmount: conversionRequired ? groupTotal : undefined,
    originalCurrency: conversionRequired ? expenseCurrency.code : undefined,
    conversionRate: conversionRequired ? rate : undefined,
    paidBy: [{ participant: payer.id, amount: finalPayerAmount }],
    paidFor: finalPaidFor,
    items: finalItems,
    splitMode,
    saveDefaultSplittingOptions: false,
    isReimbursement: input.isReimbursement ?? false,
    documents: [],
    notes: input.notes,
    recurrenceRule: RecurrenceRule.NONE,
  }

  if (!input.allowDuplicate) {
    const duplicate = await findRecentDuplicate(
      group.id,
      values.title,
      Math.round(Number(values.amount) * 10 ** groupCurrency.decimal_digits),
      values.expenseDate,
    )
    if (duplicate) {
      return {
        created: false,
        reason: 'duplicate' as const,
        expenseId: duplicate.id,
        message: `An identical expense was added to this group within the last ${DUPLICATE_WINDOW_MINUTES} minutes, so nothing was created. Pass allow_duplicate to add it anyway.`,
      }
    }
  }

  const expense = await createExpense(values, group.id, payer.id)

  return {
    created: true as const,
    expenseId: expense.id,
    title: expense.title,
    date: dayjs(expense.expenseDate).format('YYYY-MM-DD'),
    amount: amountAsDecimal(expense.amount, groupCurrency),
    currency: groupCurrency.code || group.currency,
    ...(conversionRequired
      ? {
          originalAmount: input.amount,
          originalCurrency: expenseCurrency.code,
          conversionRate: rate,
        }
      : {}),
    paidBy: payer.name,
    paidFor: beneficiaries.map((p) => p.name),
  }
}
