/**
 * Answers the receipt extractor's outbound calls from a fixture, so the scan flow can be tested
 * without an API key and without spending anyone's credits.
 *
 * Loaded into the *server* with `NODE_OPTIONS=--require ./tests/fixtures/receipt-extraction-stub.cjs`
 * (see `playwright.config.ts`), because the providers are called from the server action, not from
 * the browser — there is nothing for Playwright's request interception to catch.
 *
 * Three things here are load-bearing and were each found the hard way:
 *
 * - **Log to stderr, never stdout.** npm shells out to node and parses its stdout, so a `console.log`
 *   in a preload breaks `npm run` itself with a MODULE_NOT_FOUND for a path with the log line
 *   spliced into it.
 * - **Use a relative `--require` path.** An absolute Windows path inside `NODE_OPTIONS` gets
 *   rewritten by MSYS and the module is not found.
 * - **Block OpenRouter too.** It is the fallback provider, so a run that means to exercise the
 *   failure path would otherwise quietly succeed through it — and bill the account.
 *
 * `RECEIPT_STUB_MODE=error` makes both providers fail, which is how the failure screen is tested.
 */

/**
 * Deliberately awkward: quantities above 1, so line expansion has to run, and a total larger than
 * the lines add up to — the "usually tax and service" branch of the lines check, and the case that
 * caught the minor-units bug in the first place.
 */
const FIXTURE = {
  amount: 87.4,
  date: '2026-08-11',
  title: 'Cervejaria Ramiro',
  categoryId: 5,
  currency: 'EUR',
  items: [
    { name: 'Gambas ao alhinho', quantity: 1, price: 18.5 },
    { name: 'Presa de porco preto', quantity: 2, unitPrice: 16.0, price: 32.0 },
    { name: 'Vinho verde', quantity: 1, price: 14.0 },
    { name: 'Pao e manteiga', quantity: 3, unitPrice: 1.5, price: 4.5 },
    { name: 'Cafe', quantity: 2, unitPrice: 1.4, price: 2.8 },
  ],
}

const MODE = process.env.RECEIPT_STUB_MODE || 'ok'
const log = (message) =>
  process.stderr.write('[receipt-stub] ' + message + '\n')

const rateLimited = () =>
  new Response('{"error":{"code":429,"message":"stubbed"}}', {
    status: 429,
    headers: { 'content-type': 'application/json' },
  })

const realFetch = globalThis.fetch
if (typeof realFetch === 'function') {
  globalThis.fetch = function stubbedFetch(input, init) {
    let url = ''
    try {
      url = typeof input === 'string' ? input : (input && input.url) || ''
    } catch {
      url = ''
    }

    if (url.includes('generativelanguage.googleapis.com')) {
      log('intercepted Gemini, mode=' + MODE)
      if (MODE === 'error') return Promise.resolve(rateLimited())
      return Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: JSON.stringify(FIXTURE) }] } },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
    }

    if (url.includes('openrouter.ai')) {
      log('blocked the OpenRouter fallback')
      return Promise.resolve(rateLimited())
    }

    return realFetch.call(this, input, init)
  }
  log('installed, mode=' + MODE)
}

module.exports = { FIXTURE }
