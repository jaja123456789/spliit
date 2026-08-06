import dayjs from 'dayjs'

// `api.frankfurter.app` only redirects here now, and browsers reject the redirect because the
// 301 itself carries no CORS headers, so the request has to go to the current host directly.
const FRANKFURTER_API_URL = 'https://api.frankfurter.dev/v1'

export interface FrankfurterAPIResponse {
  base: string
  date: string
  rates: Record<string, number>
}

/**
 * Frankfurter answers 404 for dates it has no rates for, which includes any date in the future,
 * so ask for the most recent ones instead.
 */
export function exchangeRateUrl(date: Date, baseCurrency: string) {
  const day = dayjs(date)
  const dateSegment = day.isAfter(dayjs(), 'day')
    ? 'latest'
    : day.format('YYYY-MM-DD')
  return `${FRANKFURTER_API_URL}/${dateSegment}?base=${baseCurrency}`
}

/**
 * Whether a rate is needed and can be looked up at all: two different, non-empty currency codes
 * and a usable date.
 */
export function isExchangeRateNeeded(
  date: Date,
  baseCurrency: string,
  targetCurrency: string,
) {
  return (
    !isNaN(date.getTime()) &&
    !!baseCurrency.length &&
    !!targetCurrency.length &&
    baseCurrency !== targetCurrency
  )
}

export class ExchangeRateError extends Error {}

/**
 * Looks up how much one unit of `baseCurrency` was worth in `targetCurrency` on `date`.
 *
 * Runs server-side, where the CORS restrictions that apply in the browser do not, so it can be
 * called straight from a route handler. Returns 1 when no conversion is needed.
 *
 * @throws {ExchangeRateError} when the rate cannot be established, rather than guessing — storing
 * an unconverted amount as though it were converted would silently corrupt a group's balances.
 */
export async function getExchangeRate(
  date: Date,
  baseCurrency: string,
  targetCurrency: string,
  { timeoutMs = 5000 }: { timeoutMs?: number } = {},
): Promise<number> {
  if (!isExchangeRateNeeded(date, baseCurrency, targetCurrency)) {
    if (baseCurrency === targetCurrency) return 1
    throw new ExchangeRateError(
      `Cannot convert between "${baseCurrency}" and "${targetCurrency}".`,
    )
  }

  let response: Response
  try {
    response = await fetch(exchangeRateUrl(date, baseCurrency), {
      signal: AbortSignal.timeout(timeoutMs),
      // Rates for a past date never change, and today's change at most once a day.
      next: { revalidate: 3600 },
    })
  } catch (error) {
    throw new ExchangeRateError(
      `Could not reach the exchange rate service: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  if (!response.ok) {
    throw new ExchangeRateError(
      `The exchange rate service has no rates for ${baseCurrency} on ${dayjs(
        date,
      ).format('YYYY-MM-DD')}.`,
    )
  }

  const data = (await response.json()) as FrankfurterAPIResponse
  const rate = data.rates?.[targetCurrency]
  if (!rate) {
    throw new ExchangeRateError(
      `The exchange rate service does not publish a ${baseCurrency}/${targetCurrency} rate. Pass an explicit conversion rate instead.`,
    )
  }
  return rate
}
