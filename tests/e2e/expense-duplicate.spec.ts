import { randomId, toDateInputValue, todayAsDateOnly } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { navigateToGroup } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'
import { AMOUNT_INPUT } from '../helpers/expense'

/**
 * Most entries in a household repeat: the same shop, the same people, the same split. Duplicating
 * one starts a new expense from it, dated today.
 */
test.describe('Duplicating an expense', () => {
  test('starts a new expense from it, dated today', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Copy ${randomId(4)}`, [
      'Alice',
      'Bob',
      'Charlie',
    ])
    const originalId = await createExpenseViaAPI(page, groupId, {
      title: 'Groceries',
      amount: 4250,
      payerName: 'Bob',
      category: 9,
      notes: 'weekly shop',
      expenseDate: new Date('2026-09-01'),
      excludeParticipants: ['Charlie'],
    })
    await navigateToGroup(page, groupId)

    await page.getByTestId(`expense-item-${originalId}`).click()
    await page.waitForURL(/\/edit$/)
    await page.getByRole('link', { name: 'Duplicate' }).click()
    await page.waitForURL(/\/expenses\/create\?duplicate=/)

    await expect(page.locator('[name="title"]')).toHaveValue('Groceries')
    // In the currency's decimals, as an amount is read.
    await expect(page.locator(AMOUNT_INPUT)).toHaveValue('42.50')
    await expect(page.locator('input[name="expenseDate"]')).toHaveValue(
      toDateInputValue(todayAsDateOnly()),
    )
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForURL(/\/groups\/[^/]+\/expenses$/)

    // Two now: the copy today, the original where it was — same payer, same people.
    const rows = page
      .locator('[data-testid^="expense-item-"]')
      .filter({ hasText: 'Groceries' })
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('Today')
    await expect(rows.nth(1)).toContainText('Sep 1')
    for (const row of [rows.nth(0), rows.nth(1)]) {
      await expect(row).toContainText('Paid by Bob for Alice, Bob')
      await expect(row).toContainText('$42.50')
    }
  })

  test('a new expense offers the ones entered often', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Often ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    for (const [amount, date] of [
      [4000, '2026-10-01'],
      [4520, '2026-10-08'],
    ] as const) {
      await createExpenseViaAPI(page, groupId, {
        title: 'Groceries',
        amount,
        payerName: 'Bob',
        expenseDate: new Date(date),
      })
    }
    await createExpenseViaAPI(page, groupId, {
      title: 'Cinema',
      amount: 2400,
      payerName: 'Alice',
    })
    await navigateToGroup(page, groupId)
    await page.goto(`/groups/${groupId}/expenses/create`)

    // Entered twice, so offered; the cinema once, so not. Typing makes them go.
    const shortcuts = page.getByTestId('expense-shortcuts')
    await expect(shortcuts.getByRole('button')).toHaveText([/^Groceries/])
    await page.locator('[name="title"]').fill('Something else')
    await expect(shortcuts).toHaveCount(0)
    await page.locator('[name="title"]').fill('')
    await expect(shortcuts).toBeVisible()

    // The latest one: $45.20, paid by Bob.
    await shortcuts.getByRole('button', { name: /Groceries/ }).click()
    await page.waitForURL(/\/expenses\/create\?duplicate=/)
    await expect(page.locator('[name="title"]')).toHaveValue('Groceries')
    await expect(page.locator(AMOUNT_INPUT)).toHaveValue('45.20')
    await expect(shortcuts).toHaveCount(0)
  })
})
