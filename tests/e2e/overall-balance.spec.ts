import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { navigateToGroup, setActiveUser } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'

/**
 * The group list's "what do I owe overall" figure, across groups in different currencies.
 *
 * It used to add minor units across groups and label the sum with whichever group the server
 * returned first — €5.00 owed in one group and $2.00 in another read as a single "€7.00".
 */
test.describe('Overall balance on the group list', () => {
  test('gives one figure per currency', async ({ page }) => {
    await page.goto('/groups')
    const eurGroup = await createGroupViaAPI(
      page,
      `Euros ${randomId(4)}`,
      ['Alice', 'Bob'],
      'EUR',
    )
    const usdGroup = await createGroupViaAPI(
      page,
      `Dollars ${randomId(4)}`,
      ['Alice', 'Bob'],
      'USD',
    )
    // Bob pays, split evenly: Alice owes half of each.
    await createExpenseViaAPI(page, eurGroup, {
      title: 'Dinner',
      amount: 1000,
      payerName: 'Bob',
    })
    await createExpenseViaAPI(page, usdGroup, {
      title: 'Taxi',
      amount: 400,
      payerName: 'Bob',
    })
    for (const groupId of [eurGroup, usdGroup]) {
      await navigateToGroup(page, groupId)
      await setActiveUser(page, 'Alice')
    }

    await page.goto('/groups')
    const overall = page.getByTestId('overall-balance')
    await expect(overall).toContainText('You owe €5.00')
    await expect(overall).toContainText('You owe $2.00')
    await expect(overall).not.toContainText('7.00')
  })
})
