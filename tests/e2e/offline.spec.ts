import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { navigateToGroup } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'
import { AMOUNT_INPUT } from '../helpers/expense'

/**
 * A group opened online opens again without a network, and an expense added offline waits on the
 * device and is sent when the network comes back. The service worker is real here: it installs on
 * the first visit and serves from the next.
 */
test('a group opened online works offline, and adds wait for the network', async ({
  page,
  context,
}) => {
  await page.goto('/groups')
  const groupId = await createGroupViaAPI(page, `Offline ${randomId(4)}`, [
    'Alice',
    'Bob',
  ])
  await createExpenseViaAPI(page, groupId, {
    title: 'Before',
    amount: 1000,
    payerName: 'Alice',
  })
  await navigateToGroup(page, groupId)

  // Installed on the first visit; in charge of the page — and saving what it loads — from the next.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true)
  await expect(page.getByTestId('expense-title')).toHaveText('Before')
  // The create screen is saved ahead of being opened.
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const cache = await caches.open('spliit-pages-v1')
        return !!(await cache.match(`/groups/${id}/expenses/create`))
      }, groupId),
    )
    .toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('offline-banner')).toBeVisible()
  await expect(page.getByTestId('expense-title')).toHaveText('Before')

  // Into the create screen the way anyone would: the link, which navigates client-side and falls
  // back to a full load when that fails offline.
  await page.getByRole('link', { name: 'Create expense' }).first().click()
  await page.waitForURL(/\/expenses\/create$/)
  await page.locator('[name="title"]').fill('Offline lunch')
  await page.locator(AMOUNT_INPUT).fill('24.00')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL(/\/expenses$/)

  const pending = page.locator('[data-testid^="pending-expense-"]')
  await expect(pending).toHaveCount(1)
  await expect(pending).toContainText('Offline lunch')
  await expect(pending).toContainText('$24.00')

  // Back online: sent, gone from the waiting list, and a row like any other.
  await context.setOffline(false)
  await expect(pending).toHaveCount(0)
  await expect(
    page.getByTestId('expense-title').filter({ hasText: 'Offline lunch' }),
  ).toBeVisible()
  await expect(page.getByTestId('expense-title')).toHaveCount(2)
})
