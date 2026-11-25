import { randomId } from '@/lib/utils'
import { expect, test, type Page } from '@playwright/test'
import { navigateToExpenseCreate } from '../helpers'
import { createGroupViaAPI } from '../helpers/batch-api'
import { AMOUNT_INPUT, expandMoreOptions } from '../helpers/expense'

async function startExpense(page: Page, groupId: string, title: string) {
  await page.goto(`/groups/${groupId}/expenses`)
  await navigateToExpenseCreate(page)
  await page.locator('[name="title"]').fill(title)
  await page.locator(AMOUNT_INPUT).fill('100')
  await page.getByTestId('paid-by-select-0').click()
  await page.getByRole('option', { name: 'Alice' }).click()
}

const rows = (page: Page) =>
  page.getByTestId('paid-for-rows').getByRole('textbox')

/**
 * "Save as default splitting options" keeps a split for the next expense. It came back divided by
 * 100: a saved 50/25/25 reopened as 0.5/0.25/0.25, which can never be saved.
 */
for (const [mode, values] of [
  ['BY_PERCENTAGE', ['50', '25', '25']],
  ['BY_SHARES', ['2', '1', '1']],
] as const) {
  test(`a saved ${mode} default comes back as it was typed`, async ({
    page,
  }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Default ${randomId(4)}`, [
      'Alice',
      'Bob',
      'Charlie',
    ])
    await startExpense(page, groupId, 'First')
    await page.getByTestId('split-mode-more').click()
    await page.getByTestId(`split-mode-${mode}`).click()
    for (let i = 0; i < 3; i++) await rows(page).nth(i).fill(values[i])
    await expandMoreOptions(page)
    await page.getByText('Save as default splitting options').click()
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL(/\/expenses$/)

    await startExpense(page, groupId, 'Second')
    await expect(rows(page)).toHaveCount(3)
    for (let i = 0; i < 3; i++) {
      await expect(rows(page).nth(i)).toHaveValue(values[i])
    }
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL(/\/expenses$/)
    await expect(
      page.getByTestId('expense-title').filter({ hasText: 'Second' }),
    ).toBeVisible()
  })
}
