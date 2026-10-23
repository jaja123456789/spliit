import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { navigateToTab } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'

/**
 * "Was this the whole bill?" is asked on the expense itself: a comment shows under it, counts on
 * its row, and appears in Activity.
 */
test('comments on an expense: written, counted, logged, removed', async ({
  page,
}) => {
  await page.goto('/groups')
  const groupId = await createGroupViaAPI(
    page,
    `Comments ${randomId(4)}`,
    ['Alice', 'Bob'],
    'USD',
    { suppressActiveUserModal: false, addGroupToRecent: true },
  )
  const expenseId = await createExpenseViaAPI(page, groupId, {
    title: 'Dinner',
    amount: 4000,
    payerName: 'Alice',
  })

  // Commenting as Bob.
  await page.goto(`/groups/${groupId}/expenses`)
  await page.getByRole('radio', { name: 'Bob' }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()

  await page.getByTestId(`expense-item-${expenseId}`).click()
  await page.waitForURL(/\/edit$/)
  const thread = page.getByTestId('expense-comments')
  await expect(thread).toContainText('No comments yet.')
  await thread
    .getByRole('textbox', { name: 'Add a comment…' })
    .fill('Was this the whole bill?')
  await thread.getByRole('button', { name: 'Send' }).click()

  const comment = thread.getByTestId('expense-comment')
  await expect(comment).toHaveCount(1)
  await expect(comment).toContainText('Bob')
  await expect(comment).toContainText('Was this the whole bill?')
  await expect(thread.getByRole('textbox')).toHaveValue('')

  // Counted on the row, and said in Activity.
  await page.goto(`/groups/${groupId}/expenses`)
  await expect(
    page
      .getByTestId(`expense-item-${expenseId}`)
      .getByTestId('expense-comment-count'),
  ).toHaveText('1')
  await navigateToTab(page, 'Activity')
  const logged = page
    .locator('[data-testid^="activity-item-"]')
    .filter({ hasText: 'commented on' })
  await expect(logged).toContainText('Bob commented on “Dinner”.')
  await expect(logged).toContainText('Was this the whole bill?')

  // Your own comment can be taken back.
  await page.goto(`/groups/${groupId}/expenses/${expenseId}/edit`)
  await thread.getByRole('button', { name: 'Delete' }).click()
  await expect(thread.getByTestId('expense-comment')).toHaveCount(0)
  await expect(thread).toContainText('No comments yet.')
})
