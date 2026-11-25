import { randomId } from '@/lib/utils'
import { expect, test, type Page } from '@playwright/test'
import { createGroupViaAPI } from '../helpers/batch-api'

async function trpc(page: Page, path: string, input: unknown, query = false) {
  return page.evaluate(
    async ([path, input, query]) => {
      const body = JSON.stringify({ json: input })
      const res = query
        ? await fetch(`/api/trpc/${path}?input=${encodeURIComponent(body)}`)
        : await fetch(`/api/trpc/${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
          })
      return (await res.json()).result.data.json
    },
    [path, input, query] as const,
  )
}

/**
 * A converted expense opens in the currency it was entered in and is stored in the group's.
 * Reopening it and saving without a change used to move a stored cent between its payers.
 */
test('a converted expense saved unchanged keeps its stored cents', async ({
  page,
}) => {
  await page.goto('/groups')
  const groupId = await createGroupViaAPI(
    page,
    `Convert ${randomId(4)}`,
    ['Alice', 'Bob'],
    'EUR',
  )
  const { group } = await trpc(page, 'groups.get', { groupId }, true)
  const [alice, bob] = group.participants

  // $68.07 + $2.02 at 0.9032, as the form stores it: €61.48 + €1.83.
  const { expenseId } = await trpc(page, 'groups.expenses.create', {
    groupId,
    expenseFormValues: {
      expenseDate: new Date().toISOString(),
      title: 'Converted dinner',
      category: 0,
      paidBy: [
        { participant: alice.id, amount: '61.48' },
        { participant: bob.id, amount: '1.83' },
      ],
      paidFor: [
        { participant: alice.id, shares: '1' },
        { participant: bob.id, shares: '1' },
      ],
      splitMode: 'EVENLY',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      notes: '',
      recurrenceRule: 'NONE',
      items: [],
      originalAmount: '70.09',
      originalCurrency: 'USD',
      conversionRate: '0.9032',
    },
  })

  await page.goto(`/groups/${groupId}/expenses/${expenseId}/edit`)
  // Payers come back in no particular order, so compare them as a set.
  const shown = page.locator('input[name^="paidBy."][name$=".amount"]')
  await expect(shown).toHaveCount(2)
  await expect
    .poll(async () =>
      (
        await shown.evaluateAll((inputs) =>
          inputs.map((i) => (i as HTMLInputElement).value),
        )
      ).sort(),
    )
    .toEqual(['2.02', '68.07'])
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/groups\/[^/]+(\/expenses)?$/)

  const { expense } = await trpc(
    page,
    'groups.expenses.get',
    { groupId, expenseId },
    true,
  )
  expect(
    expense.paidBy.map((p: { amount: number }) => p.amount).sort(),
  ).toEqual([183, 6148])
  expect(expense.amount).toBe(6331)
})
