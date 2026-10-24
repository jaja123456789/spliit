import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { navigateToTab } from '../helpers'
import { createGroupViaAPI } from '../helpers/batch-api'

test('a group wears the icon chosen for it, on its card and in its bar', async ({
  page,
}) => {
  await page.goto('/groups')
  const name = `icon ${randomId(4)}`
  const groupId = await createGroupViaAPI(page, name, ['Alice', 'Bob'])

  await page.goto(`/groups/${groupId}/expenses`)
  // Before an icon is chosen, the plate carries the name's first letter.
  const bar = page.locator('div.sticky').filter({ hasText: name }).first()
  await expect(bar).toContainText('I')

  await navigateToTab(page, 'Settings')
  await page.getByTestId('group-icon-trigger').click()
  await page.getByRole('button', { name: '🏕️', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^save$/i }).click()

  await page.goto(`/groups/${groupId}/expenses`)
  await expect(bar).toContainText('🏕️')

  await page.goto('/groups')
  await expect(
    page.locator('[data-testid^="group-card-"], [role="button"]').filter({
      hasText: name,
    }),
  ).toContainText('🏕️')
})
