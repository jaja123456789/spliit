import { buildMonthlyStatement, statementToCsv } from './statement'

const alice = { id: 'alice', name: 'Alice' }
const bob = { id: 'bob', name: 'Bob' }
const category = { id: 9, grouping: 'Food and Drink', name: 'Groceries' }

/** An expense in the loader's shape: who paid what, split evenly between the sharers. */
function expense(
  id: string,
  date: string,
  amount: number,
  payer: string,
  sharers: string[],
  { title = id, isReimbursement = false } = {},
) {
  return {
    id,
    title,
    amount,
    expenseDate: new Date(`${date}T00:00:00.000Z`),
    createdAt: new Date(`${date}T12:00:00.000Z`),
    isReimbursement,
    splitMode: 'EVENLY' as const,
    recurrenceRule: null,
    originalAmount: null,
    originalCurrency: null,
    category,
    paidBy: [
      {
        amount,
        participantId: payer,
        participant: payer === 'alice' ? alice : bob,
      },
    ],
    paidFor: sharers.map((sharer) => ({
      participant: sharer === 'alice' ? alice : bob,
      shares: 100,
    })),
    _count: { documents: 0, comments: 0 },
  }
}

const september = {
  start: new Date('2026-09-01T00:00:00.000Z'),
  end: new Date('2026-10-01T00:00:00.000Z'),
}

describe('buildMonthlyStatement', () => {
  const history = [
    // August: Alice paid 100 for both. Bob owes her 50 going into September.
    expense('aug', '2026-08-20', 10000, 'alice', ['alice', 'bob']),
    // September: Bob pays 60 for both, Alice 20 for herself, and Bob settles 50.
    expense('rent', '2026-09-01', 6000, 'bob', ['alice', 'bob']),
    expense('lunch', '2026-09-30', 2000, 'alice', ['alice']),
    expense('settle', '2026-09-15', 5000, 'bob', ['alice'], {
      isReimbursement: true,
    }),
    // October is not September.
    expense('oct', '2026-10-01', 9000, 'alice', ['alice', 'bob']),
  ] as any

  const statement = buildMonthlyStatement([alice, bob], history, september)

  it('counts the month at both ends, and only spending in the total', () => {
    expect(statement.total).toBe(8000)
    expect(statement.expenseCount).toBe(2)
    expect(statement.lines.map((line) => line.id)).toEqual([
      'rent',
      'settle',
      'lunch',
    ])
  })

  it('says who paid and who consumed what this month', () => {
    expect(
      statement.participants.map(({ name, paid, share, net }) => ({
        name,
        paid,
        share,
        net,
      })),
    ).toEqual([
      { name: 'Alice', paid: 2000, share: 5000, net: -3000 },
      { name: 'Bob', paid: 6000, share: 3000, net: 3000 },
    ])
  })

  it('closes on the balance as it stood at the end of the month, payments included', () => {
    // Alice: +5000 from August, -3000 this month, -5000 for the payment she received.
    expect(
      Object.fromEntries(
        statement.participants.map((p) => [p.name, p.closingBalance]),
      ),
    ).toEqual({ Alice: -3000, Bob: 3000 })
    expect(statement.payments).toEqual([
      expect.objectContaining({ from: 'Bob', to: 'Alice', amount: 5000 }),
    ])
  })

  it('exports as CSV a spreadsheet opens as numbers', () => {
    const csv = statementToCsv(
      {
        ...statement,
        lines: [{ ...statement.lines[0], title: 'Rent, "flat"' }],
      },
      {
        groupName: 'Home',
        month: '2026-09',
        currencyCode: 'EUR',
        format: (minor) => (minor / 100).toFixed(2),
      },
    )
    const lines = csv.split('\r\n')
    expect(lines.slice(0, 4)).toEqual([
      'Statement,2026-09',
      'Group,Home',
      'Currency,EUR',
      'Spent,80.00',
    ])
    expect(lines).toContain('Alice,20.00,50.00,-30.00,-30.00')
    expect(lines).toContain('2026-09-15,Bob,Alice,50.00')
    expect(lines).toContain('2026-09-01,"Rent, ""flat""",Groceries,60.00,Bob,')
  })
})
