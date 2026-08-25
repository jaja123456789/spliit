import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { createGroupViaAPI } from '../helpers/batch-api'
import { AMOUNT_INPUT } from '../helpers/expense'

/**
 * The unsaved-expense banner exists so that an accidental back does not throw away what you were
 * typing. It started offering to restore expenses that did not exist: typing a title and deleting
 * it left behind a category the extractor had guessed, typing an amount and clearing it left `""`
 * where a `0` had been, and dropping a person from an evenly split and putting them back rebuilt
 * `paidFor` in a different order. All three are changes to the form; none of them is an expense.
 *
 * These cover both halves of the bargain, because the easy way to stop the noise is to break the
 * feature: nothing worth restoring is never offered, and something worth restoring always is.
 */

const banner = /You have an unsaved expense from earlier/i

async function newGroup(page: import('@playwright/test').Page) {
  await page.goto('/groups')
  const groupId = await createGroupViaAPI(page, `draft ${randomId(4)}`, [
    'Alice',
    'Bob',
    'Charlie',
  ])
  return groupId
}

async function openCreateForm(
  page: import('@playwright/test').Page,
  groupId: string,
) {
  await page.goto(`/groups/${groupId}/expenses/create`)
  await page.locator('input[name="title"]').waitFor({ state: 'visible' })
  // The draft is written from a form-watch subscription, so give it a tick to settle before
  // navigating away — otherwise the test measures the race rather than the rule.
  await page.waitForTimeout(600)
}

test.describe('The unsaved-expense banner', () => {
  test('is not offered after typing a title and deleting it again', async ({
    page,
  }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)

    const title = page.locator('input[name="title"]')
    await title.fill('Coffee')
    await title.blur()
    await page.waitForTimeout(600)
    await title.fill('')
    await title.blur()
    await page.waitForTimeout(600)

    await openCreateForm(page, groupId)
    await expect(page.getByText(banner)).toHaveCount(0)
  })

  test('is not offered after typing an amount and clearing it again', async ({
    page,
  }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)

    const amount = page.locator(AMOUNT_INPUT)
    await amount.fill('12.50')
    await page.waitForTimeout(400)
    await amount.fill('')
    await page.waitForTimeout(600)

    await openCreateForm(page, groupId)
    await expect(page.getByText(banner)).toHaveCount(0)
  })

  test('is not offered after dropping someone from the split and adding them back', async ({
    page,
  }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)

    const chip = page.getByTestId('evenly-chip-Bob')
    await chip.click()
    await page.waitForTimeout(400)
    await chip.click()
    await page.waitForTimeout(600)

    await openCreateForm(page, groupId)
    await expect(page.getByText(banner)).toHaveCount(0)
  })

  test('is offered when there really is something half-typed', async ({
    page,
  }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)

    await page.locator('input[name="title"]').fill('Taxi to the airport')
    await page.locator(AMOUNT_INPUT).fill('30')
    await page.locator('input[name="title"]').blur()
    await page.waitForTimeout(800)

    // Leaving the way an accidental back does: to another page in the app.
    await page.goto(`/groups/${groupId}/expenses`)
    await openCreateForm(page, groupId)

    await expect(page.getByText(banner)).toBeVisible()
    await page.getByRole('button', { name: /^restore$/i }).click()
    await expect(page.locator('input[name="title"]')).toHaveValue(
      'Taxi to the airport',
    )
  })

  test('is offered for an amount alone, with no title — the figure is the expense', async ({
    page,
  }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)

    await page.locator(AMOUNT_INPUT).fill('12.75')
    await page.locator(AMOUNT_INPUT).blur()
    await page.waitForTimeout(800)

    await openCreateForm(page, groupId)
    await expect(page.getByText(banner)).toBeVisible()
  })

  test('is gone once the expense has actually been saved', async ({ page }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)

    await page.locator('input[name="title"]').fill('Bus fare')
    await page.locator(AMOUNT_INPUT).fill('3.10')
    await page.locator('input[name="title"]').blur()
    await page.waitForTimeout(800)

    await page
      .getByRole('button', { name: /^create$/i })
      .first()
      .click()
    await page.waitForURL((url) => !/\/create/.test(url.pathname))
    await page.waitForTimeout(800)

    await openCreateForm(page, groupId)
    await expect(page.getByText(banner)).toHaveCount(0)
  })
})
