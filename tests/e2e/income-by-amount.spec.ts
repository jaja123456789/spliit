import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { navigateToExpenseCreate } from '../helpers'
import { createGroupViaAPI } from '../helpers/batch-api'
import { AMOUNT_INPUT } from '../helpers/expense'

/**
 * An income is a negative amount, and each person's part of it is negative too. By exact amount
 * used to demand every part be above 0, so an income could not be split that way at all.
 */
test('an income can be split by exact amounts', async ({ page }) => {
  await page.goto('/groups')
  const groupId = await createGroupViaAPI(page, `Income ${randomId(4)}`, [
    'Alice',
    'Bob',
  ])
  await page.goto(`/groups/${groupId}/expenses`)
  await navigateToExpenseCreate(page)
  await page.locator('[name="title"]').fill('Deposit back')
  await page.getByTestId('paid-by-select-0').click()
  await page.getByRole('option', { name: 'Alice' }).click()
  await page.locator(AMOUNT_INPUT).fill('-10')
  await page.getByTestId('split-mode-more').click()
  await page.getByTestId('split-mode-BY_AMOUNT').click()
  const rows = page.getByTestId('paid-for-rows').getByRole('textbox')
  await expect(rows).toHaveCount(2)
  await rows.nth(0).fill('-4')
  await rows.nth(0).blur()
  await expect(rows.nth(1)).toHaveValue('-6.00')

  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(/\/expenses$/)

  const shares = await page.evaluate(async (id) => {
    const listInput = encodeURIComponent(
      JSON.stringify({ json: { groupId: id, limit: 5 } }),
    )
    const list = await (
      await fetch(`/api/trpc/groups.expenses.list?input=${listInput}`)
    ).json()
    const expenseId = list.result.data.json.expenses[0].id
    const input = encodeURIComponent(
      JSON.stringify({ json: { groupId: id, expenseId } }),
    )
    const res = await fetch(`/api/trpc/groups.expenses.get?input=${input}`)
    const expense = (await res.json()).result.data.json.expense
    return {
      amount: expense.amount,
      shares: expense.paidFor.map((p: { shares: number }) => p.shares).sort(),
    }
  }, groupId)
  expect(shares).toEqual({ amount: -1000, shares: [-400, -600] })
})
