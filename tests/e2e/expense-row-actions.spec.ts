import { randomId } from '@/lib/utils'
import { expect, Locator, test } from '@playwright/test'
import { navigateToGroup } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'

/**
 * An expense can be edited, duplicated or deleted from the list, without opening it first: from a
 * "⋯" menu on wide screens, and by holding the row on a phone.
 */
test.describe('Row actions', () => {
  test('the menu duplicates, and deletes with an undo', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Menu ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    const expenseId = await createExpenseViaAPI(page, groupId, {
      title: 'Bakery',
      amount: 650,
      payerName: 'Alice',
    })
    await navigateToGroup(page, groupId)

    await page.getByRole('button', { name: 'Actions for “Bakery”' }).click()
    await page.getByRole('menuitem', { name: 'Duplicate' }).click()
    await page.waitForURL(
      new RegExp(`/expenses/create\\?duplicate=${expenseId}$`),
    )
    await expect(page.locator('[name="title"]')).toHaveValue('Bakery')
    await page.goBack()

    // Straight away, no "are you sure?": the toast offers Undo instead.
    await page.getByRole('button', { name: 'Actions for “Bakery”' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(page.getByTestId(`expense-item-${expenseId}`)).toHaveCount(0)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByTestId(`expense-item-${expenseId}`)).toBeVisible()
  })
})

test.describe('Row actions on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  /** A finger held on the row: pointer events as a touchscreen sends them. */
  async function hold(row: Locator, ms: number) {
    const box = (await row.boundingBox())!
    const at = {
      pointerType: 'touch',
      isPrimary: true,
      pointerId: 1,
      clientX: box.x + 40,
      clientY: box.y + box.height / 2,
    }
    await row.dispatchEvent('pointerdown', at)
    await row.page().waitForTimeout(ms)
    await row.dispatchEvent('pointerup', at)
  }

  test('holding a row offers its actions; a tap still opens it', async ({
    page,
  }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Hold ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    const expenseId = await createExpenseViaAPI(page, groupId, {
      title: 'Bakery',
      amount: 650,
      payerName: 'Alice',
    })
    await navigateToGroup(page, groupId)
    const row = page.getByTestId(`expense-item-${expenseId}`)

    // No "⋯" on a phone: the row keeps its width.
    await expect(
      page.getByRole('button', { name: 'Actions for “Bakery”' }),
    ).toBeHidden()

    // A short press is a tap, and opens nothing but the expense.
    await hold(row, 100)
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await hold(row, 700)
    const sheet = page.getByRole('dialog', { name: 'Bakery' })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: 'Duplicate' }).click()
    await page.waitForURL(
      new RegExp(`/expenses/create\\?duplicate=${expenseId}$`),
    )

    await page.goBack()
    await row.tap()
    await page.waitForURL(new RegExp(`/expenses/${expenseId}/edit$`))
  })
})
