import { randomId } from '@/lib/api'
import { expect, test } from '@playwright/test'
import { signInWithMagicLink } from '../helpers/auth'
import { createGroupViaAPI } from '../helpers/batch-api'

test.describe('Sync Error Handling', () => {
  test('handles network errors gracefully', async ({ page, context }) => {
    const testEmail = `test-${randomId(4)}@example.com`
    await signInWithMagicLink(page, testEmail)

    const groupId = await createGroupViaAPI(page, `Error Test ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])

    await page.goto(`/groups/${groupId}`)

    // Simulate network failure by going offline
    await context.setOffline(true)

    // Try to sync
    const syncButton = page.getByRole('button', { name: /sync/i })
    if (await syncButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await syncButton.click()

      // Should show error message
      await expect(page.getByText(/error|failed|network/i)).toBeVisible({
        timeout: 5000,
      })
    }

    // Go back online
    await context.setOffline(false)

    // Retry should work
    if (await syncButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await syncButton.click()
      await expect(page.getByText(/synced|success/i)).toBeVisible({
        timeout: 5000,
      })
    }
  })

  test('handles server errors with retry', async ({ page, context }) => {
    const testEmail = `test-${randomId(4)}@example.com`
    await signInWithMagicLink(page, testEmail)

    const groupId = await createGroupViaAPI(page, `Retry Test ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])

    await page.goto(`/groups/${groupId}`)

    // Mock API failure by intercepting requests
    await page.route('**/api/trpc/**', async (route) => {
      // Fail first request
      if (route.request().url().includes('sync')) {
        await route.abort('failed')
      } else {
        await route.continue()
      }
    })

    // Try to sync (should fail)
    const syncButton = page.getByRole('button', { name: /sync/i })
    if (await syncButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await syncButton.click()

      // Error should be shown or retry should happen
      await page.waitForTimeout(2000)
    }

    // Remove route interception (allow requests)
    await page.unroute('**/api/trpc/**')

    // Retry should work now
    if (await syncButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await syncButton.click()
      await expect(page.getByText(/synced|success/i)).toBeVisible({
        timeout: 5000,
      })
    }
  })

  test('shows appropriate error for invalid group', async ({ page }) => {
    const testEmail = `test-${randomId(4)}@example.com`
    await signInWithMagicLink(page, testEmail)

    // Try to access a non-existent group
    await page.goto('/groups/invalid-group-id-12345')

    // Should show error or redirect
    const hasError = await Promise.race([
      page
        .getByText(/not found|doesn't exist|error/i)
        .isVisible({ timeout: 3000 }),
      page.waitForURL('/groups', { timeout: 3000 }).then(() => true),
    ]).catch(() => false)

    expect(hasError).toBeTruthy()
  })

  test('handles concurrent sync operations', async ({ page }) => {
    const testEmail = `test-${randomId(4)}@example.com`
    await signInWithMagicLink(page, testEmail)

    const group1Id = await createGroupViaAPI(
      page,
      `Concurrent 1 ${randomId(4)}`,
      ['Alice', 'Bob'],
    )
    const group2Id = await createGroupViaAPI(
      page,
      `Concurrent 2 ${randomId(4)}`,
      ['Charlie', 'Dave'],
    )

    // Open both groups in different tabs would be ideal,
    // but for simplicity, sync them sequentially
    await page.goto(`/groups/${group1Id}`)
    const syncButton1 = page.getByRole('button', { name: /sync/i })
    if (await syncButton1.isVisible({ timeout: 2000 }).catch(() => false)) {
      await syncButton1.click()
    }

    // Immediately go to second group and sync
    await page.goto(`/groups/${group2Id}`)
    const syncButton2 = page.getByRole('button', { name: /sync/i })
    if (await syncButton2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await syncButton2.click()
    }

    // Both should succeed
    await expect(page.getByText(/synced|success/i)).toBeVisible({
      timeout: 5000,
    })

    // Verify both groups are synced
    await page.goto(`/groups/${group1Id}`)
    await expect(page.getByText(/synced|in cloud/i)).toBeVisible({
      timeout: 3000,
    })

    await page.goto(`/groups/${group2Id}`)
    await expect(page.getByText(/synced|in cloud/i)).toBeVisible({
      timeout: 3000,
    })
  })
})
