import { Locale } from '@/i18n/request'
import currencyData from './currency-data.json'

// The display name is the only field that differs between locales, so the shared fields are
// stored once and the localised name is merged back in on read. Keeping all 23 locales inline
// would otherwise put 140 kB of mostly duplicated JSON in the client bundle.
const { currencies, names } = currencyData

export type Currency = {
  name: string
  symbol_native: string
  symbol: string
  code: string
  name_plural: string
  rounding: number
  decimal_digits: number
}

export const supportedCurrencyCodes = [
  'USD',
  'EUR',
  'JPY',
  'BGN',
  'CZK',
  'DKK',
  'GBP',
  'HUF',
  'PLN',
  'RON',
  'SEK',
  'CHF',
  'ISK',
  'NOK',
  'TRY',
  'AUD',
  'BRL',
  'CAD',
  'CNY',
  'HKD',
  'IDR',
  'ILS',
  'INR',
  'KRW',
  'MXN',
  'NZD',
  'PHP',
  'SGD',
  'THB',
  'ZAR',
] as const
export type supportedCurrencyCodeType = (typeof supportedCurrencyCodes)[number]

/**
 * Turns a currency code coming from outside the app (a scanned receipt, an import…) into one of
 * the codes the app supports, or `undefined` when it is unknown.
 */
export function normalizeCurrencyCode(code: string | null | undefined) {
  const normalized = code?.trim().toUpperCase()
  return normalized &&
    (supportedCurrencyCodes as readonly string[]).includes(normalized)
    ? normalized
    : undefined
}

function customCurrency(name: string): Currency {
  return {
    name,
    symbol_native: '',
    symbol: '',
    code: '',
    name_plural: name,
    rounding: 0,
    decimal_digits: 2,
  }
}

export function defaultCurrencyList(
  locale: Locale = 'en-US',
  customChoice: string | null = null,
) {
  const list = customChoice ? [customCurrency(customChoice)] : []
  return list.concat(
    supportedCurrencyCodes.map((code) => getCurrency(code, locale)),
  )
}

export function getCurrency(
  currencyCode: string | undefined | null,
  locale: Locale = 'en-US',
  customChoice = 'Custom',
): Currency {
  if (!currencyCode) return customCurrency(customChoice)
  const code = currencyCode as supportedCurrencyCodeType
  const currency = currencies[code]
  if (!currency) return customCurrency(customChoice)
  const localeNames = names[locale] ?? names['en-US']
  return { ...currency, name: localeNames[code] }
}
