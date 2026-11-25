import { expect, test } from '@playwright/test'

/**
 * Icons, the logo and the manifest keep their names from one deployment to the next. The service
 * worker used to serve its first copy of them for good, so a regenerated icon never reached a phone
 * that had the old one; it now serves the saved copy and fetches a fresh one for next time.
 */
test('a renamed-in-place file is refreshed behind the saved copy', async ({
  page,
  context,
}) => {
  await page.goto('/groups')
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true)

  const url = '/logo/48x48.png'
  let version = 'old'
  await context.route(`**${url}`, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: version }),
  )
  const read = () => page.evaluate(async (u) => (await fetch(u)).text(), url)

  expect(await read()).toBe('old') // fetched and saved
  version = 'new'
  // The saved copy first, while the new one is fetched behind it…
  expect(await read()).toBe('old')
  // …and the new one from then on.
  await expect.poll(read).toBe('new')
})
