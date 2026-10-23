import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { deleteExpense, navigateToGroup, navigateToTab } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'

/**
 * A deleted expense can be put back: from the toast straight after, or later from the activity
 * feed. Either way it comes back as it was, not as a copy.
 */
test.describe('Undoing a deletion', () => {
  test('Undo in the toast puts the expense back', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Undo ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    const expenseId = await createExpenseViaAPI(page, groupId, {
      title: 'Dinner',
      amount: 4800,
      payerName: 'Alice',
    })
    await navigateToGroup(page, groupId)

    await deleteExpense(page, 'Dinner')
    await expect(
      page.getByRole('region', { name: /Notifications/ }),
    ).toContainText('“Dinner” deleted')
    await page.getByRole('button', { name: 'Undo' }).click()

    // The same expense, under its own id, and the totals with it again.
    await expect(page.getByTestId(`expense-item-${expenseId}`)).toBeVisible()
    await expect(page.getByTestId('expenses-group-total')).toContainText(
      '$48.00',
    )
  })

  test('the activity feed can restore it later', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Restore ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    const expenseId = await createExpenseViaAPI(page, groupId, {
      title: 'Taxi',
      amount: 2200,
      payerName: 'Bob',
    })
    await navigateToGroup(page, groupId)
    await deleteExpense(page, 'Taxi')

    await navigateToTab(page, 'Activity')
    const deletion = page
      .locator('[data-testid^="activity-item-"]')
      .filter({ hasText: 'deleted' })
    await deletion.getByRole('button', { name: 'Restore' }).click()

    // Restored, said so, and the deletion now leads to the expense rather than offering again.
    await expect(
      page
        .locator('[data-testid^="activity-item-"]')
        .filter({ hasText: 'restored' }),
    ).toBeVisible()
    await expect(deletion.getByRole('button', { name: 'Restore' })).toHaveCount(
      0,
    )
    await expect(deletion).toHaveAttribute(
      'href',
      new RegExp(`/expenses/${expenseId}/edit$`),
    )

    await navigateToTab(page, 'Expenses')
    await expect(page.getByTestId(`expense-item-${expenseId}`)).toBeVisible()
  })
})
