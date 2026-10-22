import { randomId } from '@/lib/utils'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { createGroupViaAPI } from '../helpers/batch-api'

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

    // Standing in for the share sheet: a multipart form post, as the OS makes it.
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
    await expect(page.getByText(/Receipt received/)).toBeVisible()
    const stored = await page.evaluate(() =>
      sessionStorage.getItem('pending-share-receipt'),
    )
    expect(stored?.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(stored!.length).toBeLessThan(2_500_000)
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
