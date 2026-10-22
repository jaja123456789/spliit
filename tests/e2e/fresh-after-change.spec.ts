import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { navigateToGroup, navigateToTab } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'
import { createExpense } from '../helpers/expense'

/**
 * After you add an expense, everything that summarises the group says so — without a reload.
 *
 * Saving used to invalidate only the expense list. The total above it, Stats and Activity are
 * separate queries, so for the 30 s they stayed fresh in the cache they kept describing the group
 * as it was before: the new row appeared under a total that had not moved.
 *
 * Every step here is client-side navigation on purpose: a `page.goto` starts a new cache and would
 * pass whether or not anything was invalidated.
 */
test.describe('Data after adding an expense', () => {
  test('the header total, Stats and Activity include it', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Fresh ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await createExpenseViaAPI(page, groupId, {
      title: 'Before',
      amount: 1000,
      payerName: 'Alice',
    })
    await navigateToGroup(page, groupId)

    // Load Stats and Activity once so each has a cached answer to go stale.
    await expect(page.getByTestId('expenses-group-total')).toHaveText(
      /\$10\.00/,
    )
    await navigateToTab(page, 'Stats')
    await expect(page.getByTestId('total-group-spendings')).toHaveText(
      /\$10\.00/,
    )
    await navigateToTab(page, 'Activity')
    await expect(page.getByText('Before').first()).toBeVisible()
    await navigateToTab(page, 'Expenses')

    await createExpense(page, { title: 'After', amount: '5.00', payer: 'Bob' })

    await expect(page.getByTestId('expenses-group-total')).toHaveText(
      /\$15\.00/,
    )
    await navigateToTab(page, 'Stats')
    await expect(page.getByTestId('total-group-spendings')).toHaveText(
      /\$15\.00/,
    )
    await navigateToTab(page, 'Activity')
    await expect(
      page.locator('[data-testid^="activity-item-"]').first(),
    ).toContainText('After')
  })
})
