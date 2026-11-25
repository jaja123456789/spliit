import { randomId } from '@/lib/utils'
import { expect, test, type Page } from '@playwright/test'
import { navigateToExpenseCreate } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'
import { AMOUNT_INPUT } from '../helpers/expense'

async function openForm(page: Page, mode?: string) {
  await page.goto('/groups')
  const groupId = await createGroupViaAPI(
    page,
    `Comma ${randomId(4)}`,
    ['Alice', 'Bob', 'Charlie'],
    'EUR',
  )
  await page.goto(`/groups/${groupId}/expenses`)
  await navigateToExpenseCreate(page)
  await page.locator('[name="title"]').fill(`Comma ${mode ?? 'evenly'}`)
  await page.getByTestId('paid-by-select-0').click()
  await page.getByRole('option', { name: 'Alice' }).click()
  return groupId
}

async function pickMode(page: Page, mode: string) {
  await page.getByTestId('split-mode-more').click()
  await page.getByTestId(`split-mode-${mode}`).click()
  const rows = page.getByTestId('paid-for-rows').getByRole('textbox')
  await expect(rows).toHaveCount(3)
  return rows
}

async function shares(page: Page, groupId: string) {
  return page.evaluate(async (id) => {
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
}

async function create(page: Page) {
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(/\/expenses$/)
}

/**
 * A phone's decimal keypad in most of Europe has a comma and no point. Every number field takes
 * one — it used to read as 0, throw, or be refused with nothing on screen.
 */
test.describe('Decimal commas', () => {
  test('in the amount, Evenly shows each share from it', async ({ page }) => {
    const groupId = await openForm(page)
    await page.locator(AMOUNT_INPUT).fill('25,50')
    await expect(page.getByTestId('split-summary')).toContainText('8.50')
    await create(page)
    expect((await shares(page, groupId)).amount).toBe(2550)
  })

  test('in exact amounts', async ({ page }) => {
    const groupId = await openForm(page, 'BY_AMOUNT')
    await page.locator(AMOUNT_INPUT).fill('10')
    const rows = await pickMode(page, 'BY_AMOUNT')
    await rows.nth(0).fill('2,50')
    await rows.nth(1).fill('3,75')
    await rows.nth(2).fill('3,75')
    await create(page)
    expect(await shares(page, groupId)).toEqual({
      amount: 1000,
      shares: [250, 375, 375],
    })
  })

  test('in shares', async ({ page }) => {
    const groupId = await openForm(page, 'BY_SHARES')
    await page.locator(AMOUNT_INPUT).fill('35')
    const rows = await pickMode(page, 'BY_SHARES')
    await rows.nth(0).fill('1,5')
    await rows.nth(1).fill('1')
    await rows.nth(2).fill('1')
    await create(page)
    expect(await shares(page, groupId)).toEqual({
      amount: 3500,
      shares: [100, 100, 150],
    })
  })

  test('in percentages', async ({ page }) => {
    const groupId = await openForm(page, 'BY_PERCENTAGE')
    await page.locator(AMOUNT_INPUT).fill('100')
    const rows = await pickMode(page, 'BY_PERCENTAGE')
    await rows.nth(0).fill('33,34')
    await rows.nth(1).fill('33,33')
    await rows.nth(2).fill('33,33')
    await create(page)
    expect(await shares(page, groupId)).toEqual({
      amount: 10000,
      shares: [3333, 3333, 3334],
    })
  })

  test('in a payment', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(
      page,
      `Pay ${randomId(4)}`,
      ['Alice', 'Bob'],
      'EUR',
    )
    await createExpenseViaAPI(page, groupId, {
      title: 'Lunch',
      amount: 3000,
      payerName: 'Alice',
    })
    await page.goto(`/groups/${groupId}/balances`)
    await page
      .getByTestId('reimbursement-row-Bob-Alice')
      .getByRole('link', { name: /settle/i })
      .click()
    await page.locator('input[name="paymentAmount"]').fill('12,50')
    await page.getByTestId('payment-save').click()
    await page.waitForURL(/\/balances$/)
    expect((await shares(page, groupId)).amount).toBe(1250)
  })

  test('a payment with no amount says so', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Empty ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await page.goto(`/groups/${groupId}/payments/create`)
    await page.locator('input[name="paymentAmount"]').fill('')
    await page.getByTestId('payment-save').click()
    await expect(
      page.getByText('Enter an amount greater than zero.'),
    ).toBeVisible()
  })
})
