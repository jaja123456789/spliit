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

/**
 * The browser can say it is online while a request fails anyway — flaky Wi-Fi, a server
 * restarting. Nothing fires when that is over, so waiting expenses are tried again on a timer, and
 * a server error is waited out rather than taken as a refusal.
 */
test.describe('the outbox keeps trying', () => {
  async function openGroup(page: import('@playwright/test').Page) {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Retry ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await createExpenseViaAPI(page, groupId, {
      title: 'Before',
      amount: 1000,
      payerName: 'Alice',
    })
    await navigateToGroup(page, groupId)
    await expect(page.getByTestId('expense-title').first()).toHaveText('Before')
    return groupId
  }

  async function addExpense(
    page: import('@playwright/test').Page,
    title: string,
  ) {
    await page.getByRole('link', { name: 'Create expense' }).first().click()
    await page.waitForURL(/\/expenses\/create$/)
    await page.locator('[name="title"]').fill(title)
    await page.locator(AMOUNT_INPUT).fill('24.00')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForURL(/\/expenses$/)
  }

  test('a request lost while online is sent again later', async ({ page }) => {
    await page.clock.install()
    await openGroup(page)
    let attempts = 0
    await page.route('**/api/trpc/groups.expenses.create**', (route) =>
      attempts++ === 0 ? route.abort('connectionreset') : route.continue(),
    )
    await addExpense(page, 'Flaky lunch')
    const pending = page.locator('[data-testid^="pending-expense-"]')
    await expect(pending).toHaveCount(1)

    await page.clock.runFor(31_000)
    await expect(pending).toHaveCount(0)
    await expect(
      page.getByTestId('expense-title').filter({ hasText: 'Flaky lunch' }),
    ).toHaveCount(1)
  })

  test('a server error is waited out, not taken as a refusal', async ({
    page,
  }) => {
    await page.clock.install()
    await openGroup(page)
    // The save itself and the outbox's first go both meet a server that cannot reach its
    // database; the timer's go meets one that can.
    let attempts = 0
    await page.route('**/api/trpc/groups.expenses.create**', (route) =>
      attempts++ < 2
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                json: {
                  message: "Can't reach database server",
                  code: -32603,
                  data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
                },
              },
            }),
          })
        : route.continue(),
    )
    await addExpense(page, 'Dinner during a restart')
    const pending = page.locator('[data-testid^="pending-expense-"]')
    await expect(pending).toHaveCount(1)
    await expect.poll(() => attempts).toBe(2)
    await expect(pending).not.toContainText('Could not be added')

    await page.clock.runFor(31_000)
    await expect(pending).toHaveCount(0)
    await expect(
      page
        .getByTestId('expense-title')
        .filter({ hasText: 'Dinner during a restart' }),
    ).toHaveCount(1)
    expect(attempts).toBe(3)
  })
})
