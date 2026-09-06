import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { createGroupViaAPI } from '../helpers/batch-api'
import { AMOUNT_INPUT } from '../helpers/expense'

/** Types a three-line receipt into a fresh expense and returns nothing — the page is the subject. */
async function itemisedExpense(page: any, groupId: string) {
  await page.goto(`/groups/${groupId}/expenses/create`)
  await page.waitForSelector('[name="title"]')
  await page.locator('[name="title"]').fill('Dinner')
  await page.locator(AMOUNT_INPUT).fill('74.00')
  await page.getByTestId('split-mode-items').click()
  await page.waitForSelector('input[name="items.0.name"]')

  const lines: [string, string][] = [
    ['Pizza', '24.00'],
    ['Steak', '32.00'],
    ['Wine', '18.00'],
  ]
  for (const [index, [name, price]] of lines.entries()) {
    if (index > 0) {
      await page.getByTestId('add-item').click()
      await page.waitForSelector(`input[name="items.${index}.name"]`)
    }
    await page.locator(`input[name="items.${index}.name"]`).fill(name)
    await page.locator(`input[name="items.${index}.price"]`).fill(price)
  }
}

test.describe('Assigning several lines at once', () => {
  test('applies one set of people to every selected line', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `bulk ${randomId(4)}`, [
      'Alice',
      'Bob',
      'Charlie',
    ])
    await itemisedExpense(page, groupId)

    await page.getByTestId('select-lines').click()
    await page.getByTestId('select-line-1').check()
    await page.getByTestId('select-line-2').check()

    // The bar reports the money selected, not just the row count: assigning lines is a decision
    // about an amount. 32.00 + 18.00.
    const bar = page.getByTestId('selection-bar')
    await expect(bar).toContainText('2 lines')
    await expect(bar).toContainText('50.00')

    await page.getByTestId('bulk-assign').click()
    await page.getByRole('button', { name: /nobody/i }).click()
    await page.getByRole('button', { name: /^Alice/ }).click()
    await page.getByTestId('bulk-assign-apply').click()

    // Both selected lines moved; the unselected one did not.
    await expect(page.getByTestId('selection-bar')).toHaveCount(0)
    const rows = page.locator('input[name^="items."][name$=".name"]')
    await expect(rows).toHaveCount(3)

    // A row states who shares it two ways depending on the width it has. Wide enough, and every
    // person is their own toggle in the row; otherwise the row carries a stack and a summary and
    // opens a picker. Both are asserted here rather than one, because which one renders is a
    // property of the viewport and not of what this test is about.
    const marks = page.getByTestId('marks-0')
    if (await marks.count()) {
      const on = (row: number) =>
        page.getByTestId(`marks-${row}`).locator('[aria-pressed="true"]')
      await expect(on(0)).toHaveCount(3)
      await expect(on(1)).toHaveCount(1)
      await expect(on(2)).toHaveCount(1)
    } else {
      await expect(page.getByTestId('assign-row-0')).toContainText('everyone')
      await expect(page.getByTestId('assign-row-1')).toContainText('Alice only')
      await expect(page.getByTestId('assign-row-2')).toContainText('Alice only')
    }
  })

  test('offers no selection mode for a single line', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `single ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await page.goto(`/groups/${groupId}/expenses/create`)
    await page.waitForSelector('[name="title"]')
    await page.locator('[name="title"]').fill('Taxi')
    await page.locator(AMOUNT_INPUT).fill('20.00')
    await page.getByTestId('split-mode-items').click()
    await page.waitForSelector('input[name="items.0.name"]')

    // One line is not a batch.
    await expect(page.getByTestId('select-lines')).toHaveCount(0)
  })
})
