const originalEnv = process.env

const baseEnv = {
  POSTGRES_PRISMA_URL: 'postgresql://postgres:password@localhost:5432/spliit',
  POSTGRES_URL_NON_POOLING:
    'postgresql://postgres:password@localhost:5432/spliit',
}

async function loadEnv(overrides: NodeJS.ProcessEnv = {}) {
  jest.resetModules()

  const nextEnv = { ...baseEnv, ...overrides }
  Object.keys(nextEnv).forEach((key) => {
    if (nextEnv[key] === undefined) delete nextEnv[key]
  })
  process.env = nextEnv

  return import('./env')
}

describe('env', () => {
  afterEach(() => {
    process.env = originalEnv
  })

  it('defaults to the Gemini Flash-Lite receipt model', async () => {
    const { env } = await loadEnv()

    expect(env.GEMINI_RECEIPT_MODEL).toBe('gemini-3.1-flash-lite')
  })

  it('requires Gemini and OpenRouter for receipt extraction', async () => {
    await expect(
      loadEnv({
        NEXT_PUBLIC_ENABLE_RECEIPT_EXTRACT: 'true',
        GEMINI_API_KEY: 'gemini-key',
      }),
    ).rejects.toThrow('GEMINI_API_KEY and OPENROUTER_API_KEY')

    await expect(
      loadEnv({
        NEXT_PUBLIC_ENABLE_RECEIPT_EXTRACT: 'true',
        OPENROUTER_API_KEY: 'openrouter-key',
      }),
    ).rejects.toThrow('GEMINI_API_KEY and OPENROUTER_API_KEY')
  })

  it('keeps category extraction OpenRouter-only', async () => {
    const { env } = await loadEnv({
      NEXT_PUBLIC_ENABLE_CATEGORY_EXTRACT: 'true',
      OPENROUTER_API_KEY: 'openrouter-key',
    })

    expect(env.OPENROUTER_API_KEY).toBe('openrouter-key')
  })

  it('rejects unsupported Gemini receipt models', async () => {
    await expect(
      loadEnv({
        GEMINI_RECEIPT_MODEL: 'gemini-3.5-flash',
      }),
    ).rejects.toThrow()
  })
})
