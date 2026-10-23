import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { navigateToGroup } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'

/**
 * A month as a household settles it: who paid and consumed what, the payments, and the balances
 * when it closed — on Stats, and as a CSV.
 */
test('a month has a statement, and it exports', async ({ page }) => {
  await page.goto('/groups')
  const groupId = await createGroupViaAPI(page, `Statement ${randomId(4)}`, [
    'Alice',
    'Bob',
  ])
  // August leaves Bob owing Alice $50.
  await createExpenseViaAPI(page, groupId, {
    title: 'August shop',
    amount: 10000,
    payerName: 'Alice',
    expenseDate: new Date('2026-08-20'),
  })
  // September: Bob pays $60 for both, Alice $20 for herself, and Bob settles $50.
  await createExpenseViaAPI(page, groupId, {
    title: 'Rent',
    amount: 6000,
    payerName: 'Bob',
    expenseDate: new Date('2026-09-01'),
  })
  await createExpenseViaAPI(page, groupId, {
    title: 'Lunch',
    amount: 2000,
    payerName: 'Alice',
    expenseDate: new Date('2026-09-30'),
    excludeParticipants: ['Bob'],
  })
  await createExpenseViaAPI(page, groupId, {
    title: 'Settling up',
    amount: 5000,
    payerName: 'Bob',
    isReimbursement: true,
    expenseDate: new Date('2026-09-15'),
    excludeParticipants: ['Bob'],
  })
  await navigateToGroup(page, groupId)

  // From the list's month filter to that month's statement.
  await page.getByTestId('filter-month').click()
  await page.getByRole('option', { name: /September 2026/ }).click()
  // Exact: the group's own name in the header says "Statement" too.
  await page.getByRole('link', { name: 'statement', exact: true }).click()
  await page.waitForURL(/\/stats\?month=2026-09$/)
  await expect(page.getByTestId('stats-month')).toHaveText('September 2026')

  const statement = page.getByTestId('monthly-statement')
  await expect(statement).toContainText('Statement · September 2026')
  const people = statement.getByTestId('statement-people')
  await expect(people.getByRole('row').nth(1)).toContainText(
    /Alice\s*\$20\.00\s*\$50\.00\s*[−-]\s*\$30\.00/,
  )
  await expect(people.getByRole('row').nth(2)).toContainText(
    /Bob\s*\$60\.00\s*\$30\.00\s*\+\s*\$30\.00/,
  )
  await expect(statement.getByTestId('statement-payments')).toContainText(
    'Bob → Alice',
  )
  await expect(statement.getByTestId('statement-payments')).toContainText(
    '$50.00',
  )

  // The figures above the statement are September's too.
  await expect(page.getByTestId('total-group-spendings')).toContainText(
    '$80.00',
  )

  const download = page.waitForEvent('download')
  await statement.getByRole('button', { name: 'Export CSV' }).click()
  const csv = await readFile((await (await download).path())!, 'utf8')
  const lines = csv.split('\r\n')
  expect(lines).toContain('Spent,80.00')
  expect(lines).toContain('Alice,20.00,50.00,-30.00,-30.00')
  expect(lines).toContain('Bob,60.00,30.00,30.00,30.00')
  expect(lines).toContain('2026-09-15,Bob,Alice,50.00')
  expect(lines.filter((line) => line.startsWith('2026-09-'))).toHaveLength(4)
})
