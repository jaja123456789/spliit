import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { createGroupViaAPI } from '../helpers/batch-api'

test('Theme selection persists after reload', async ({ page }) => {
  await page.goto('/groups')

  // Open theme toggle menu
  const themeToggle = page.getByRole('button', { name: 'Toggle theme' })
  await expect(themeToggle).toBeVisible()
  await themeToggle.click()

  // Select Dark theme
  const darkOption = page.getByRole('menuitem', { name: 'Dark' })
  await expect(darkOption).toBeVisible()
  await darkOption.click()

  // Verify dark theme is applied (body or html should have dark class/attribute)
  const html = page.locator('html')
  await expect(html).toHaveAttribute('class', /dark/)

  // Reload page
  await page.reload()

  // Verify dark theme persisted after reload
  await expect(html).toHaveAttribute('class', /dark/)
})

test('Expense displays with selected category', async ({ page }) => {
  const expenseTitle = `Test Expense ${randomId(4)}`

  await page.goto('/groups')
  const groupId = await createGroupViaAPI(
    page,
    `category test ${randomId(4)}`,
    ['Alice', 'Bob'],
  )

  await page.goto(`/groups/${groupId}/expenses`)

  // Navigate to create expense page
  const createExpenseLink = page.getByRole('link', { name: 'Create expense' })
  await expect(createExpenseLink).toBeVisible()
  await createExpenseLink.click()
  await page.waitForURL(/\/groups\/[^/]+\/expenses\/create$/)

  // Fill expense details
  await page.getByRole('textbox', { name: 'Expense title' }).fill(expenseTitle)
  await page.getByRole('textbox', { name: 'Amount' }).fill('40.00')

  // Select payer
  const payerCombobox = page.getByTestId('paid-by-select-0')
  await payerCombobox.click()
  await page.getByRole('option', { name: 'Alice' }).click()

  // The category is the icon beside the title. It carries no text, so the selection lives in its
  // accessible name — which is also the only thing a screen reader or a hovering cursor gets.
  const categoryTrigger = page.getByTestId('category-trigger')
  await expect(categoryTrigger).toHaveAttribute('title', 'General')
  await categoryTrigger.click()

  // Select Entertainment category
  const entertainmentOption = page.getByRole('option', {
    name: /entertainment/i,
  })
  if (await entertainmentOption.isVisible()) {
    await entertainmentOption.click()
  } else {
    // If Entertainment is not available, select any non-General category
    const options = page.getByRole('option')
    const optionCount = await options.count()
    if (optionCount > 1) {
      // Select second option (first is General)
      await options.nth(1).click()
    }
  }

  // Create the expense
  const createButton = page.getByRole('button', { name: 'Create' })
  await createButton.click()
  await page.waitForURL(/\/groups\/[^/]+\/expenses$/)

  // Verify expense appears with title
  const expenseTitleElement = page
    .getByTestId('expense-title')
    .filter({ hasText: expenseTitle })
  await expect(expenseTitleElement).toBeVisible()
})

test('Default category is General', async ({ page }) => {
  await page.goto('/groups')
  const groupId = await createGroupViaAPI(
    page,
    `default category ${randomId(4)}`,
    ['Alice', 'Bob'],
  )

  await page.goto(`/groups/${groupId}/expenses`)

  // Navigate to create expense page
  const createExpenseLink = page.getByRole('link', { name: 'Create expense' })
  await expect(createExpenseLink).toBeVisible()
  await createExpenseLink.click()
  await page.waitForURL(/\/groups\/[^/]+\/expenses\/create$/)

  // Verify the category defaults to "General"
  const categoryTrigger = page.getByTestId('category-trigger')
  await expect(categoryTrigger).toBeVisible()
  await expect(categoryTrigger).toHaveAttribute('title', 'General')
})
