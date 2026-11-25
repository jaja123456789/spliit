import type { getGroupExpenses } from '@/lib/api'
import { getBalances } from '@/lib/balances'
import { csvSafeText } from '@/lib/csv-safe'
import { calculateShares } from '@/lib/totals'

type Expense = NonNullable<Awaited<ReturnType<typeof getGroupExpenses>>>[number]

/**
 * One month of a group, the way a household settles it: what was spent, who paid and who consumed
 * what, the payments made, and where everyone stood when the month closed.
 *
 * @param allExpenses The group's whole history — the closing balances count everything before the
 *   month's end, payments included, so they agree with the Balances tab as it read that day.
 * @param range The month, as the UTC midnights date-only values are kept in.
 */
export function buildMonthlyStatement(
  participants: { id: string; name: string }[],
  allExpenses: Expense[],
  range: { start: Date; end: Date },
) {
  const inMonth = allExpenses.filter(
    (expense) =>
      expense.expenseDate >= range.start && expense.expenseDate < range.end,
  )
  const spending = inMonth.filter((expense) => !expense.isReimbursement)

  // Seeded with everyone, so someone who neither paid nor shared shows a row of zeros rather than
  // going missing from the month.
  const people = new Map(
    participants.map((p) => [p.id, { ...p, paid: 0, share: 0 }]),
  )
  for (const expense of spending) {
    for (const payer of expense.paidBy) {
      const person = people.get(payer.participantId)
      if (person) person.paid += payer.amount
    }
    for (const [participantId, share] of Object.entries(
      calculateShares(expense),
    )) {
      const person = people.get(participantId)
      if (person) person.share += share
    }
  }

  const closing = getBalances(
    allExpenses.filter((expense) => expense.expenseDate < range.end),
  )
  const nameOf = (participantId: string | undefined) =>
    participants.find((p) => p.id === participantId)?.name ?? ''

  return {
    total: spending.reduce((sum, expense) => sum + expense.amount, 0),
    expenseCount: spending.length,
    participants: Array.from(people.values()).map((person) => ({
      ...person,
      /** What the month's expenses leave them owed (positive) or owing (negative). */
      net: person.paid - person.share,
      /** Their balance once the month closed, everything before it included. */
      closingBalance: closing[person.id]?.total ?? 0,
    })),
    payments: inMonth
      .filter((expense) => expense.isReimbursement)
      .map((payment) => ({
        id: payment.id,
        date: payment.expenseDate,
        from: nameOf(payment.paidBy[0]?.participantId),
        to: nameOf(payment.paidFor[0]?.participant.id),
        amount: payment.amount,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime()),
    /** Every expense of the month, oldest first: the lines of the statement. */
    lines: inMonth
      .map((expense) => ({
        id: expense.id,
        date: expense.expenseDate,
        title: expense.title,
        category: expense.category?.name ?? '',
        amount: expense.amount,
        paidBy: expense.paidBy
          .map((payer) => nameOf(payer.participantId))
          .join(', '),
        isReimbursement: expense.isReimbursement,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime()),
  }
}

export type MonthlyStatement = ReturnType<typeof buildMonthlyStatement>

/** RFC 4180 quoting: a field with a comma, quote or line break goes in quotes, quotes doubled. */
function csvField(value: string | number) {
  const text = typeof value === 'string' ? csvSafeText(value) : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * The statement as a spreadsheet: a summary per person, the payments, then every line. Amounts in
 * major units with the currency's decimals, so the file opens as numbers.
 */
export function statementToCsv(
  statement: MonthlyStatement,
  {
    groupName,
    month,
    currencyCode,
    format,
  }: {
    groupName: string
    month: string
    currencyCode: string
    /** Minor units to the decimal figure, e.g. 1250 → "12.50". */
    format: (minorUnits: number) => string
  },
) {
  const rows: (string | number)[][] = [
    ['Statement', month],
    ['Group', groupName],
    ['Currency', currencyCode],
    ['Spent', format(statement.total)],
    [],
    ['Participant', 'Paid', 'Share', 'Net', 'Balance at month end'],
    ...statement.participants.map((p) => [
      p.name,
      format(p.paid),
      format(p.share),
      format(p.net),
      format(p.closingBalance),
    ]),
    [],
    ['Payments'],
    ['Date', 'From', 'To', 'Amount'],
    ...statement.payments.map((p) => [
      p.date.toISOString().slice(0, 10),
      p.from,
      p.to,
      format(p.amount),
    ]),
    [],
    ['Expenses'],
    ['Date', 'Title', 'Category', 'Amount', 'Paid by', 'Payment'],
    ...statement.lines.map((line) => [
      line.date.toISOString().slice(0, 10),
      line.title,
      line.category,
      format(line.amount),
      line.paidBy,
      line.isReimbursement ? 'yes' : '',
    ]),
  ]
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n'
}
