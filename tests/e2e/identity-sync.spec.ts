import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { signInWithMagicLink } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'

/**
 * "Who are you?" is answered once per account, not once per device: the answer is kept with a
 * synced group and filled in on the next device signed in to the same account.
 */
test('who you are follows the account to another device', async ({
  browser,
}) => {
  const email = `identity-${randomId(4)}@example.com`
  const groupName = `Identity ${randomId(4)}`

  // First device: sync the group, then answer the question.
  const context1 = await browser.newContext()
  const page1 = await context1.newPage()
  await signInWithMagicLink(page1, email)
  const groupId = await createGroupViaAPI(
    page1,
    groupName,
    ['Alice', 'Bob'],
    'USD',
    { suppressActiveUserModal: false, addGroupToRecent: true },
  )
  await createExpenseViaAPI(page1, groupId, {
    title: 'Dinner',
    amount: 3000,
    payerName: 'Bob',
  })
  await page1.goto('/groups')
  await page1.getByRole('button', { name: 'Sync to cloud' }).first().click()
  await expect(page1.locator('svg.lucide-cloud').first()).toBeVisible()

  await page1.goto(`/groups/${groupId}/expenses`)
  const question = page1.getByRole('dialog', { name: 'Who are you?' })
  await expect(question).toBeVisible()
  await page1.getByRole('radio', { name: 'Alice' }).click()
  await page1.getByRole('button', { name: 'Save changes' }).click()
  // Straight away, without a reload: the header now has a share of yours to show.
  await expect(page1.getByTestId('expenses-group-total')).toBeVisible()
  await expect(page1.getByText('Your share')).toBeVisible()
  await context1.close()

  // Second device, nothing stored locally: no question, and the share is Alice's half.
  const context2 = await browser.newContext()
  const page2 = await context2.newPage()
  await signInWithMagicLink(page2, email)
  await page2.goto(`/groups/${groupId}/expenses`)
  await expect(page2.getByText('Your share')).toBeVisible()
  await expect(page2.getByText('Your share').locator('..')).toContainText(
    '$15.00',
  )
  await expect(page2.getByRole('dialog', { name: 'Who are you?' })).toHaveCount(
    0,
  )
  expect(
    await page2.evaluate(
      (id) => localStorage.getItem(`${id}-activeUser`),
      groupId,
    ),
  ).not.toBeNull()
  await context2.close()
})
