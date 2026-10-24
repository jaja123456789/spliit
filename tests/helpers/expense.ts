import { expect, type Page } from '@playwright/test'

/**
 * The amount field's name.
 *
 * It was `amount` until the expense form was rebuilt around a hero amount; the field is now the
 * first payer's amount, because an expense can have several payers and the total is their sum.
 * Named here rather than repeated, since three helpers need it.
 *
 * Note this is only an `<input>` in the single-payer, non-itemised case. With several payers or an
 * itemised bill the total is derived and rendered as text, so a helper that types into it will not
 * find it — the parts are edited further down the form instead.
 */
export const AMOUNT_INPUT = 'input[name="paidBy.0.amount"]'

export interface CreateExpenseOptions {
  title: string
  amount: string
  payer: string
  category?: string
  date?: string
  notes?: string
  isReimbursement?: boolean
  splitMode?: 'evenly' | 'shares' | 'percentage' | 'amount'
  splitValues?: Record<string, string>
  recurrence?: 'Daily' | 'Weekly' | 'Monthly'
}

/**
 * Waits for the expense list to have answered: its rows, or the empty state.
 *
 * Until then the list's header is on screen with its add and scan buttons, and a group with
 * nothing in it then hides that header (it stays mounted, so it is hidden, not detached). A button
 * found before the list answers is one Playwright goes on waiting for, invisible, until timeout.
 */
export async function waitForExpenseList(page: Page): Promise<void> {
  await page
    .locator('[data-testid^="expense-item-"]')
    .or(page.getByText('Nothing here yet'))
    .first()
    .waitFor({ state: 'visible' })
}

/**
 * Navigates to the expense creation page
 */
export async function navigateToExpenseCreate(page: Page): Promise<void> {
  // The header's icon button titled "Create expense", or the tab bar's on a phone. In a group with
  // nothing in it yet, whose header is hidden, it is the empty state's "Create the first one".
  await waitForExpenseList(page)
  const createExpenseButton = page
    .getByRole('link', { name: /create expense/i })
    .or(page.getByRole('link', { name: 'Create the first one' }))
    .filter({ visible: true })
    .first()

  await createExpenseButton.click()
  await page.waitForURL(/\/groups\/[^/]+\/expenses\/create/)
}

/**
 * Creates an expense with the specified options
 * @param excludeParticipants - Optional array of participant names to exclude from the expense split
 */
export async function createExpense(
  page: Page,
  options: CreateExpenseOptions,
  excludeParticipants?: string[],
): Promise<void> {
  await navigateToExpenseCreate(page)
  await fillExpenseForm(page, options)

  // Exclude specific participants if provided
  if (excludeParticipants && excludeParticipants.length > 0) {
    for (const participant of excludeParticipants) {
      const checkbox = page.getByRole('checkbox', { name: participant })
      await expect(checkbox).toBeVisible()
      await checkbox.uncheck()
    }
  }

  await submitExpenseAndVerify(page, options.title)
}

/**
 * Sets the recurrence for an expense
 */
export async function setExpenseRecurrence(
  page: Page,
  recurrence: 'Daily' | 'Weekly' | 'Monthly',
): Promise<void> {
  // Find the recurrence combobox
  await expandMoreOptions(page)
  const recurrenceCombobox = page
    .getByRole('combobox')
    .filter({ hasText: /None|Daily|Weekly|Monthly/ })
    .last()

  await recurrenceCombobox.waitFor({ state: 'visible' })
  await recurrenceCombobox.click()

  // Select the recurrence option
  const recurrenceOption = page.getByRole('option', { name: recurrence })
  await recurrenceOption.waitFor({ state: 'visible' })
  await recurrenceOption.click()
}

/**
 * Opens the "More options" section if it is closed.
 *
 * The form leads with the amount and keeps category, notes, recurrence and the conversion fields
 * behind a collapsible, which starts closed on create *and* on edit. Radix unmounts collapsed
 * content, so those fields are not merely hidden — they are absent, and anything reading one has to
 * open the section first. The date is no longer among them; it sits beside Paid by.
 */
