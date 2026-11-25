import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import { navigateToExpenseCreate } from '../helpers'
import { createGroupViaAPI } from '../helpers/batch-api'
import { AMOUNT_INPUT } from '../helpers/expense'

/**
 * After a save, the form stays on screen until the list has loaded. A second tap on Create in that
 * moment — a slow phone, an impatient thumb — used to make the expense twice.
 */
test('pressing Create again while it redirects makes one expense', async ({
  page,
}) => {
  await page.goto('/groups')
  const groupId = await createGroupViaAPI(page, `Twice ${randomId(4)}`, [
    'Alice',
    'Bob',
  ])
  await page.goto(`/groups/${groupId}/expenses`)
  await navigateToExpenseCreate(page)
  await page.locator('[name="title"]').fill('Coffee')
  await page.locator(AMOUNT_INPUT).fill('4.50')

  // Hold the list back, as a slow connection would, so the form stays up after the save.
  await page.route(
    (url) => url.pathname.endsWith(`/groups/${groupId}/expenses`),
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500))
      await route.continue()
    },
  )
  let creates = 0
  page.on('request', (request) => {
    if (request.url().includes('groups.expenses.create')) creates++
  })
  const create = page.locator('button[type="submit"]').first()
  const firstSave = page.waitForResponse((r) =>
    r.url().includes('groups.expenses.create'),
  )
  await create.click()
  await firstSave
  await expect(create).toBeEnabled()
  await create.click()
  await expect.poll(() => creates).toBe(2)
  await page.waitForURL(/\/expenses$/)

  const count = await page.evaluate(async (id) => {
    const input = encodeURIComponent(
      JSON.stringify({ json: { groupId: id, limit: 10 } }),
    )
    const res = await fetch(`/api/trpc/groups.expenses.list?input=${input}`)
    return (await res.json()).result.data.json.expenses.length
  }, groupId)
  expect(count).toBe(1)
})
