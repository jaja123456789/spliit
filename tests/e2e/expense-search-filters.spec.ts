import { randomId, todayAsDateOnly } from '@/lib/utils'
import { Page, expect, test } from '@playwright/test'
import { navigateToGroup } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'

/**
 * Finding things in a group that has been going for a year: search reaches past the title, and the
 * list narrows by who paid, by category and by month, with what matched summed up above it.
 */

const rows = (page: Page) => page.locator('[data-testid^="expense-item-"]')
const row = (page: Page, title: string) =>
  rows(page).filter({
    has: page.getByTestId('expense-title').getByText(title, { exact: true }),
  })

async function search(page: Page, text: string) {
  const response = page.waitForResponse('**groups.expenses.list**')
  await page.getByPlaceholder(/search for an expense/i).fill(text)
  await response
}

test.describe('Search', () => {
  test('reaches notes, who paid, and the amount', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Search ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await createExpenseViaAPI(page, groupId, {
      title: 'Lidl',
      amount: 4520,
      payerName: 'Alice',
    })
    await createExpenseViaAPI(page, groupId, {
      title: 'Cinema',
      amount: 2400,
      payerName: 'Bob',
      notes: 'with popcorn',
    })
    await createExpenseViaAPI(page, groupId, {
      title: 'Rent',
      amount: 90000,
      payerName: 'Alice',
    })
    await navigateToGroup(page, groupId)
    await expect(rows(page)).toHaveCount(3)

    await search(page, 'popcorn')
    await expect(rows(page)).toHaveCount(1)
    await expect(row(page, 'Cinema')).toBeVisible()

    await search(page, 'bob')
    await expect(rows(page)).toHaveCount(1)
    await expect(row(page, 'Cinema')).toBeVisible()

    await search(page, '45.20')
    await expect(rows(page)).toHaveCount(1)
    await expect(row(page, 'Lidl')).toBeVisible()

    // Every word has to match: the shop, and roughly how much.
    await search(page, 'lidl 45')
    await expect(rows(page)).toHaveCount(1)
    await search(page, 'lidl 46')
    await expect(page.getByText('No expense matches “lidl 46”.')).toBeVisible()
  })
})

test.describe('Filters', () => {
  test('narrow by who paid, sum what matched, and clear', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Payer ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await createExpenseViaAPI(page, groupId, {
      title: 'Groceries',
      amount: 3000,
      payerName: 'Alice',
    })
    await createExpenseViaAPI(page, groupId, {
      title: 'Cinema',
      amount: 2400,
      payerName: 'Bob',
    })
    await createExpenseViaAPI(page, groupId, {
      title: 'Pizza',
      amount: 1600,
      payerName: 'Bob',
    })

    // Who "you" are decides the share in the summary: pick Alice in the identity modal.
    await page.goto(`/groups/${groupId}/expenses`)
    await page.evaluate((gId) => {
      localStorage.removeItem(`${gId}-activeUser`)
      localStorage.removeItem('newGroup-activeUser')
    }, groupId)
    await page.reload()
    await page.getByRole('radio', { name: 'Alice' }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.reload()
    await expect(rows(page)).toHaveCount(3)

    await page.getByTestId('filter-paid-by').click()
    await page.getByRole('option', { name: 'Bob' }).click()

    await expect(rows(page)).toHaveCount(2)
    await expect(row(page, 'Groceries')).toHaveCount(0)
    await expect(page.getByTestId('filter-paid-by')).toHaveText('Bob')
    // Two expenses, $40 between them, half of it Alice's.
    await expect(page.getByTestId('expense-filter-summary')).toHaveText(
      '2 expenses · $40.00 · your share $20.00',
    )

    await page.getByRole('button', { name: 'Clear Paid by' }).click()
    await expect(rows(page)).toHaveCount(3)
    await expect(page.getByTestId('expense-filter-summary')).toHaveCount(0)
  })

  test('a month keeps to that month, and outlives opening an expense', async ({
    page,
  }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Month ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await createExpenseViaAPI(page, groupId, {
      title: 'Last of August',
      amount: 1000,
      payerName: 'Alice',
      expenseDate: new Date('2026-08-31'),
    })
    await createExpenseViaAPI(page, groupId, {
      title: 'Mid September',
      amount: 2000,
      payerName: 'Alice',
      expenseDate: new Date('2026-09-15'),
    })
    await createExpenseViaAPI(page, groupId, {
      title: 'First of October',
      amount: 3000,
      payerName: 'Bob',
      expenseDate: new Date('2026-10-01'),
    })
    await navigateToGroup(page, groupId)

    await page.getByTestId('filter-month').click()
    // The months that have expenses, newest first, each with its count.
    await expect(page.getByRole('option')).toHaveText([
      'Any time',
      /^October 2026\s*1$/,
      /^September 2026\s*1$/,
      /^August 2026\s*1$/,
    ])
    await page.getByRole('option', { name: /September 2026/ }).click()

    await expect(rows(page)).toHaveCount(1)
    await expect(row(page, 'Mid September')).toBeVisible()
    await expect(page).toHaveURL(/[?&]month=2026-09(&|$)/)

    // Open it and come back: the list is as it was left.
    await row(page, 'Mid September').click()
    await page.waitForURL(/\/edit$/)
    await page.goBack()
    await expect(page.getByTestId('filter-month')).toHaveText('September 2026')
    await expect(rows(page)).toHaveCount(1)
    await expect(row(page, 'Mid September')).toBeVisible()
  })

  test('nothing matching offers to clear the filters', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Empty ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await createExpenseViaAPI(page, groupId, {
      title: 'Groceries',
      amount: 3000,
      payerName: 'Alice',
    })
    await navigateToGroup(page, groupId)

    // Bob paid nothing. Arrive at that address fresh, as a bookmark would.
    await page.getByTestId('filter-paid-by').click()
    await page.getByRole('option', { name: 'Bob' }).click()
    await expect(page).toHaveURL(/[?&]paidBy=/)
    await page.goto(page.url())

    await expect(
      page.getByText('No expense matches these filters.'),
    ).toBeVisible()
    await expect(page.getByTestId('filter-paid-by')).toHaveText('Bob')
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(row(page, 'Groceries')).toBeVisible()
    await expect(page).not.toHaveURL(/paidBy=/)
  })
})

