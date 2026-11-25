import { randomId } from '@/lib/utils'
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import { createGroupViaAPI } from '../helpers/batch-api'

/** Standing in for the share sheet: a multipart form post, as the OS makes it. */
async function shareToApp(page: Page, photo: Buffer) {
  await page.evaluate(() => {
    const form = document.createElement('form')
    form.id = 'share-form'
    form.method = 'POST'
    form.enctype = 'multipart/form-data'
    form.action = '/api/share-target'
    const input = document.createElement('input')
    input.type = 'file'
    input.name = 'file'
    input.id = 'share-file'
    form.appendChild(input)
    document.body.appendChild(form)
  })
  await page.setInputFiles('#share-file', {
    name: 'receipt.jpg',
    mimeType: 'image/jpeg',
    buffer: photo,
  })
  await page.evaluate(() =>
    (document.getElementById('share-form') as HTMLFormElement).submit(),
  )
  await page.waitForURL(/\/groups$/)
}

/**
 * Sharing an image to Spliit from the OS share sheet.
 *
 * The OS posts the file to `/api/share-target` as a form submission; the route hands it to the app
 * through `sessionStorage` and sends the browser to the group list. A full-size camera photo used
 * to overflow that store and fail, so the route now re-encodes it — and it accepts images only.
 */
test.describe('Share target', () => {
  test('a full-size photo reaches the group list', async ({ page }) => {
    await page.goto('/groups')
    await createGroupViaAPI(page, `Share ${randomId(4)}`, ['Alice', 'Bob'])

    // Noise does not compress: ~6 MB, the size of an ordinary phone photo.
    const photo = await sharp({
      create: {
        width: 4000,
        height: 3000,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
        noise: { type: 'gaussian', mean: 128, sigma: 40 },
      },
    })
      .jpeg({ quality: 95 })
      .toBuffer()
    expect(photo.length).toBeGreaterThan(4_000_000)

    await shareToApp(page, photo)

    await expect(page.getByText(/Receipt received/)).toBeVisible()
    const stored = await page.evaluate(() =>
      sessionStorage.getItem('pending-share-receipt'),
    )
    expect(stored?.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(stored!.length).toBeLessThan(2_500_000)
  })

  test('a group with nothing in it yet opens the scanner on the photo', async ({
    page,
  }) => {
    // The list header holds the scan button that picks a shared photo up, and an empty group does
    // not show that header. Unmounting it once the list came back empty closed the scanner, with
    // the photo already taken out of storage.
    await page.goto('/groups')
    const name = `Share empty ${randomId(4)}`
    await createGroupViaAPI(page, name, ['Alice', 'Bob'])
    const photo = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#808080' },
    })
      .jpeg()
      .toBuffer()

    await shareToApp(page, photo)
    await page.getByText(name).click()
    await page.waitForURL(/\/expenses\?fromShare=true$/)

    const scanner = page.getByRole('dialog', { name: 'Create from receipt' })
    await expect(scanner).toBeVisible()
    // Still open once the list has said the group is empty, and holding the photo.
    await expect(page.getByText('Nothing here yet')).toBeVisible()
    await expect(scanner).toBeVisible()
    await expect(scanner.getByTitle('Remove page 1')).toBeVisible()
  })

  test('anything but an image is turned away', async ({ request }) => {
    const response = await request.post('/api/share-target', {
      multipart: {
        file: {
          name: 'note.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('hello'),
        },
      },
    })
    expect(response.status()).toBe(415)
    expect(await response.text()).not.toContain('sessionStorage')
  })
})

/**
 * Another site can submit a form at the share target. The share sheet's own post is the browser's
 * (`Sec-Fetch-Site: none`); one from another site is refused before any image is handed on.
 */
test('a post from another site is refused', async ({ page }) => {
  const photo = await sharp({
    create: { width: 40, height: 30, channels: 3, background: '#808080' },
  })
    .jpeg()
    .toBuffer()
  for (const [site, status] of [
    ['cross-site', 403],
    ['same-site', 403],
    ['none', 200],
  ] as const) {
    const response = await page.request.post('/api/share-target', {
      headers: { 'Sec-Fetch-Site': site },
      multipart: {
        file: { name: 'r.jpg', mimeType: 'image/jpeg', buffer: photo },
      },
      maxRedirects: 0,
    })
    expect(response.status(), site).toBe(status)
  }
})
