import { defineConfig, devices } from '@playwright/test'

function isCodeAgent(): boolean {
  return !!process.env.CLAUDE_CODE || !!process.env.OPENCODE
}

// The specs import from `src/`, which reaches ESM-only packages (nanoid, superjson) through
// Playwright's CommonJS transpilation. Node supports that unflagged from 22.12 — CI runs 24 — but
// on anything older every spec dies at module load with "require() of ES Module ... not supported",
// which reads like a broken suite rather than a stale runtime. Fail with the reason instead.
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 12)) {
  const flag = '--experimental-require-module'
  if (!(process.env.NODE_OPTIONS ?? '').includes(flag)) {
    throw new Error(
      `Node ${process.versions.node} cannot require() ES modules, so every spec will fail to ` +
        `load. Either use Node >= 22.12 (CI uses 24), or run with NODE_OPTIONS=${flag}.`,
    )
  }
}
/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? 'dot' : isCodeAgent() ? 'json' : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // /* Test against mobile viewports. */
    // {
    //   name: 'mobile-chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'mobile-safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    env: {
      // The tests navigate to root-relative paths like `/groups`, so the app has to be served at
      // the root. Without this it inherits NEXT_PUBLIC_BASE_PATH from .env (or the placeholder
      // default), every request 404s, and Playwright times out waiting for the server to come up.
      NEXT_PUBLIC_BASE_PATH: '',
      // No real mail from a test run. `createTransport()` in src/lib/email.ts picks SMTP whenever
      // SMTP_HOST is set, and a .env with working credentials made the magic-link specs post
      // sign-in mails to addresses like `test-a1b2@example.com` — which bounce back to whoever
      // owns the sending account. Emptying it selects the LocalFileTransport that writes to
      // `.mail/`, which is the transport `tests/helpers/auth.ts` reads from, so the auth specs
      // need this to pass rather than merely tolerating it.
      SMTP_HOST: '',
    },
    reuseExistingServer: !process.env.CI,
  },
})
