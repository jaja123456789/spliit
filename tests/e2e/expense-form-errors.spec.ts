import { randomId } from '@/lib/utils'
import { expect, test, type Page } from '@playwright/test'
import { navigateToExpenseCreate } from '../helpers'
import { createGroupViaAPI } from '../helpers/batch-api'
import { AMOUNT_INPUT } from '../helpers/expense'

async function openCreate(page: Page) {
  await page.goto('/groups')
  const groupId = await createGroupViaAPI(page, `Errors ${randomId(4)}`, [
    'Alice',
    'Bob',
    'Charlie',
  ])
  await page.goto(`/groups/${groupId}/expenses`)
  await navigateToExpenseCreate(page)
  await page.locator('[name="title"]').waitFor()
  await page.getByTestId('paid-by-select-0').click()
  await page.getByRole('option', { name: 'Alice' }).click()
  return groupId
}

/**
 * A Create that does nothing, with nothing on screen to say why, is the worst answer a form can
 * give. Each of these used to be one.
 */
test.describe('The expense form says why it will not save', () => {
  test('Evenly after a custom split starts from one share each', async ({
    page,
  }) => {
    await openCreate(page)
    // By amount before any amount: every row becomes 0.00.
    await page.getByTestId('split-mode-more').click()
    await page.getByTestId('split-mode-BY_AMOUNT').click()
    await page.getByTestId('split-mode-evenly').click()
    await page.locator('[name="title"]').fill('Switched modes')
    await page.locator(AMOUNT_INPUT).fill('30')
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL(/\/expenses$/)
    await expect(
      page.getByTestId('expense-title').filter({ hasText: 'Switched modes' }),
    ).toBeVisible()
  })

  test('a split problem shows even when the split rows are hidden', async ({
    page,
  }) => {
    await openCreate(page)
    await page.locator('[name="title"]').fill('Nobody')
    await page.locator(AMOUNT_INPUT).fill('30')
    await page.getByRole('button', { name: 'Select none' }).click()
    await page.locator('button[type="submit"]').first().click()
    await expect(page.getByTestId('offscreen-errors')).toContainText(
      'at least one participant',
    )
    await expect(page).toHaveURL(/\/expenses\/create/)
  })

  test('a refusal from the server is shown', async ({ page }) => {
    await openCreate(page)
    await page.route('**/api/trpc/groups.expenses.create**', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            json: {
              message: 'Invalid input',
              code: -32600,
              data: { code: 'BAD_REQUEST', httpStatus: 400 },
            },
          },
        }),
      }),
    )
    await page.locator('[name="title"]').fill('Refused')
    await page.locator(AMOUNT_INPUT).fill('30')
    await page.locator('button[type="submit"]').first().click()
    await expect(page.getByText('The expense could not be saved')).toBeVisible()
    await expect(page.locator('button[type="submit"]').first()).toBeEnabled()
  })
})
