import { randomId } from '@/lib/utils'
import { Page, expect, test } from '@playwright/test'
import { createGroupViaAPI } from '../helpers/batch-api'
import { AMOUNT_INPUT } from '../helpers/expense'

/**
 * A half-typed expense survives leaving the form, and is offered back on the way in.
 *
 * The form used to return already filled in and say so afterwards. It opens as a new expense now
 * and offers the draft instead: leaving deliberately is the common case and coming back to your own
 * half-typed expense is the rare one, so the rare one asks and the common one costs nothing. The
 * offer is also where discarding lives, now that Cancel is gone.
 *
 * Two things constrain what is kept, and both are here: it must hold an expense rather than the
 * residue of one (typing a title and deleting it leaves the category the extractor guessed; typing
 * an amount and clearing it leaves `""` where a `0` was; dropping someone from the split and adding
 * them back rebuilds `paidFor`), and it must be recent — the accident this protects against is one
 * you notice at once, so past a couple of minutes an offer to bring it back is noise.
 */

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
  await page.locator('[name="title"]').waitFor({ state: 'visible' })
  // The draft is written from a form-watch subscription; give it a tick to settle before
  // navigating away, or the test measures the race rather than the rule.
  await page.waitForTimeout(700)
}

/** What the form actually holds, and whether a draft is being offered for it. */
async function formState(page: Page) {
  return {
    title: await page.locator('[name="title"]').inputValue(),
    amount: await page.locator(AMOUNT_INPUT).inputValue(),
    offered: (await page.getByTestId('draft-offer').count()) > 0,
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
  test('is offered rather than applied, and restores on request', async ({
    page,
  }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)
    await page.locator('[name="title"]').fill('Taxi to the airport')
    await page.locator(AMOUNT_INPUT).fill('30')
    await page.locator('[name="title"]').blur()
    await page.waitForTimeout(800)

    // Leaving the way an accidental back does: to another page in the app.
    await page.goto(`/groups/${groupId}/expenses`)
    await openCreateForm(page, groupId)

    // The form is a new expense. The draft is on offer, not in the fields.
    expect(await formState(page)).toMatchObject({
      title: '',
      offered: true,
    })

    await page.getByTestId('draft-restore').click()
    expect(await formState(page)).toMatchObject({
      title: 'Taxi to the airport',
      amount: '30',
      offered: false,
    })
  })

  test('is discarded from the same offer, and does not come back', async ({
    page,
  }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)
    await page.locator('[name="title"]').fill('Never sent')
    await page.locator(AMOUNT_INPUT).fill('14')
    await page.locator('[name="title"]').blur()
    await page.waitForTimeout(800)

    await page.goto(`/groups/${groupId}/expenses`)
    await openCreateForm(page, groupId)
    await page.getByTestId('draft-discard').click()
    await expect(page.getByTestId('draft-offer')).toHaveCount(0)

    await openCreateForm(page, groupId)
    expect(await formState(page)).toMatchObject({ title: '', offered: false })
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
    expect(await formState(page)).toMatchObject({ offered: true })
    await page.getByTestId('draft-restore').click()
    expect(await formState(page)).toMatchObject({ amount: '12.75' })
  })

  test('is gone once the expense has actually been saved', async ({ page }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)
    await page.locator('[name="title"]').fill('Bus fare')
    await page.locator(AMOUNT_INPUT).fill('3.10')
    await page.locator('[name="title"]').blur()
    await page.waitForTimeout(800)

    await page
      .getByRole('button', { name: /^create$/i })
      .first()
      .click()
    await page.waitForURL((url) => !/\/create/.test(url.pathname))
    await page.waitForTimeout(800)

    await openCreateForm(page, groupId)
    expect(await formState(page)).toMatchObject({ title: '', offered: false })
  })

  // Cancel used to be the one exit that discarded, and this test asserted that. There is no
  // Cancel any more: every way out of the form is now the same way out, and it keeps what was
  // typed. Discarding moved to the offer on the way back in, covered above.
  test('survives leaving the form, however you leave it', async ({ page }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)
    await page.locator('[name="title"]').fill('Never mind')
    await page.locator(AMOUNT_INPUT).fill('9')
    await page.locator('[name="title"]').blur()
    await page.waitForTimeout(800)

    await page.goBack()
    await page.waitForURL((url) => !/\/create/.test(url.pathname))
    await page.waitForTimeout(800)

    await openCreateForm(page, groupId)
    expect(await formState(page)).toMatchObject({ title: '', offered: true })
    await page.getByTestId('draft-restore').click()
    await expect(page.locator('[name="title"]')).toHaveValue('Never mind')
  })

  test('offers no Cancel to discard through', async ({ page }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)
    await expect(page.getByRole('link', { name: /^cancel$/i })).toHaveCount(0)
  })

  test('comes back when it is half a minute old', async ({ page }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)
    await seedDraft(page, groupId, 30_000, 'Recent dinner')

    await openCreateForm(page, groupId)
    expect(await formState(page)).toMatchObject({ offered: true })
    await page.getByTestId('draft-restore').click()
    await expect(page.locator('[name="title"]')).toHaveValue('Recent dinner')
  })

  test('does not come back when it is older than two minutes', async ({
    page,
  }) => {
    const groupId = await newGroup(page)
    await openCreateForm(page, groupId)
    await seedDraft(page, groupId, 3 * 60_000, 'Forgotten dinner')

    await openCreateForm(page, groupId)
    expect(await formState(page)).toMatchObject({ title: '', offered: false })

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
        const title = page.locator('[name="title"]')
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
        const chip = page.getByTestId('split-row-Bob')
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
      expect(await formState(page)).toMatchObject({
        title: '',
        offered: false,
      })
    })
  }
})
