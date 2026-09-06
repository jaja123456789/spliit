import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { navigateToGroup } from '../helpers'
import { createGroupViaAPI } from '../helpers/batch-api'

/**
 * The scan flow, end to end, against a stubbed extractor.
 *
 * The providers are called from a server action, so the fixture is preloaded into the server —
 * see `tests/fixtures/receipt-extraction-stub.cjs` and `webServer.env` in `playwright.config.ts`.
 * The failure case does not need it: failing the action's own POST from the browser produces
 * exactly the rejection the component has to survive.
 *
 * There was no coverage of any of this before, which is how the review screen shipped comparing
 * the extracted lines against a total a hundred times too small.
 */

// A 2x2 JPEG. It is never actually read — the stub answers whatever is sent.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAACAAIBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+v//Z',
  'base64',
)

async function openScannerWithAPage(page: import('@playwright/test').Page) {
  await page
    .getByRole('button', { name: /create expense from receipt/i })
    .click()
  const cameraInput = page.locator('input[type="file"]').first()
  await cameraInput.setInputFiles({
    name: 'receipt.jpg',
    mimeType: 'image/jpeg',
    buffer: JPEG,
  })
  await expect(
    page.getByRole('button', { name: /analyze receipt/i }),
  ).toBeVisible()
}

test.describe('Scanning a receipt', () => {
  test('reads a receipt and hands it to the expense form', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `scan ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await navigateToGroup(page, groupId)

    await openScannerWithAPage(page)
    await page.getByRole('button', { name: /analyze receipt/i }).click()

    // The review screen leads by saying what it is, and that all of it is a guess.
    await expect(page.getByText('Check what was read')).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText(/Reading a receipt is a guess/i)).toBeVisible()
    await expect(page.getByText('Cervejaria Ramiro')).toBeVisible()

    // Five fixture items, two of them with quantities, expand to nine lines.
    await expect(page.getByText('9 lines')).toBeVisible()

    // The check that used to be wrong on every receipt: EUR 71.80 of lines against an EUR 87.40
    // total is EUR 15.60 SHORT — the ordinary tax-and-service case, not "read twice".
    await expect(page.getByText(/15\.60 less than the total/)).toBeVisible()
    await expect(page.getByText(/more than the total/)).toHaveCount(0)

    await page.getByRole('button', { name: /^continue$/i }).click()
    await page.waitForURL(/fromReceipt=true/)

    // The form arrives filled in, itemised, with the merchant as the title.
    await expect(page.locator('[name="title"]')).toHaveValue(
      'Cervejaria Ramiro',
    )
    await expect(page.getByTestId('split-mode-items')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('scanned lines arrive shared, on a narrow screen too', async ({
    page,
  }) => {
    // The regression this exists for only appears below the width where the per-line marks are
    // drawn inline. `items.N.participantIds` had no registered field on any other layout, so React
    // Hook Form pruned it when the field array was rebuilt by `reset` — and every scanned line
    // landed "not shared". At 1280 the same nine lines came through fully shared, which is why the
    // first version of this suite did not catch it.
    await page.setViewportSize({ width: 390, height: 800 })

    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `scan share ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await navigateToGroup(page, groupId)

    await openScannerWithAPage(page)
    await page.getByRole('button', { name: /analyze receipt/i }).click()
    await expect(page.getByText('Check what was read')).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('button', { name: /^continue$/i }).click()
    await page.waitForURL(/fromReceipt=true/)

    const rows = page.locator('[data-testid^="item-row-"]')
    await expect(rows).toHaveCount(9)
    await expect(rows.filter({ hasText: /not shared/i })).toHaveCount(0)
  })

  test('a failed read keeps the photos and offers to carry on by hand', async ({
    page,
  }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `scan fail ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await navigateToGroup(page, groupId)

    // Fail the extraction itself. Every Next server action is a POST carrying `next-action`.
    await page.route('**/*', async (route) => {
      const request = route.request()
      if (request.method() === 'POST' && request.headers()['next-action']) {
        return route.fulfill({ status: 500, body: '' })
      }
      return route.fallback()
    })

    await openScannerWithAPage(page)
    await page.getByRole('button', { name: /analyze receipt/i }).click()

    // Not a toast that scrolls away: a screen that says the photos are safe.
    await expect(page.getByText(/couldn.t read it/i)).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText(/your photos are still here/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /try again/i })).toBeVisible()

    // The slower success: the form, rather than a dead end.
    await page.getByRole('button', { name: /add by hand/i }).click()
    await page.waitForURL(/fromReceipt=true/)
    await expect(page.locator('[name="title"]')).toBeVisible()
  })

  test('is reachable from the empty group and from the itemised split', async ({
    page,
  }) => {
    // The scanner used to have exactly one entry point in the whole app — an icon in the expense
    // list's header — including on the two screens that most obviously want it.
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `scan entry ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await navigateToGroup(page, groupId)

    await expect(
      page.getByRole('button', { name: /scan a receipt/i }),
    ).toBeVisible()

    await page.goto(`/groups/${groupId}/expenses/create`)
    // Evenly is the default, and it has nothing to do with receipts.
    await expect(page.getByTestId('scan-receipt-in-form')).toHaveCount(0)

    await page.getByTestId('split-mode-items').click()
    await expect(page.getByTestId('scan-receipt-in-form')).toBeVisible()
  })
})