export async function expandMoreOptions(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: /more options/i }).first()
  // `waitFor`, not `count()`: count does not auto-wait, so on a form that has not rendered yet it
  // returns 0 and this would silently do nothing — leaving the caller to time out on a field it
  // was supposed to reveal.
  try {
    await trigger.waitFor({ state: 'visible', timeout: 15000 })
  } catch {
    return // no collapsible on this form
  }
  // The notes field is the probe for "already open", and it is named rather than found by tag.
  // This was `locator('textarea').first()` and broke the same way the date check before it broke:
  // the title became a textarea so it could wrap, so the first textarea on the page was always
  // visible, the probe was always true, and every caller timed out on a field this never revealed.
  // A probe has to name the thing it is probing for.
  const probe = page.locator('textarea[name="notes"]')
  if (await probe.isVisible()) return
  await trigger.click()
  await probe.waitFor({ state: 'visible' })
}

/**
 * Fills the expense form with the provided options
 */
export async function fillExpenseForm(
  page: Page,
  options: CreateExpenseOptions,
): Promise<void> {
  // Wait for form to be visible
  const expenseTitle = page.locator('[name="title"]')
  await expenseTitle.waitFor({ state: 'visible' })

  // Fill title
  await expenseTitle.fill(options.title)

  // Fill amount
  const amountInput = page.locator(AMOUNT_INPUT)
  await amountInput.fill(options.amount)

  // Select payer
  const paidBySelect = page.getByTestId('paid-by-select-0')
  await paidBySelect.waitFor({ state: 'visible' })
  await paidBySelect.click()

  const payerOption = page.getByRole('option', { name: options.payer })
  await payerOption.waitFor({ state: 'visible', timeout: 5000 })
  await payerOption.click()

  // Everything below except the date and the category lives behind "More options", which starts
  // closed.
  if (options.notes || options.recurrence) {
    await expandMoreOptions(page)
  }

  // Optional: Select category. It is the icon beside the title, not a combobox behind More
  // options — and it is an icon, so its accessible name is what identifies the selection.
  if (options.category) {
    await page.getByTestId('category-trigger').click()
    await page.getByRole('option', { name: options.category }).first().click()
  }

  // Optional: Set date
  if (options.date) {
    const dateInputs = page.locator('input[type="date"]')
    if ((await dateInputs.count()) > 0) {
      await dateInputs.first().fill(options.date)
    }
  }

  // Optional: Add notes
  if (options.notes) {
    const notes = page.locator('textarea[name="notes"]')
    if ((await notes.count()) > 0) {
      await notes.fill(options.notes)
    }
  }

  // Optional: Check reimbursement checkbox — also behind "More options".
  if (options.isReimbursement) {
    await expandMoreOptions(page)
    const reimbursementLabel = page.getByText(/this is a reimbursement/i)
    await reimbursementLabel.click()
  }

  // Optional: Set recurrence
  if (options.recurrence) {
    await setExpenseRecurrence(page, options.recurrence)
  }
}

/**
 * Submits the expense form and verifies it was created
 */
export async function submitExpenseAndVerify(
  page: Page,
  expenseTitle: string,
): Promise<void> {
  // Use more specific selector for the Create button
  const createButton = page.getByRole('button', { name: 'Create' })
  await createButton.click()

  // Wait for navigation to expenses list (more specific pattern)
  await page.waitForURL(/\/groups\/[^/]+\/expenses$/)

  // Verify expense appears in the list using data-testid
  const expenseTitleElement = page
    .getByTestId('expense-title')
    .filter({ hasText: expenseTitle })
  await expect(expenseTitleElement).toBeVisible()
}

/**
 * Deletes an expense by clicking on it and confirming deletion
 */
