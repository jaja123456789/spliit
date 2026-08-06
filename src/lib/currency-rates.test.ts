import {
  ExchangeRateError,
  exchangeRateUrl,
  getExchangeRate,
  isExchangeRateNeeded,
} from './currency-rates'

// These lock in the URL and the guard that used to live inside `useCurrencyRate`, so the browser
// and the server keep asking for the same rate.
describe('exchangeRateUrl', () => {
  it('asks for the rates of the expense date', () => {
    expect(exchangeRateUrl(new Date('2026-03-04T12:00:00Z'), 'EUR')).toBe(
      'https://api.frankfurter.dev/v1/2026-03-04?base=EUR',
    )
  })

  it('asks for the latest rates when the date is in the future', () => {
    const nextYear = new Date()
    nextYear.setFullYear(nextYear.getFullYear() + 1)
    expect(exchangeRateUrl(nextYear, 'USD')).toBe(
      'https://api.frankfurter.dev/v1/latest?base=USD',
    )
  })

  it('uses today’s date rather than “latest” for today', () => {
    expect(exchangeRateUrl(new Date(), 'USD')).not.toContain('latest')
  })
})

describe('isExchangeRateNeeded', () => {
  const date = new Date('2026-03-04T12:00:00Z')

  it('is true for two different currencies', () => {
    expect(isExchangeRateNeeded(date, 'EUR', 'USD')).toBe(true)
  })

  it('is false when the currencies are the same', () => {
    expect(isExchangeRateNeeded(date, 'EUR', 'EUR')).toBe(false)
  })

  it('is false when either code is missing', () => {
    expect(isExchangeRateNeeded(date, '', 'USD')).toBe(false)
    expect(isExchangeRateNeeded(date, 'EUR', '')).toBe(false)
  })

  it('is false for an invalid date', () => {
    expect(isExchangeRateNeeded(new Date('nonsense'), 'EUR', 'USD')).toBe(false)
  })
})

describe('getExchangeRate', () => {
  const date = new Date('2026-03-04T12:00:00Z')
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  const mockFetch = (response: Partial<Response> & { json?: () => any }) => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
      ...response,
    })
    global.fetch = fetchMock as any
    return fetchMock
  }

  it('returns the rate for the target currency', async () => {
    mockFetch({ json: async () => ({ rates: { USD: 1.0854 } }) })
    await expect(getExchangeRate(date, 'EUR', 'USD')).resolves.toBe(1.0854)
  })

  it('returns 1 without a request when the currencies match', async () => {
    const fetchMock = mockFetch({})
    await expect(getExchangeRate(date, 'EUR', 'EUR')).resolves.toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when the service has no rates for the date', async () => {
    mockFetch({ ok: false })
    await expect(getExchangeRate(date, 'EUR', 'USD')).rejects.toBeInstanceOf(
      ExchangeRateError,
    )
  })

  it('throws when the currency pair is not published', async () => {
    // Frankfurter dropped BGN when Bulgaria joined the euro; the app still lists it.
    mockFetch({ json: async () => ({ rates: { USD: 1.0854 } }) })
    await expect(getExchangeRate(date, 'EUR', 'BGN')).rejects.toBeInstanceOf(
      ExchangeRateError,
    )
  })

  it('throws rather than guessing when the service is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any
    await expect(getExchangeRate(date, 'EUR', 'USD')).rejects.toBeInstanceOf(
      ExchangeRateError,
    )
  })
})
