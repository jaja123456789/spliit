import { randomId } from '@/lib/utils'
import { expect, test, type Page } from '@playwright/test'
import { createExpenseViaAPI, createGroupViaAPI } from '../helpers/batch-api'

async function readGroup(page: Page, groupId: string) {
  return page.evaluate(async (id) => {
    const input = encodeURIComponent(JSON.stringify({ json: { groupId: id } }))
    const res = await fetch(`/api/trpc/groups.get?input=${input}`)
    return (await res.json()).result.data.json.group as {
      participants: Array<{ id: string; name: string }>
    }
  }, groupId)
}

async function readBalances(page: Page, groupId: string) {
  return page.evaluate(async (id) => {
    const input = encodeURIComponent(JSON.stringify({ json: { groupId: id } }))
    const res = await fetch(`/api/trpc/groups.balances.list?input=${input}`)
    return (await res.json()).result.data.json.balances as Record<
      string,
      { total: number }
    >
  }, groupId)
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
}

/**
 * Group settings rewrite the participant list, and whoever the form leaves out is deleted along
 * with their part in every expense. Two ways that used to happen without anyone choosing it.
 */
test.describe('Group settings keep the people expenses depend on', () => {
  test('saving twice after adding someone keeps them, and their shares', async ({
    page,
  }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Twice ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await page.goto(`/groups/${groupId}/edit`)
    const inputs = page.getByRole('textbox', { name: /^Participant \d+$/ })
    await expect(inputs).toHaveCount(2)
    await page.getByRole('button', { name: 'Add participant' }).click()
    await inputs.nth(2).fill('Charlie')
    await save(page)
    await expect
      .poll(async () =>
        (await readGroup(page, groupId)).participants.map((p) => p.name),
      )
      .toContain('Charlie')
    const charlie = (await readGroup(page, groupId)).participants.find(
      (p) => p.name === 'Charlie',
    )!.id

    // Someone adds an expense that includes Charlie, while this page stays open.
    await createExpenseViaAPI(page, groupId, {
      title: 'Pizza for three',
      amount: 3000,
      payerName: 'Alice',
    })
    const before = await readBalances(page, groupId)
    expect(before[charlie]!.total).toBe(-1000)

    await page.locator('input[name="name"]').fill(`Renamed ${randomId(4)}`)
    await save(page)

    const after = await readGroup(page, groupId)
    expect(after.participants.find((p) => p.name === 'Charlie')!.id).toBe(
      charlie,
    )
    expect(await readBalances(page, groupId)).toEqual(before)
  })

  test('a form loaded before someone joined cannot remove them', async ({
    page,
  }) => {
    await page.goto('/groups')
    const groupId = await createGroupViaAPI(page, `Stale ${randomId(4)}`, [
      'Alice',
      'Bob',
    ])
    await page.goto(`/groups/${groupId}/edit`)
    await expect(
      page.getByRole('textbox', { name: /^Participant \d+$/ }),
    ).toHaveCount(2)

    // Elsewhere, Dana joins and is part of an expense.
    await page.evaluate(async (id) => {
      const input = encodeURIComponent(
        JSON.stringify({ json: { groupId: id } }),
      )
      const res = await fetch(`/api/trpc/groups.get?input=${input}`)
      const group = (await res.json()).result.data.json.group
      await fetch('/api/trpc/groups.update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          json: {
            groupId: id,
            groupFormValues: {
              name: group.name,
              currency: group.currency,
              currencyCode: group.currencyCode,
              simplifyDebts: true,
              participants: [
                ...group.participants.map((p: any) => ({
                  id: p.id,
                  name: p.name,
                })),
                { name: 'Dana' },
              ],
            },
          },
        }),
      })
    }, groupId)
    await createExpenseViaAPI(page, groupId, {
      title: 'Taxi',
      amount: 3000,
      payerName: 'Dana',
    })

    // This page still lists only Alice and Bob.
    await page.locator('input[name="name"]').fill(`Renamed ${randomId(4)}`)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(/can't be removed/).first()).toBeVisible()

    const group = await readGroup(page, groupId)
    expect(group.participants.map((p) => p.name).sort()).toEqual([
      'Alice',
      'Bob',
      'Dana',
    ])
    const balances = await readBalances(page, groupId)
    expect(Object.values(balances).reduce((s, b) => s + b.total, 0)).toBe(0)
  })
})
