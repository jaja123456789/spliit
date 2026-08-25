import { randomId } from '@/lib/utils'
import { Page, expect, test } from '@playwright/test'
import { createGroupViaAPI } from '../helpers/batch-api'
import { AMOUNT_INPUT } from '../helpers/expense'

/**
 * A half-typed expense survives leaving the form, and comes back without asking.
 *
 * There used to be a banner — "you have an unsaved expense, restore or discard?" — which made you
 * read and decide, every time, about something you almost always want. Now the form simply returns
 * as you left it and says so quietly, with a way out for the time you did not want it.
 *
 * Two things constrain that, and both are here: it must hold an expense rather than the residue of
 * one (typing a title and deleting it leaves the category the extractor guessed; typing an amount
 * and clearing it leaves `""` where a `0` was; dropping someone from the split and adding them back
 * rebuilds `paidFor`), and it must be recent — the accident this protects against is one you notice
 * at once, so past a couple of minutes a form that fills itself in is worse than an empty one.
 */

const RESTORED = /Restored from earlier/i

async function newGroup(page: Page) {
  await page.goto('/groups')
  return createGroupViaAPI(page, `draft ${randomId(4)}`, [
    'Alice',
    'Bob',
    'Charlie',
  ])
}

async function openCreateForm(page: Page, groupId: string) {
  await page.goto(`/groups/${groupId}/expenses/create`)
  await page.locator('input[name="title"]').waitFor({ state: 'visible' })
  // The draft is written from a form-watch subscription; give it a tick to settle before
  // navigating away, or the test measures the race rather than the rule.
  await page.waitForTimeout(700)
}

/** What the form actually holds, which is a stronger question than what banner it is showing. */
async function formState(page: Page) {
  return {
    title: await page.locator('input[name="title"]').inputValue(),
    amount: await page.locator(AMOUNT_INPUT).inputValue(),
    restored: (await page.getByText(RESTORED).count()) > 0,
  }
}

/** Put a draft of a given age straight into storage — the only way to hold the clock still. */
async function seedDraft(
  page: Page,
  groupId: string,
  ageMs: number,
  title: string,
) {
  await page.evaluate(
    ([key, age, expenseTitle]) => {
      localStorage.setItem(
        key as string,
        JSON.stringify({
          savedAt: Date.now() - (age as number),
          values: {
            title: expenseTitle,
            notes: '',
            category: 0,
            expenseDate: new Date().toISOString(),
            splitMode: 'EVENLY',
            isReimbursement: false,
            saveDefaultSplittingOptions: false,
            recurrenceRule: 'NONE',
            paidBy: [{ participant: 'seed', amount: 55 }],
            paidFor: [],
            items: [],
          },
        }),
      )
    },
    [`group-${groupId}-expenseDraft`, ageMs, title] as const,
  )
}

test.describe('A half-typed expense', () => {
  test('comes back on its own, with a way to start fresh', async ({ page }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)
    await page.locator('input[name="title"]').fill('Taxi to the airport')
    await page.locator(AMOUNT_INPUT).fill('30')
    await page.locator('input[name="title"]').blur()
    await page.waitForTimeout(800)

    // Leaving the way an accidental back does: to another page in the app.
    await page.goto(`/groups/${groupId}/expenses`)
    await openCreateForm(page, groupId)

    expect(await formState(page)).toMatchObject({
      title: 'Taxi to the airport',
      amount: '30',
      restored: true,
    })

    await page.getByTestId('draft-start-fresh').click()
    await expect(page.locator('input[name="title"]')).toHaveValue('')
    await expect(page.getByText(RESTORED)).toHaveCount(0)

    // And starting fresh means it does not come back on the next visit either.
    await openCreateForm(page, groupId)
    expect(await formState(page)).toMatchObject({ title: '', restored: false })
  })

  test('comes back on an amount alone — the figure is the expense', async ({
    page,
  }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)
    await page.locator(AMOUNT_INPUT).fill('12.75')
    await page.locator(AMOUNT_INPUT).blur()
    await page.waitForTimeout(800)

    await openCreateForm(page, groupId)
    expect(await formState(page)).toMatchObject({
      amount: '12.75',
      restored: true,
    })
  })

  test('is gone once the expense has actually been saved', async ({ page }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)
    await page.locator('input[name="title"]').fill('Bus fare')
    await page.locator(AMOUNT_INPUT).fill('3.10')
    await page.locator('input[name="title"]').blur()
    await page.waitForTimeout(800)

    await page
      .getByRole('button', { name: /^create$/i })
      .first()
      .click()
    await page.waitForURL((url) => !/\/create/.test(url.pathname))
    await page.waitForTimeout(800)

    await openCreateForm(page, groupId)
    expect(await formState(page)).toMatchObject({ title: '', restored: false })
  })

  test('is thrown away by Cancel, which is what Cancel means', async ({
    page,
  }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)
    await page.locator('input[name="title"]').fill('Never mind')
    await page.locator(AMOUNT_INPUT).fill('9')
    await page.locator('input[name="title"]').blur()
    await page.waitForTimeout(800)

    await page
      .getByRole('link', { name: /^cancel$/i })
      .first()
      .click()
    await page.waitForURL((url) => !/\/create/.test(url.pathname))
    await page.waitForTimeout(800)

    await openCreateForm(page, groupId)
    expect(await formState(page)).toMatchObject({ title: '', restored: false })
  })

  test('comes back when it is half a minute old', async ({ page }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)
    await seedDraft(page, groupId, 30_000, 'Recent dinner')

    await openCreateForm(page, groupId)
    expect(await formState(page)).toMatchObject({
      title: 'Recent dinner',
      restored: true,
    })
  })

  test('does not come back when it is older than two minutes', async ({
    page,
  }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)
    await seedDraft(page, groupId, 3 * 60_000, 'Forgotten dinner')

    await openCreateForm(page, groupId)
    expect(await formState(page)).toMatchObject({ title: '', restored: false })

    const left = await page.evaluate(
      (key) => localStorage.getItem(key),
      `group-${groupId}-expenseDraft`,
    )
    expect(left).toBeNull()
  })
})

test.describe('What is not an expense is not kept', () => {
  const undone: [string, (page: Page) => Promise<void>][] = [
    [
      'a title typed and deleted again',
      async (page) => {
        const title = page.locator('input[name="title"]')
        await title.fill('Coffee')
        await title.blur()
        await page.waitForTimeout(600)
        await title.fill('')
        await title.blur()
      },
    ],
    [
      'an amount typed and cleared again',
      async (page) => {
        const amount = page.locator(AMOUNT_INPUT)
        await amount.fill('12.50')
        await page.waitForTimeout(400)
        await amount.fill('')
      },
    ],
    [
      'someone dropped from the split and added back',
      async (page) => {
        const chip = page.getByTestId('evenly-chip-Bob')
        await chip.click()
        await page.waitForTimeout(400)
        await chip.click()
      },
    ],
  ]

  for (const [what, perform] of undone) {
    test(`${what} leaves nothing behind`, async ({ page }) => {
      const groupId = await newGroup(page)
      await openCreateForm(page, groupId)
      await perform(page)
      await page.waitForTimeout(700)

      await openCreateForm(page, groupId)
      expect(await formState(page)).toMatchObject({ title: '', restored: false })
    })
  }
})
