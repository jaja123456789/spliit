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

test('a group can wear any emoji, typed from the keyboard', async ({
  page,
}) => {
  await page.goto('/groups')
  const name = `any icon ${randomId(4)}`
  const groupId = await createGroupViaAPI(page, name, ['Alice', 'Bob'])

  await page.goto(`/groups/${groupId}/edit`)
  await page.getByTestId('group-icon-trigger').click()
  const field = page.getByTestId('group-icon-custom')

  // Text is refused, and leaves the plate as it was.
  await field.fill('flat')
  const refusal = page.getByText('Only an emoji can go here.')
  await expect(refusal).toBeVisible()
  await expect(page.getByTestId('group-icon-trigger')).toContainText('A')

  // An emoji that is not a quick pick, then another typed after it: the newest one wins.
  // An emoji keyboard inserts a flag whole, so insertText rather than a key at a time.
  await field.fill('🦩')
  await expect(refusal).toHaveCount(0)
  await field.press('End')
  await page.keyboard.insertText('🇲🇹')
  await expect(field).toHaveValue('🇲🇹')
  await expect(page.getByTestId('group-icon-trigger')).toContainText('🇲🇹')

  await page.keyboard.press('Escape')
  const saved = page.waitForResponse(
    (response) => response.url().includes('groups.update') && response.ok(),
  )
  await page.getByRole('button', { name: /^save$/i }).click()
  await saved

  await page.goto(`/groups/${groupId}/expenses`)
  const bar = page.locator('div.sticky').filter({ hasText: name }).first()
  await expect(bar).toContainText('🇲🇹')

  // Reopened, the field shows the emoji it holds, since it is not among the quick picks.
  await page.goto(`/groups/${groupId}/edit`)
  await page.getByTestId('group-icon-trigger').click()
  await expect(page.getByTestId('group-icon-custom')).toHaveValue('🇲🇹')
})
