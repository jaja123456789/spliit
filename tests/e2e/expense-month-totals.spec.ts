import { randomId } from '@/lib/utils'
import { expect, test, type Page } from '@playwright/test'
import { navigateToGroup } from '../helpers'
import {
  createExpenseViaAPI,
  createExpensesViaAPI,
  createGroupViaAPI,
} from '../helpers/batch-api'

const heading = (page: Page, month: string) =>
  page
    .getByTestId('expense-month')
    .filter({ has: page.locator(`time[datetime="${month}"]`) })

/**
 * Each month in the list is headed by what it came to. The list arrives twenty rows at a time, so
 * the figure is not the sum of what has loaded; and it follows the group total's rule, leaving
 * settling up out.
 */
test.describe('Month headings in the expense list', () => {
  test('carry the whole month, without settling up', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Months ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    // March: 25 × $10, more than the first page holds once April's two rows are above them.
    await createExpensesViaAPI(
      page,
      groupId,
      Array.from({ length: 25 }, (_, i) => ({
        title: `March ${i + 1}`,
        amount: 1000,
        payerName: i % 2 ? 'Bob' : 'Alice',
        expenseDate: new Date(Date.UTC(2025, 2, i + 1, 12)),
      })),
    )
    await createExpenseViaAPI(page, groupId, {
      title: 'Groceries',
      amount: 1234,
      payerName: 'Alice',
      expenseDate: new Date('2025-04-05T12:00:00Z'),
    })
    await createExpenseViaAPI(page, groupId, {
      title: 'Settling up',
      amount: 500,
      payerName: 'Bob',
      isReimbursement: true,
      expenseDate: new Date('2025-04-06T12:00:00Z'),
      excludeParticipants: ['Bob'],
    })

    await navigateToGroup(page, groupId)

    await expect(heading(page, '2025-04')).toHaveText(/April 2025\s*\$12\.34/)
    await expect(heading(page, '2025-03')).toHaveText(/March 2025\s*\$250\.00/)
  })

  test('add up only what a filter shows', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Filtered ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await createExpenseViaAPI(page, groupId, {
      title: 'Groceries',
      amount: 3000,
      payerName: 'Alice',
      expenseDate: new Date('2025-05-03T12:00:00Z'),
    })
    await createExpenseViaAPI(page, groupId, {
      title: 'Cinema',
      amount: 2400,
      payerName: 'Bob',
      expenseDate: new Date('2025-05-10T12:00:00Z'),
    })

    await navigateToGroup(page, groupId)
    await expect(heading(page, '2025-05')).toHaveText(/\$54\.00/)

    await page.getByTestId('filter-paid-by').click()
    await page.getByRole('option', { name: 'Bob' }).click()
    await expect(heading(page, '2025-05')).toHaveText(/\$24\.00/)
  })
})

test('a recurring expense is marked as one in the list', async ({ page }) => {
  await page.goto('/groups')
  const groupId = await createGroupViaAPI(page, `Recurring ${randomId(4)}`, [
    'Alice',
    'Bob',
  ])
  const rentId = await createExpenseViaAPI(page, groupId, {
    title: 'Rent',
    amount: 120000,
    payerName: 'Alice',
    recurrenceRule: 'MONTHLY',
  })
  const pizzaId = await createExpenseViaAPI(page, groupId, {
    title: 'Pizza',
    amount: 1800,
    payerName: 'Bob',
  })

  await navigateToGroup(page, groupId)

  const rent = page.getByTestId(`expense-item-${rentId}`)
  await expect(rent.getByTestId('expense-recurring')).toBeVisible()
  // Named for a screen reader too, not only drawn.
  await expect(rent.getByTestId('expense-recurring')).toHaveText('Repeats')
  await expect(
    page
      .getByTestId(`expense-item-${pizzaId}`)
      .getByTestId('expense-recurring'),
  ).toHaveCount(0)
})
