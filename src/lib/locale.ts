'use server'

import { Locale, Locales, defaultLocale, locales } from '@/i18n/request'
import { match } from '@formatjs/intl-localematcher'
import Negotiator from 'negotiator'
import { cookies, headers } from 'next/headers'

const COOKIE_NAME = 'NEXT_LOCALE'

function getAcceptLanguageLocale(requestHeaders: Headers, locales: Locales) {
  let locale
  const languages = new Negotiator({
    headers: {
      'accept-language': requestHeaders.get('accept-language') || undefined,
    },
  }).languages()
  try {
    locale = match(languages, locales, defaultLocale)
  } catch (e) {
    // invalid language - fallback to default
    locale = defaultLocale
  }
  return locale
}

export async function getUserLocale() {
  // Prio 1: use existing cookie — if it still names a locale this build has. The value picks a
  // messages file to import, so a stale one (a locale since removed) or a mangled one made every
  // page a 500 until the cookie was cleared.
  const cookieLocale = (await cookies()).get(COOKIE_NAME)?.value
  if (cookieLocale && (locales as string[]).includes(cookieLocale)) {
    return cookieLocale as Locale
  }

  // Prio 2: use `accept-language` header
  // Prio 3: use default locale
  return getAcceptLanguageLocale(await headers(), locales)
}

export async function setUserLocale(locale: Locale) {
  ;(await cookies()).set(COOKIE_NAME, locale)
}
