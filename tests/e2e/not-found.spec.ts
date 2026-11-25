import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { createGroupViaAPI } from '../helpers/batch-api'

/**
 * Links outlive what they point at. A deleted expense's edit page used to stay blank for good, and
 * an unknown group's balances and stats answered with server errors.
 */
test.describe('Things that are gone', () => {
  test('an expense that no longer exists says so', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Gone ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await page.goto(`/groups/${groupId}/expenses/not-an-expense/edit`)
    await expect(page.getByTestId('expense-not-found')).toContainText(
      'This expense no longer exists',
    )
    await page.getByRole('link', { name: 'Back to the expenses' }).click()
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/expenses$`))
  })

  test('an unknown group answers 404, not 500', async ({ page }) => {
    const statuses: number[] = []
    page.on('response', (response) => {
      if (/groups\.(balances\.list|stats\.get)/.test(response.url()))
        statuses.push(response.status())
    })
    await page.goto('/groups/not-a-group/expenses')
    await expect(page.getByText('This group no longer exists')).toBeVisible()
    for (const procedure of ['groups.balances.list', 'groups.stats.get']) {
      const input = encodeURIComponent(
        JSON.stringify({ json: { groupId: 'not-a-group' } }),
      )
      const response = await page.request.get(
        `/api/trpc/${procedure}?input=${input}`,
      )
      expect(response.status()).toBe(404)
    }
    expect(statuses.every((status) => status !== 500)).toBe(true)
  })
})
