import { randomId } from '@/lib/utils'
import { expect, test, type Page } from '@playwright/test'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'

async function participants(page: Page, groupId: string) {
  return page.evaluate(async (id) => {
    const input = encodeURIComponent(JSON.stringify({ json: { groupId: id } }))
    const res = await fetch(`/api/trpc/groups.get?input=${input}`)
    return (await res.json()).result.data.json.group.participants as Array<{
      id: string
      name: string
    }>
  }, groupId)
}

/** Things that used to fail with nothing on screen. */
test.describe('Failures say so', () => {
  test('a "you" who was removed from the group is asked about again', async ({
    page,
  }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(
      page,
      `Removed ${randomId(4)}`,
      ['Alice', 'Bob', 'Carol'],
      'USD',
      { suppressActiveUserModal: false, addGroupToRecent: true },
    )
    const people = await participants(page, groupId)
    const carol = people.find((p) => p.name === 'Carol')!
    await page.evaluate(
      ([g, p]) => localStorage.setItem(`${g}-activeUser`, p),
      [groupId, carol.id],
    )
    // Elsewhere, Carol leaves the group.
    await page.evaluate(
      async ([g, keep]) => {
        await fetch('/api/trpc/groups.update', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            json: {
              groupId: g,
              groupFormValues: {
                name: 'Removed',
                currency: '$',
                currencyCode: 'USD',
                simplifyDebts: true,
                participants: keep,
              },
            },
          }),
        })
      },
      [
        groupId,
        people
          .filter((p) => p.name !== 'Carol')
          .map(({ id, name }) => ({ id, name })),
      ] as const,
    )

    await page.goto(`/groups/${groupId}/expenses`)
    await expect(
      page.getByRole('dialog', { name: 'Who are you?' }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        (g) => localStorage.getItem(`${g}-activeUser`),
        groupId,
      ),
    ).toBeNull()
  })

  test('a comment that cannot be posted says so and keeps the text', async ({
    page,
  }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Comment ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    const expenseId = await createExpenseViaAPI(page, groupId, {
      title: 'Taxi',
      amount: 2000,
      payerName: 'Alice',
    })
    await page.route('**/api/trpc/groups.expenses.comments.create**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            json: {
              message: 'down',
              code: -32603,
              data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
            },
          },
        }),
      }),
    )
    await page.goto(`/groups/${groupId}/expenses/${expenseId}/edit`)
    await page.getByPlaceholder('Add a comment…').fill('Who has the receipt?')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(
      page.getByText('The comment could not be posted').first(),
    ).toBeVisible()
    await expect(page.getByPlaceholder('Add a comment…')).toHaveValue(
      'Who has the receipt?',
    )
  })

  test('two deletions in a row each keep their Undo', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Undo ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    for (const title of ['Bakery', 'Florist']) {
      await createExpenseViaAPI(page, groupId, {
        title,
        amount: 1000,
        payerName: 'Alice',
      })
    }
    await page.goto(`/groups/${groupId}/expenses`)
    for (const title of ['Bakery', 'Florist']) {
      await page.getByRole('button', { name: `Actions for “${title}”` }).click()
      await page.getByRole('menuitem', { name: 'Delete' }).click()
      await expect(page.getByText(`“${title}” deleted`).first()).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(2)
  })

  test('deleting an expense that is already gone says so', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Gone ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    const expenseId = await createExpenseViaAPI(page, groupId, {
      title: 'Bakery',
      amount: 1000,
      payerName: 'Alice',
    })
    await page.goto(`/groups/${groupId}/expenses`)
    await expect(page.getByTestId(`expense-item-${expenseId}`)).toBeVisible()
    // Someone else deletes it first.
    await page.evaluate(
      async ([g, e]) =>
        fetch('/api/trpc/groups.expenses.delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ json: { groupId: g, expenseId: e } }),
        }),
      [groupId, expenseId],
    )
    await page.getByRole('button', { name: 'Actions for “Bakery”' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(
      page.getByText('The expense could not be deleted').first(),
    ).toBeVisible()
    await expect(page.getByTestId(`expense-item-${expenseId}`)).toHaveCount(0)
  })
})
