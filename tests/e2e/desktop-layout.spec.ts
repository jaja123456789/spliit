import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { navigateToGroup } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'

/**
 * From 1024px the expense list has the balances beside it, kept in view while the list scrolls;
 * below that the page is the phone layout, with no panel at all.
 */
test.describe('Expenses with balances beside them', () => {
  test('a wide screen shows who owes what next to the list, kept current', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Wide ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    const expenseId = await createExpenseViaAPI(page, groupId, {
      title: 'Groceries',
      amount: 3000,
      payerName: 'Alice',
    })
    await navigateToGroup(page, groupId)

    const panel = page.getByRole('complementary', { name: 'Balances' })
    await expect(panel).toBeVisible()
    const toSettle = panel.getByTestId('reimbursements-list')
    await expect(toSettle).toContainText('Bob')
    await expect(toSettle).toContainText('Alice')
    await expect(toSettle).toContainText('$15.00')

    // Deleting from the list settles everything, and the panel says so without a reload.
    await page.getByRole('button', { name: 'Actions for “Groceries”' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(page.getByTestId(`expense-item-${expenseId}`)).toHaveCount(0)
    await expect(panel.getByTestId('no-reimbursements')).toBeVisible()
  })

  test('below 1024px there is no panel', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 900 })
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Narrow ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await createExpenseViaAPI(page, groupId, {
      title: 'Groceries',
      amount: 3000,
      payerName: 'Alice',
    })
    await navigateToGroup(page, groupId)
    await expect(page.getByTestId('expense-title')).toHaveText('Groceries')
    await expect(
      page.getByRole('complementary', { name: 'Balances' }),
    ).toBeHidden()
    await expect(page.getByTestId('reimbursements-list')).toHaveCount(0)
  })
})
