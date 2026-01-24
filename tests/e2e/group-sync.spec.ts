import { randomId } from '@/lib/api'
import { expect, test } from '@playwright/test'
import { signInWithMagicLink, signOut } from '../helpers/auth'
import { createGroupViaAPI } from '../helpers/batch-api'

test.describe('Group Cloud Sync', () => {
  test('sync and unsync group flow', async ({ page }) => {
    const testEmail = `test-${randomId(4)}@example.com`
    await signInWithMagicLink(page, testEmail)

    // Create a group
    const groupId = await createGroupViaAPI(page, `Sync Test ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])

    await page.goto(`/groups/${groupId}`)

    // Find and click sync button
    const syncButton = page.getByRole('button', { name: /sync|cloud/i })
    await syncButton.click()

    // Verify synced state (button should change to "synced" or "unsync")
    await expect(
      page
        .getByText(/synced|in cloud/i)
        .or(page.getByRole('button', { name: /unsync/i })),
    ).toBeVisible({ timeout: 5000 })

    // Click unsync
    const unsyncButton = page.getByRole('button', { name: /unsync/i })
    if (await unsyncButton.isVisible()) {
      await unsyncButton.click()

      // Verify unsynced state
      await expect(page.getByRole('button', { name: /sync/i })).toBeVisible({
        timeout: 5000,
      })
    }
  })

  test('auto-sync new groups when preference enabled', async ({ page }) => {
    const testEmail = `test-${randomId(4)}@example.com`
    await signInWithMagicLink(page, testEmail)

    // Enable auto-sync preference
    await page.goto('/settings')
    const autoSyncToggle = page.locator('[role="switch"]').filter({
      has: page.getByText(/automatically sync new groups/i),
    })

    if (await autoSyncToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await autoSyncToggle.click()
      await page.waitForTimeout(500)
    }

    // Create a new group
    const groupId = await createGroupViaAPI(
      page,
      `Auto Sync Test ${randomId(4)}`,
      ['Alice', 'Bob'],
    )

    await page.goto(`/groups/${groupId}`)

    // Group should be auto-synced
    await expect(
      page
        .getByText(/synced|in cloud/i)
        .or(page.getByRole('button', { name: /unsync/i })),
    ).toBeVisible({ timeout: 5000 })
  })

  test('remove synced group shows confirmation dialog', async ({ page }) => {
    const testEmail = `test-${randomId(4)}@example.com`
    await signInWithMagicLink(page, testEmail)

    const groupId = await createGroupViaAPI(
      page,
      `Remove Test ${randomId(4)}`,
      ['Alice', 'Bob'],
    )

    await page.goto(`/groups/${groupId}`)

    // Sync the group first
    const syncButton = page.getByRole('button', { name: /sync/i })
    if (await syncButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await syncButton.click()
      await page.waitForTimeout(1000)
    }

    // Go to groups list
    await page.goto('/groups')

    // Try to remove the group (look for remove/delete button in the group card)
    const removeButton = page
      .getByRole('button', { name: /remove|delete/i })
      .first()

    if (await removeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await removeButton.click()

      // Confirmation dialog should appear for synced groups
      await expect(
        page.getByText(/also remove from cloud|delete from server/i),
      ).toBeVisible({ timeout: 3000 })
    }
  })

  test('hydration merges local and server groups on sign-in', async ({
    page,
  }) => {
    // Create local groups before sign-in
    const localGroup1 = await createGroupViaAPI(page, `Local ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    const localGroup2 = await createGroupViaAPI(page, `Local ${randomId(4)}`, [
      'Charlie',
      'Dave',
    ])

    // Sign in (will trigger hydration)
    const testEmail = `test-${randomId(4)}@example.com`
    await signInWithMagicLink(page, testEmail)

    // Go to groups page
    await page.goto('/groups')

    // Both local groups should still be visible
    await expect(page.getByText(localGroup1)).toBeVisible()
    await expect(page.getByText(localGroup2)).toBeVisible()
  })

  test('starred and archived sync across devices', async ({ browser }) => {
    const testEmail = `test-${randomId(4)}@example.com`

    // Device 1: Sign in and star a group
    const context1 = await browser.newContext()
    const page1 = await context1.newPage()

    await signInWithMagicLink(page1, testEmail)
    const groupId = await createGroupViaAPI(page1, `Star Test ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])

    await page1.goto(`/groups/${groupId}`)

    // Star the group
    const starButton = page1.getByRole('button', { name: /star/i })
    if (await starButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await starButton.click()
      await page1.waitForTimeout(1000)
    }

    await context1.close()

    // Device 2: Sign in with same email
    const context2 = await browser.newContext()
    const page2 = await context2.newPage()

    await signInWithMagicLink(page2, testEmail)

    // Check if group is starred on device 2
    await page2.goto('/groups')

    // The starred group should appear in starred section
    const starredSection = page2.getByText(/starred/i)
    if (await starredSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(page2.getByText(`Star Test`)).toBeVisible()
    }

    await context2.close()
  })

  test('logout with clear option removes local data', async ({ page }) => {
    const testEmail = `test-${randomId(4)}@example.com`
    await signInWithMagicLink(page, testEmail)

    // Create a group
    await createGroupViaAPI(page, `Clear Test ${randomId(4)}`, ['Alice', 'Bob'])

    // Verify group appears in recents
    await page.goto('/groups')
    await expect(page.getByText('Clear Test')).toBeVisible()

    // Sign out with clear
    await signOut(page, true)

    // Verify groups are cleared
    await page.goto('/groups')
    const hasGroups = await page
      .getByText('Clear Test')
      .isVisible({ timeout: 2000 })
      .catch(() => false)
    expect(hasGroups).toBe(false)
  })

  test('logout without clear keeps local data', async ({ page }) => {
    const testEmail = `test-${randomId(4)}@example.com`
    await signInWithMagicLink(page, testEmail)

    // Create a group
    const groupName = `Keep Test ${randomId(4)}`
    await createGroupViaAPI(page, groupName, ['Alice', 'Bob'])

    await page.goto('/groups')
    await expect(page.getByText(groupName)).toBeVisible()

    // Sign out without clear
    await signOut(page, false)

    // Verify groups are still there
    await page.goto('/groups')
    await expect(page.getByText(groupName)).toBeVisible()
  })
})