test.describe('Filters on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('picking from the drawer leaves history as it was', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Drawer ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await createExpenseViaAPI(page, groupId, {
      title: 'Groceries',
      amount: 3000,
      payerName: 'Alice',
    })
    await createExpenseViaAPI(page, groupId, {
      title: 'Cinema',
      amount: 2400,
      payerName: 'Bob',
    })
    await page.goto('/groups')
    await navigateToGroup(page, groupId)

    await page.getByTestId('filter-paid-by').click()
    const drawer = page.getByRole('dialog', { name: 'Paid by' })
    await expect(drawer).toBeVisible()
    await drawer.getByRole('option', { name: 'Bob' }).click()
    await expect(drawer).toHaveCount(0)

    await expect(rows(page)).toHaveCount(1)
    await expect(page).toHaveURL(/[?&]paidBy=/)

    // The drawer's own history entry is gone again: one step back leaves the group, rather than
    // landing on the same list without its filter.
    await page.goBack()
    await page.waitForURL(/\/groups$/)
  })
})

test.describe('Rows', () => {
  test('say who it was for only when it was not everyone', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Rows ${randomId(4)}`, [
      'Alice',
      'Bob',
      'Charlie',
    ])
    await createExpenseViaAPI(page, groupId, {
      title: 'Shared',
      amount: 3000,
      payerName: 'Alice',
      // Today where the browser is, not the UTC day `new Date()` would be stored as.
      expenseDate: todayAsDateOnly(),
    })
    await createExpenseViaAPI(page, groupId, {
      title: 'Just Bob',
      amount: 1200,
      payerName: 'Alice',
      excludeParticipants: ['Alice', 'Charlie'],
      expenseDate: todayAsDateOnly(),
    })
    await navigateToGroup(page, groupId)

    await expect(row(page, 'Shared')).toContainText('Paid by Alice')
    await expect(row(page, 'Shared')).not.toContainText(' for ')
    await expect(row(page, 'Just Bob')).toContainText('Paid by Alice for Bob')

    // The month heads the list; each row says its own day, in the line it shares with the payer.
    await expect(page.getByTestId('expense-month')).toHaveCount(1)
    await expect(page.getByTestId('expense-date')).toHaveText([
      'Today',
      'Today',
    ])
  })
})
