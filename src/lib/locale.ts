'use server'

import { Locale, Locales, defaultLocale, locales } from '@/i18n/request'
import { match } from '@formatjs/intl-localematcher'
import Negotiator from 'negotiator'
import { cookies, headers } from 'next/headers'

const COOKIE_NAME = 'NEXT_LOCALE'

function normalizeLocale(value: string | undefined): Locale | undefined {
  if (!value) {
    return undefined
  }

  if (locales.includes(value as Locale)) {
    return value as Locale
  }

  try {
    return match([value], locales, defaultLocale) as Locale
  } catch (e) {
    return undefined
  }
}

function getAcceptLanguageLocale(requestHeaders: Headers, locales: Locales) {
  let locale: Locale
  const languages = new Negotiator({
    headers: {
      'accept-language': requestHeaders.get('accept-language') || undefined,
    },
  }).languages()
  try {
    locale = match(languages, locales, defaultLocale) as Locale
  } catch (e) {
    // invalid language - fallback to default
    locale = defaultLocale
  }
  return locale
}

export async function getUserLocale() {
  let locale: Locale | undefined

  // Prio 1: use existing cookie
  locale = normalizeLocale((await cookies()).get(COOKIE_NAME)?.value)

  // Prio 2: use `accept-language` header
  // Prio 3: use default locale
  if (!locale) {
    locale = normalizeLocale(getAcceptLanguageLocale(await headers(), locales))
  }

  return locale || defaultLocale
}

export async function setUserLocale(locale: Locale) {
  ;(await cookies()).set(COOKIE_NAME, locale)
}
