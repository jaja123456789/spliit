import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import {
  createExpenseViaAPI,
  createExpensesViaAPI,
  createGroupViaAPI,
} from '../helpers/batch-api'

test.describe('The group bar', () => {
  test('the expense form has a way out on a phone', async ({ page }) => {
    // It had none: the tab bar is hidden on the form, Cancel had been removed in favour of a back
    // chevron that was never built, and an installed iPhone app has no browser toolbar.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `bar ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])

    await page.goto(`/groups/${groupId}/expenses/create`)
    await expect(
      page.getByRole('heading', { level: 1, name: 'New expense' }),
    ).toBeVisible()
    await page.getByRole('link', { name: 'Close' }).click()
    await page.waitForURL(/\/expenses$/)

    await page.goto(`/groups/${groupId}/payments/create`)
    await page.getByRole('link', { name: 'Close' }).click()
    await page.waitForURL(/\/balances$/)
  })

  test('keeps the total in view once it scrolls away', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `total ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await createExpenseViaAPI(page, groupId, {
      title: 'Dinner',
      amount: 6000,
      payerName: 'Alice',
    })
    await createExpensesViaAPI(page, groupId, 15, ['Alice', 'Bob'])

    await page.goto(`/groups/${groupId}/expenses`)
    await expect(page.getByTestId('expenses-group-total')).toBeVisible()
    await expect(page.getByTestId('group-bar-summary')).toHaveCount(0)

    await page.mouse.wheel(0, 900)
    await expect(page.getByTestId('group-bar-summary')).toContainText(
      'Group total',
    )

    await page.mouse.wheel(0, -2000)
    await expect(page.getByTestId('group-bar-summary')).toHaveCount(0)
  })
})
