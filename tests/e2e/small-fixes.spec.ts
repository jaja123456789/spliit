import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { navigateToGroup, navigateToTab, setActiveUser } from '../helpers'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'

test.describe('Smaller fixes', () => {
  test('a stale locale cookie falls back instead of failing every page', async ({
    page,
    context,
  }) => {
    // A value no build has — what a removed locale leaves behind in a visitor's browser.
    await context.addCookies([
      { name: 'NEXT_LOCALE', value: 'xx-YY', url: 'http://localhost:3000' },
    ])
    const response = await page.goto('/groups')
    expect(response?.status()).toBe(200)
    // Exact: an empty list also offers "Create one", which a substring match finds as well.
    await expect(
      page.getByRole('link', { name: 'Create', exact: true }),
    ).toBeVisible()
  })

  test('a payment you made says "You", and an old one says its year', async ({
    page,
  }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Pay ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await createExpenseViaAPI(page, groupId, {
      title: 'Alice to Bob',
      amount: 1500,
      payerName: 'Alice',
      isReimbursement: true,
      excludeParticipants: ['Alice'],
      expenseDate: new Date(Date.UTC(new Date().getUTCFullYear() - 1, 11, 1)),
    })
    await navigateToGroup(page, groupId)
    await setActiveUser(page, 'Alice')
    await navigateToTab(page, 'Balances')

    const row = page.locator('[data-testid^="payment-row-"]').first()
    await expect(row).toContainText('You → Bob')
    await expect(row).toContainText(String(new Date().getUTCFullYear() - 1))
  })

  test('a group card shows the name the group has now', async ({ page }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Current ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    // This device last saw the group under another name; someone has renamed it since.
    await page.evaluate((id) => {
      const groups = JSON.parse(localStorage.getItem('recentGroups') ?? '[]')
      localStorage.setItem(
        'recentGroups',
        JSON.stringify(
          groups.map((group: { id: string; name: string }) =>
            group.id === id ? { ...group, name: 'What it used to be' } : group,
          ),
        ),
      )
    }, groupId)

    await page.goto('/groups')
    const card = page.locator(`a[href="/groups/${groupId}"]`).first()
    await expect(card).toContainText('Current')
    await expect(card).not.toContainText('What it used to be')
  })

  test('a recurring expense that catches up says so in Activity', async ({
    page,
  }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Rec ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    const tenDaysAgo = new Date()
    tenDaysAgo.setUTCHours(0, 0, 0, 0)
    tenDaysAgo.setUTCDate(tenDaysAgo.getUTCDate() - 10)
    await createExpenseViaAPI(page, groupId, {
      title: 'Daily coffee',
      amount: 300,
      payerName: 'Alice',
      recurrenceRule: 'DAILY',
      expenseDate: tenDaysAgo,
    })

    // Reading the list is what materialises the occurrences that have come due.
    await navigateToGroup(page, groupId)
    await expect(page.getByTestId('expense-title')).toHaveCount(11)
    await navigateToTab(page, 'Activity')
    await expect(
      page.getByText(
        /10 occurrences of recurring expense .Daily coffee. added automatically/,
      ),
    ).toBeVisible()
  })
})
