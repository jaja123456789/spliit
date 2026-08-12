import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { navigateToTab } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'

test.describe('Recording a payment', () => {
  test('settles a debt from the suggested reimbursement', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `settle ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await createExpenseViaAPI(page, groupId, {
      title: 'Dinner',
      amount: 6000, // $60.00, so Bob owes Alice $30.00
      payerName: 'Alice',
    })

    await page.goto(`/groups/${groupId}/expenses`)
    await navigateToTab(page, 'Balances')

    await expect(page.getByTestId('reimbursement-row-Bob-Alice')).toBeVisible()
    await page
      .getByRole('link', { name: /mark as paid/i })
      .first()
      .click()
    await page.waitForURL(/\/payments\/create/)

    // The pill knows who owes whom and how much, and the screen arrives filled in.
    await expect(page.getByTestId('payment-from')).toContainText('Bob')
    await expect(page.getByTestId('payment-to')).toContainText('Alice')
    await expect(page.locator('input[name="paymentAmount"]')).toHaveValue('30')

    await page.getByTestId('payment-save').click()
    await page.waitForURL(/\/balances/)

    // The debt is gone, and so is the suggestion to settle it.
    await expect(page.getByTestId('no-reimbursements')).toBeVisible()
    await expect(page.getByTestId('balance-row-Bob')).toContainText('$0.00')
    await expect(page.getByTestId('balance-row-Alice')).toContainText('$0.00')
  })

  test('is reachable when the group is already settled', async ({ page }) => {
    // The old entry point was a link on a suggested-reimbursement row, so a settled group offered
    // no way to record a payment at all.
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `settled ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])

    await page.goto(`/groups/${groupId}/expenses`)
    await navigateToTab(page, 'Balances')

    await expect(page.getByTestId('no-reimbursements')).toBeVisible()
    await page.getByRole('link', { name: /record a payment/i }).click()
    await page.waitForURL(/\/payments\/create/)
    await expect(page.getByTestId('payment-from')).toBeVisible()
  })

  test('settles every suggestion at once', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `settle all ${randomId(4)}`, [
      'Alice',
      'Bob',
      'Charlie',
    ])
    // Alice pays for everyone twice over, so both Bob and Charlie owe her.
    await createExpenseViaAPI(page, groupId, {
      title: 'Hotel',
      amount: 9000,
      payerName: 'Alice',
    })

    await page.goto(`/groups/${groupId}/expenses`)
    await navigateToTab(page, 'Balances')
    await expect(page.getByTestId('reimbursement-row-Bob-Alice')).toBeVisible()
    await expect(
      page.getByTestId('reimbursement-row-Charlie-Alice'),
    ).toBeVisible()

    await page.getByTestId('settle-all').click()
    await page.getByTestId('settle-all-confirm').click()

    // Both are recorded together, so the whole group lands settled rather than half settled.
    await expect(page.getByTestId('no-reimbursements')).toBeVisible()
    await expect(page.getByTestId('balance-row-Bob')).toContainText('$0.00')
    await expect(page.getByTestId('balance-row-Charlie')).toContainText('$0.00')
    await expect(page.getByTestId('balance-row-Alice')).toContainText('$0.00')
  })

  test('offers no batch action for a single suggestion', async ({ page }) => {
    await page.goto('/groups')
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `single ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await createExpenseViaAPI(page, groupId, {
      title: 'Taxi',
      amount: 4000,
      payerName: 'Alice',
    })

    await page.goto(`/groups/${groupId}/expenses`)
    await navigateToTab(page, 'Balances')
    await expect(page.getByTestId('reimbursement-row-Bob-Alice')).toBeVisible()
    // One suggestion is not a batch; the row's own button already does it in one tap.
    await expect(page.getByTestId('settle-all')).toHaveCount(0)
  })

  test('refuses a payment from someone to themselves', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `self pay ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])

    await page.goto(`/groups/${groupId}/payments/create`)
    await page.waitForSelector('[data-testid="payment-from"]')

    await page.getByTestId('payment-to').click()
    await page.getByRole('option', { name: 'Alice' }).click()
    await page.locator('input[name="paymentAmount"]').fill('10')
    await page.getByTestId('payment-save').click()

    await expect(page.getByText('Pick two different people.')).toBeVisible()
    await expect(page).toHaveURL(/\/payments\/create/)
  })
})
