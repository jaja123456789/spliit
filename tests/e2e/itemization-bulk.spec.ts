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
    // Counted as lines, not as name inputs: only the line being edited has fields in it now.
    const rows = page.locator('[data-testid^="item-row-"]')
    await expect(rows).toHaveCount(3)

    // Only the line being edited says who shares it — a closed line is its name and its price.
    // So each is opened in turn, and then read whichever way the width draws it: wide enough and
    // every person is their own toggle in the row, otherwise a stack and a summary.
    for (const [row, sharers] of [
      [0, 3],
      [1, 1],
      [2, 1],
    ] as const) {
      const opener = page.getByTestId(`edit-line-${row}`)
      if (await opener.count()) await opener.click()

      const marks = page.getByTestId(`marks-${row}`)
      if (await marks.count()) {
        await expect(marks.locator('[aria-pressed="true"]')).toHaveCount(
          sharers,
        )
      } else {
        await expect(page.getByTestId(`assign-row-${row}`)).toContainText(
          sharers === 3 ? 'everyone' : 'Alice only',
        )
      }
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
