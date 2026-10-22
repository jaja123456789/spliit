import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { navigateToGroup, navigateToTab } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'

/**
 * An expense can be opened from the keyboard.
 *
 * Rows were `div`s with a click handler, and the row is the only way into an expense — so editing
 * or deleting one was impossible without a pointer. Tab went from the search box to the footer.
 */
test.describe('Keyboard access to rows', () => {
  test('Tab reaches an expense and Enter opens it', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Keys ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    const expenseId = await createExpenseViaAPI(page, groupId, {
      title: 'Groceries',
      amount: 2400,
      payerName: 'Alice',
    })
    await navigateToGroup(page, groupId)

    const row = page.getByTestId(`expense-item-${expenseId}`)
    await expect(row).toBeVisible()
    await page.getByPlaceholder(/search for an expense/i).focus()
    await page.keyboard.press('Tab')
    await expect(row).toBeFocused()

    await page.keyboard.press('Enter')
    await page.waitForURL(new RegExp(`/expenses/${expenseId}/edit$`))
  })

  test('an activity entry for an expense is a link too', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Keys ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    const expenseId = await createExpenseViaAPI(page, groupId, {
      title: 'Rent',
      amount: 50000,
      payerName: 'Bob',
    })
    await navigateToGroup(page, groupId)
    await navigateToTab(page, 'Activity')

    const entry = page.locator('[data-testid^="activity-item-"]').first()
    await expect(entry).toHaveAttribute(
      'href',
      new RegExp(`/expenses/${expenseId}/edit$`),
    )
    await entry.focus()
    await page.keyboard.press('Enter')
    await page.waitForURL(new RegExp(`/expenses/${expenseId}/edit$`))
  })
})
