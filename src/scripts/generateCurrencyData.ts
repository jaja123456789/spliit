// @ts-nocheck
import { Locale, locales } from '@/i18n/request'
import {
  Currency,
  supportedCurrencyCodeType,
  supportedCurrencyCodes,
} from '@/lib/currency'
import CurrencyList from 'currency-list'

import fs from 'node:fs'

function getCurrencyInLocale(currencyCode: string, locale: Locale): Currency {
  try {
    return CurrencyList.get(currencyCode, locale.replaceAll('-', '_'))
  } catch {
    // For currency translations which are not found in the library (e.g. ua), use English.
    return CurrencyList.get(currencyCode, 'en_US')
  }
}

// `name` is the only field that varies by locale, so it is the only one stored per locale. Keeping
// a full copy of every currency for all 23 locales made the file (and the client bundle) 7x bigger.
const currencies = supportedCurrencyCodes.reduce(
  (acc, currencyCode) => {
    const { name, ...rest } = getCurrencyInLocale(currencyCode, 'en-US')
    return { ...acc, [currencyCode]: rest }
  },
  {} as { [K in supportedCurrencyCodeType]: Omit<Currency, 'name'> },
)

const names = locales.reduce(
  (acc, locale) => ({
    ...acc,
    [locale]: supportedCurrencyCodes.reduce(
      (localeNames, currencyCode) => ({
        ...localeNames,
        [currencyCode]: getCurrencyInLocale(currencyCode, locale).name,
      }),
      {},
    ),
  }),
  {} as { [K in Locale]: { [K in supportedCurrencyCodeType]: string } },
)

// Indented so the generated file is already in Prettier's style and passes `check-formatting`.
fs.writeFileSync(
  'src/lib/currency-data.json',
  JSON.stringify({ currencies, names }, null, 2) + '\n',
)
