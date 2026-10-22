import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { navigateToGroup } from '../helpers'
import { createGroupViaAPI } from '../helpers/batch-api'
import { AMOUNT_INPUT } from '../helpers/expense'

/**
 * A new expense is dated today — today where the person entering it is.
 *
 * The form used to render its default with `toISOString()`, the UTC calendar day: east of UTC that
 * is yesterday for the first hours after midnight, west of UTC it is tomorrow every evening, and an
 * expense saved without touching the field kept the wrong day. The browser's clock and timezone are
 * pinned here because on a machine that happens to run on UTC the bug is invisible.
 */
test.describe('Default expense date, east of UTC after midnight', () => {
  test.use({ timezoneId: 'Europe/Malta' })

  test('defaults to the local day and saves it', async ({ page }) => {
    // 00:36 on 23 October in Malta is still 22 October in UTC.
    await page.clock.setFixedTime(new Date('2026-10-22T22:36:00Z'))
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Date ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await navigateToGroup(page, groupId)

    await page.goto(`/groups/${groupId}/expenses/create`)
    await expect(page.locator('input[name="expenseDate"]')).toHaveValue(
      '2026-10-23',
    )

    await page.locator('[name="title"]').fill('After midnight')
    await page.locator(AMOUNT_INPUT).fill('12.00')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForURL(/\/groups\/[^/]+\/expenses$/)

    const row = page
      .locator('[data-testid^="expense-item-"]')
      .filter({ hasText: 'After midnight' })
    await expect(row.getByTestId('expense-date')).toHaveText(/Oct 23, 2026/i)
  })
})

test.describe('Default expense date, west of UTC in the evening', () => {
  test.use({ timezoneId: 'America/Los_Angeles' })

  test('defaults to the local day, not tomorrow', async ({ page }) => {
    // 19:00 on 22 October in Los Angeles is already 23 October in UTC.
    await page.clock.setFixedTime(new Date('2026-10-23T02:00:00Z'))
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Date ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await navigateToGroup(page, groupId)

    await page.goto(`/groups/${groupId}/expenses/create`)
    await expect(page.locator('input[name="expenseDate"]')).toHaveValue(
      '2026-10-22',
    )
  })
})
