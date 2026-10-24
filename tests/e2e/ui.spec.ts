import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { navigateToGroup, switchLocale } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'

test('Mobile navigation uses the bottom tab bar', async ({ page }) => {
  // Set viewport to mobile size (iPhone SE)
  await page.setViewportSize({ width: 375, height: 667 })

  // Create a test group
  await page.goto('/groups')
  const groupId = await createGroupViaAPI(page, `mobile test ${randomId(4)}`, [
    'Alice',
    'Bob',
  ])

  // Create an expense so we have content to verify
  await createExpenseViaAPI(page, groupId, {
    title: 'Mobile Test Expense',
    amount: 5000,
    payerName: 'Alice',
  })

  // Navigate to group page
  await page.goto(`/groups/${groupId}/expenses`)

  // Verify the expense is visible in mobile view
  const mobileExpenseTitle = page
    .getByTestId('expense-title')
    .filter({ hasText: 'Mobile Test Expense' })
  await expect(mobileExpenseTitle).toBeVisible()

  // Verify amount is visible in mobile layout
  const mobileExpenseAmount = page
    .getByTestId('expense-amount')
    .filter({ hasText: '$50.00' })
  await expect(mobileExpenseAmount).toBeVisible()

  // Verify tabs are still accessible in mobile view
  const statsTab = page.getByRole('tab', { name: 'Stats' })
  await expect(statsTab).toBeVisible()
  await statsTab.click()

  // Verify we navigated to Stats
  await page.waitForURL(/\/stats$/)
  await expect(page.getByRole('heading', { name: 'Group total' })).toBeVisible()
})

test('Mobile folds the last two tabs into More', async ({ page }) => {
  // Six labels never fitted a phone: "Information" wanted 62px in a box that is 45px at 360 and
  // 57px at 430, so it was clipped on every phone made. Four tabs and a More retires that.
  await page.setViewportSize({ width: 375, height: 667 })

  await page.goto('/groups')
  const groupId = await createGroupViaAPI(page, `more nav ${randomId(4)}`, [
    'Alice',
    'Bob',
  ])
  await navigateToGroup(page, groupId)

  // The four primary destinations are tabs; the folded two are not.
  for (const name of ['Expenses', 'Balances', 'Stats', 'Activity', 'More']) {
    await expect(page.getByRole('tab', { name, exact: true })).toBeVisible()
  }
  for (const name of ['Information', 'Settings']) {
    await expect(page.getByRole('tab', { name, exact: true })).toHaveCount(0)
  }

  // They are still reachable, one tap further in.
  await page.getByRole('tab', { name: 'More' }).click()
  const information = page.getByRole('link', { name: 'Information' })
  await expect(information).toBeVisible()
  await information.click()
  await page.waitForURL(/\/information$/)

  // And the bar says where you are, which is the whole point of an overflow having a state.
  await expect(page.getByRole('tab', { name: 'More' })).toHaveAttribute(
    'data-state',
    'active',
  )
})

test('Desktop view displays full layout', async ({ page }) => {
  // Set viewport to desktop size
  await page.setViewportSize({ width: 1280, height: 1024 })

  // Create a test group
  await page.goto('/groups')
  const groupId = await createGroupViaAPI(page, `desktop test ${randomId(4)}`, [
    'Alice',
    'Bob',
  ])

  // Create an expense
  await createExpenseViaAPI(page, groupId, {
    title: 'Desktop Test Expense',
    amount: 10000,
    payerName: 'Alice',
  })

  // Navigate to group page
  await page.goto(`/groups/${groupId}/expenses`)

  // Verify main content is visible
  await expect(page.getByRole('main')).toBeVisible()

  // Verify the group's bar is visible: its way back to the group list, and the group's name.
  await expect(page.getByRole('link', { name: 'Groups' })).toBeVisible()

  // Verify all tabs are visible without scrolling
  await expect(page.getByRole('tab', { name: 'Expenses' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Balances' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Stats' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Settings' })).toBeVisible()

  // Verify expense card details are fully visible
  const desktopExpenseTitle = page
    .getByTestId('expense-title')
    .filter({ hasText: 'Desktop Test Expense' })
  await expect(desktopExpenseTitle).toBeVisible()

  const desktopExpenseAmount = page
    .getByTestId('expense-amount')
    .filter({ hasText: '$100.00' })
  await expect(desktopExpenseAmount).toBeVisible()

  // Who paid is the row's leading plate now; the words "Paid by Alice" stay in the row for screen
  // readers, since the plate is decorative.
  await expect(page.locator('[data-testid^="expense-item-"]')).toContainText(
    'Paid by Alice',
  )
})

test('Date format changes with locale selection', async ({ page }) => {
  // Create a test group
  await page.goto('/groups')
  const groupId = await createGroupViaAPI(
    page,
    `i18n date test ${randomId(4)}`,
    ['Alice', 'Bob'],
  )

  // Create an expense with a known date
  const expense = await createExpenseViaAPI(page, groupId, {
    title: 'i18n Date Test',
    amount: 5000,
    payerName: 'Alice',
    expenseDate: new Date('2026-01-17'), // January 17, 2026
  })

  // Navigate to group page
  await navigateToGroup(page, groupId)

  // Verify expense is visible
  const expenseItem = page.getByTestId(`expense-item-${expense}`)
  await expect(expenseItem).toBeVisible()

  // The row says its day; the year is in the month heading above it.
  const expenseDateElement = page.getByTestId('expense-date').first()
  await expect(expenseDateElement).toHaveAttribute('datetime', '2026-01-17')
  await expect(expenseDateElement).toHaveText('Jan 17')

  // Switch to Spanish locale
  await switchLocale(page, 'Español')

  await expect(expenseDateElement).toHaveText('17 ene')
})

test('Currency displays with correct format for locale', async ({ page }) => {
  // Create a test group with USD currency
  await page.goto('/groups')
  const groupId = await createGroupViaAPI(
    page,
    `currency format test ${randomId(4)}`,
    ['Alice', 'Bob'],
  )

  // Create an expense with a specific amount
  await createExpenseViaAPI(page, groupId, {
    title: 'Currency Format Test',
    amount: 123456,
    payerName: 'Alice',
  })

  // Navigate to group page
  await page.goto(`/groups/${groupId}/expenses`)

  // Verify expense is visible
  const currencyExpenseTitle = page
    .getByTestId('expense-title')
    .filter({ hasText: 'Currency Format Test' })
  await expect(currencyExpenseTitle).toBeVisible()

  // In English (US) locale, USD amounts display as $1,234.56
  // Verify the amount displays with $ prefix and period as decimal separator
  const expenseAmount = page
    .getByTestId('expense-amount')
    .filter({ hasText: '$1,234.56' })
  await expect(expenseAmount).toBeVisible()

  // Navigate to Stats to see total
  await page.getByRole('tab', { name: 'Stats' }).click()
  await page.waitForURL(/\/stats$/)

  // Verify the total also uses correct format
  const totalGroupSpending = page.getByTestId('total-group-spendings')
  await expect(totalGroupSpending).toContainText('$1,234.56')

  // Switch to French locale which uses different number formatting
  await switchLocale(page, 'Français')

  // In French locale, numbers use space as thousands separator and comma as decimal
  // $1,234.56 becomes 1 234,56 $ or similar format
  // At minimum, verify the page still works and displays amounts
  await expect(page.getByText(/1.*234.*56/)).toBeVisible()
})