export async function deleteExpense(
  page: Page,
  expenseTitle: string,
): Promise<void> {
  // Click expense to edit (use data-testid)
  const expenseTitleElement = page
    .getByTestId('expense-title')
    .filter({ hasText: expenseTitle })
  await expenseTitleElement.click()
  await page.waitForURL(/\/groups\/[^/]+\/expenses\/[^/]+\/edit/)

  // Click delete button
  const deleteButton = page.getByRole('button', { name: /delete/i })
  await deleteButton.click()

  // Confirm deletion
  const confirmButton = page.getByRole('button', { name: /yes/i })
  await confirmButton.click()

  // Wait for navigation back to expenses list
  await page.waitForURL(/\/groups\/[^/]+\/expenses$/)

  // Verify expense is deleted (check that title element no longer exists)
  const deletedExpense = page
    .getByTestId('expense-title')
    .filter({ hasText: expenseTitle })
  await expect(deletedExpense).not.toBeVisible()
}

/**
 * Opens an expense for editing
 */
export async function openExpenseForEdit(
  page: Page,
  expenseTitle: string,
): Promise<void> {
  // Click expense using data-testid
  const expenseTitleElement = page
    .getByTestId('expense-title')
    .filter({ hasText: expenseTitle })
  await expenseTitleElement.click()
  await page.waitForURL(/\/groups\/[^/]+\/expenses\/[^/]+\/edit/)
  await expect(page.locator('[name="title"]')).toHaveValue(expenseTitle)
}

/**
 * Updates an expense's fields and saves
 */
export async function updateExpense(
  page: Page,
  updates: Partial<CreateExpenseOptions>,
): Promise<void> {
  // Update title if provided
  if (updates.title) {
    const titleInput = page.locator('[name="title"]')
    await titleInput.clear()
    await titleInput.fill(updates.title)
  }

  // Update amount if provided
  if (updates.amount) {
    const amountInput = page.locator(AMOUNT_INPUT)
    await amountInput.clear()
    await amountInput.fill(updates.amount)
  }

  if (updates.date || updates.notes !== undefined) {
    await expandMoreOptions(page)
  }

  // Update date if provided
  if (updates.date) {
    await page.locator('input[type="date"]').fill(updates.date)
  }

  // Update notes if provided
  if (updates.notes !== undefined) {
    const notesTextarea = page.locator('textarea[name="notes"]')
    await notesTextarea.clear()
    await notesTextarea.fill(updates.notes)
  }

  // Save
  const saveButton = page.getByRole('button', { name: /save/i })
  await saveButton.click()
  await page.waitForURL(/\/groups\/[^/]+\/expenses$/)
}

/**
 * Verifies expense values in edit form
 */
export async function verifyExpenseValues(
  page: Page,
  expected: {
    title?: string
    amount?: string
    date?: string
    notes?: string
    payer?: string
  },
): Promise<void> {
  if (expected.title) {
    await expect(page.locator('[name="title"]')).toHaveValue(expected.title)
  }
  if (expected.amount) {
    await expect(page.locator(AMOUNT_INPUT)).toHaveValue(expected.amount)
  }
  if (expected.date) {
    await expect(page.locator('input[type="date"]')).toHaveValue(expected.date)
  }
  if (expected.notes) {
    await expandMoreOptions(page)
    await expect(page.locator('textarea[name="notes"]')).toHaveValue(
      expected.notes,
    )
  }
  if (expected.payer) {
    // The payer combobox shows the participant name when selected
    await expect(
      page.getByRole('combobox').filter({ hasText: expected.payer }),
    ).toBeVisible()
  }
}

/**
 * Verifies that an expense has a specific recurrence setting in the edit form
 */
export async function verifyExpenseRecurrence(
  page: Page,
  expectedRecurrence: 'None' | 'Daily' | 'Weekly' | 'Monthly',
): Promise<void> {
  await expandMoreOptions(page)
  const recurrenceCombobox = page
    .getByRole('combobox')
    .filter({ hasText: expectedRecurrence })
  await expect(recurrenceCombobox).toBeVisible()
}
