const mockGetCategories = jest.fn()
const mockOpenRouterCreate = jest.fn()

jest.mock('@/lib/api', () => ({
  getCategories: mockGetCategories,
}))

jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'mock-id'),
}))

jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockOpenRouterCreate,
      },
    },
  })),
)

const originalEnv = process.env
const originalFetch = global.fetch

const baseEnv = {
  POSTGRES_PRISMA_URL: 'postgresql://postgres:password@localhost:5432/spliit',
  POSTGRES_URL_NON_POOLING:
    'postgresql://postgres:password@localhost:5432/spliit',
  NEXT_PUBLIC_ENABLE_RECEIPT_EXTRACT: 'true',
  GEMINI_API_KEY: 'gemini-key',
  OPENROUTER_API_KEY: 'openrouter-key',
}

function createFetchResponse(status: number, body: unknown) {
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body)

  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(bodyText),
  } as unknown as Response
}

function createGeminiResponse(receipt: unknown) {
  return {
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify(receipt) }],
        },
      },
    ],
  }
}

async function loadAction(overrides: NodeJS.ProcessEnv = {}) {
  jest.resetModules()
  process.env = { ...baseEnv, ...overrides }

  return import('./create-from-receipt-button-actions')
}

describe('extractExpenseInformationFromImage', () => {
  let fetchMock: jest.Mock
  let consoleErrorSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance

  beforeEach(() => {
    mockGetCategories.mockReset()
    mockGetCategories.mockResolvedValue([
      { id: 0, grouping: 'General', name: 'General' },
      { id: 12, grouping: 'Food', name: 'Restaurants' },
    ])
    mockOpenRouterCreate.mockReset()

    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  it('uses Gemini first and returns normalized receipt data', async () => {
    fetchMock.mockResolvedValueOnce(
      createFetchResponse(
        200,
        createGeminiResponse({
          amount: 12.34,
          date: '2026-06-25',
          title: 'Coffee Shop',
          categoryId: 12,
          currency: 'USD',
          items: [
            {
              name: 'Coffee',
              quantity: 2,
              unitPrice: 2,
              price: 4,
            },
          ],
        }),
      ),
    )

    const { extractExpenseInformationFromImage } = await loadAction()
    const result = await extractExpenseInformationFromImage([
      { base64: 'abc123', mimeType: 'image/jpeg' },
    ])

    expect(result).toEqual({
      amount: 12.34,
      date: '2026-06-25',
      title: 'Coffee Shop',
      categoryId: 12,
      currency: 'USD',
      items: [
        { name: 'Coffee', price: 2 },
        { name: 'Coffee', price: 2 },
      ],
    })
    expect(mockOpenRouterCreate).not.toHaveBeenCalled()

    const [url, request] = fetchMock.mock.calls[0]
    expect(url).toContain('/gemini-3.1-flash-lite:generateContent')
    const body = JSON.parse((request as RequestInit).body as string)
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.contents[0].parts[1].inline_data).toEqual({
      mime_type: 'image/jpeg',
      data: 'abc123',
    })
  })

  it('falls back to OpenRouter when Gemini returns 429', async () => {
    fetchMock.mockResolvedValueOnce(
      createFetchResponse(429, { error: { message: 'quota exceeded' } }),
    )
    mockOpenRouterCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              amount: 20,
              title: 'Fallback Market',
              categoryId: 12,
              currency: 'EUR',
              items: [{ name: 'Bread', price: 3 }],
            }),
          },
        },
      ],
    })

    const { extractExpenseInformationFromImage } = await loadAction()
    const result = await extractExpenseInformationFromImage([
      { base64: 'abc123', mimeType: 'image/jpeg' },
    ])

    expect(result.title).toBe('Fallback Market')
    expect(result.items).toEqual([{ name: 'Bread', price: 3 }])
    expect(mockOpenRouterCreate).toHaveBeenCalledTimes(1)
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Gemini receipt extraction hit a rate limit; falling back to OpenRouter.',
    )
  })

  it('does not fall back to OpenRouter for non-429 Gemini errors', async () => {
    fetchMock.mockResolvedValueOnce(
      createFetchResponse(500, { error: { message: 'server error' } }),
    )

    const { extractExpenseInformationFromImage } = await loadAction()

    await expect(
      extractExpenseInformationFromImage([
        { base64: 'abc123', mimeType: 'image/jpeg' },
      ]),
    ).rejects.toThrow('Failed to extract information from receipt')
    expect(mockOpenRouterCreate).not.toHaveBeenCalled()
  })

  it('normalizes null receipt amounts to undefined', async () => {
    fetchMock.mockResolvedValueOnce(
      createFetchResponse(
        200,
        createGeminiResponse({
          amount: null,
          title: 'Partial Receipt',
          items: [{ name: 'Visible Item', price: 5 }],
        }),
      ),
    )

    const { extractExpenseInformationFromImage } = await loadAction()
    const result = await extractExpenseInformationFromImage([
      { base64: 'abc123', mimeType: 'image/jpeg' },
    ])

    expect(result.amount).toBeUndefined()
    expect(result.title).toBe('Partial Receipt')
  })
})
