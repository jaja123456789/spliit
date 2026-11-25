import { randomId } from '@/lib/utils'
import { expect, test, type Page } from '@playwright/test'
import { navigateToExpenseCreate } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'
import { AMOUNT_INPUT, expandMoreOptions } from '../helpers/expense'

async function participants(page: Page, groupId: string) {
  return page.evaluate(async (id) => {
    const input = encodeURIComponent(JSON.stringify({ json: { groupId: id } }))
    const res = await fetch(`/api/trpc/groups.get?input=${input}`)
    const group = (await res.json()).result.data.json.group
    return Object.fromEntries(
      group.participants.map((p: { id: string; name: string }) => [
        p.name,
        p.id,
      ]),
    ) as Record<string, string>
  }, groupId)
}

async function readExpense(page: Page, groupId: string, expenseId: string) {
  return page.evaluate(
    async ([groupId, expenseId]) => {
      const input = encodeURIComponent(
        JSON.stringify({ json: { groupId, expenseId } }),
      )
      const res = await fetch(`/api/trpc/groups.expenses.get?input=${input}`)
      const expense = (await res.json()).result.data.json.expense
      return {
        paidBy: expense.paidBy.map((p: any) => p.participantId),
        paidFor: expense.paidFor.map((p: any) => p.participantId),
        isReimbursement: expense.isReimbursement,
      }
    },
    [groupId, expenseId],
  )
}

/**
 * A payment is one person paying another back. The form shows who received it, in place of a
 * split — it used to show nothing, so the recipient could neither be seen nor changed.
 */
test.describe('A payment names who received it', () => {
  test('editing a payment shows and changes the recipient', async ({
    page,
  }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Recipient ${randomId(4)}`, [
      'Alice',
      'Bob',
      'Charlie',
    ])
    const ids = await participants(page, groupId)
    const paymentId = await createExpenseViaAPI(page, groupId, {
      title: 'Bob pays back',
      amount: 1000,
      payerName: 'Bob',
      isReimbursement: true,
      paidFor: [{ participant: ids.Alice!, shares: 1 }],
    })

    await page.goto(`/groups/${groupId}/expenses/${paymentId}/edit`)
    const recipient = page.getByTestId('payment-recipient-select')
    await expect(recipient).toContainText('Alice')

    await recipient.click()
    await page.getByRole('option', { name: 'Charlie' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForURL(/\/groups\/[^/]+(\/expenses)?$/)
    expect(await readExpense(page, groupId, paymentId)).toEqual({
      paidBy: [ids.Bob],
      paidFor: [ids.Charlie],
      isReimbursement: true,
    })
  })

  test('ticking "This is a reimbursement" picks someone other than the payer', async ({
    page,
  }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Tick ${randomId(4)}`, [
      'Alice',
      'Bob',
      'Charlie',
    ])
    await page.goto(`/groups/${groupId}/expenses`)
    await navigateToExpenseCreate(page)
    await page.locator('[name="title"]').fill('Paying Bob back')
    await page.locator(AMOUNT_INPUT).fill('20')
    await page.getByTestId('paid-by-select-0').click()
    await page.getByRole('option', { name: 'Alice' }).click()
    await expandMoreOptions(page)
    await page.getByRole('checkbox', { name: /reimbursement/i }).check()

    const recipient = page.getByTestId('payment-recipient-select')
    await expect(recipient).toBeVisible()
    await expect(recipient).not.toContainText('Alice')
    await recipient.click()
    await page.getByRole('option', { name: 'Bob' }).click()

    // The payer and the recipient the same: said, and not saved.
    await page.getByTestId('paid-by-select-0').click()
    await page.getByRole('option', { name: 'Bob' }).click()
    await page.locator('button[type="submit"]').first().click()
    await expect(
      page.getByText(
        'A payment goes to someone other than the person who paid it.',
      ),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/expenses\/create/)

    await page.getByTestId('paid-by-select-0').click()
    await page.getByRole('option', { name: 'Alice' }).click()
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL(/\/expenses$/)
    // A payment's row is the transfer itself.
    await expect(
      page.getByRole('link', { name: /Alice paid Bob \$20\.00/ }),
    ).toBeVisible()
  })
})
