import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { createGroupViaAPI } from '../helpers/batch-api'

test.describe('The groups home', () => {
  test('adds a group by its link, from under the list', async ({ page }) => {
    await page.goto('/groups')
    const name = `by link ${randomId(4)}`
    const groupId = await createGroupViaAPI(page, name, ['Alice', 'Bob'])
    // Known to the server, not yet to this browser: as when someone else made it.
    await page.evaluate(() => localStorage.removeItem('recentGroups'))
    await page.reload()
    await expect(page.getByText(name)).toHaveCount(0)

    // Create is the page's one button; adding by link waits under the list.
    await expect(
      page.getByRole('link', { name: 'Create', exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Add by URL' }).click()
    await page
      .getByPlaceholder('https://spliit.app/...')
      .fill(new URL(`/groups/${groupId}`, page.url()).toString())
    await page.keyboard.press('Enter')

    await expect(page.getByText(name)).toBeVisible()
  })
})
