import { useEnv } from '@/components/env-provider'
import { onActiveUserChange, readActiveUser } from '@/lib/active-user'
import { useEffect, useState, useSyncExternalStore } from 'react'
import useSWR, { Fetcher } from 'swr'
import {
  FrankfurterAPIResponse,
  exchangeRateUrl,
  isExchangeRateNeeded,
} from './currency-rates'

export function useMediaQuery(query: string): boolean {
  const getMatches = (query: string): boolean => {
    // Prevents SSR issues
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches
    }
    return false
  }

  const [matches, setMatches] = useState<boolean>(getMatches(query))

  function handleChange() {
    setMatches(getMatches(query))
  }

  useEffect(() => {
    const matchMedia = window.matchMedia(query)

    // Triggered at the first client-side load and if query changes
    handleChange()

    // Listen matchMedia
    if (matchMedia.addListener) {
      matchMedia.addListener(handleChange)
    } else {
      matchMedia.addEventListener('change', handleChange)
    }

    return () => {
      if (matchMedia.removeListener) {
        matchMedia.removeListener(handleChange)
      } else {
        matchMedia.removeEventListener('change', handleChange)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return matches
}

/**
 * `useMediaQuery` for a component the server renders too. It answers `false` while hydrating, as
 * the server did, and the real answer straight after — `useMediaQuery` reads the window during the
 * first render and so disagrees with the HTML it is hydrating on every desktop.
 */
export function useMediaQueryAfterHydration(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const matchMedia = window.matchMedia(query)
      matchMedia.addEventListener('change', onChange)
      return () => matchMedia.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export function useMobilePopoverState(
  open: boolean,
  setOpen: (open: boolean) => void,
  isDesktop: boolean,
) {
  useEffect(() => {
    if (open && !isDesktop) {
      window.history.pushState({ drawerOpen: true }, '')

      const onPopState = () => {
        setOpen(false)
      }

      window.addEventListener('popstate', onPopState)

      return () => {
        window.removeEventListener('popstate', onPopState)
        if (window.history.state?.drawerOpen) {
          window.history.back()
        }
      }
    }
  }, [open, isDesktop, setOpen])
}

export function useBaseUrl() {
  const [baseUrl, setBaseUrl] = useState<string | null>(null)
  const { NEXT_PUBLIC_BASE_PATH } = useEnv()

  useEffect(() => {
    setBaseUrl(window.location.origin + NEXT_PUBLIC_BASE_PATH)
  }, [])
  return baseUrl
}

/**
 * @returns The active participant's id, `null` when nobody is selected, and `undefined` until it has
 * been read — which cannot happen before the first effect, since local storage does not exist
 * during the server render.
 *
 * A query keyed on the answer should wait for it (`enabled: activeUser !== undefined`). Asking
 * first as "nobody" and again once the answer arrived made every visit to Stats or Expenses load
 * the group's whole history twice, the first time for a figure that was thrown away.
 */
export function useActiveUserState(groupId?: string) {
  const [activeUser, setActiveUser] = useState<string | null | undefined>(
    undefined,
  )

  useEffect(() => {
    if (!groupId) return
    setActiveUser(readActiveUser(groupId))
    return onActiveUserChange((changed) => {
      if (changed === groupId) setActiveUser(readActiveUser(groupId))
    })
  }, [groupId])

  return activeUser
}

/**
 * @returns The active participant's id, or `null` — which covers both "not read from local storage
 * yet" and "nobody is selected". For display; a query that depends on it wants
 * `useActiveUserState`. Callers no longer need to know the sentinel; see `@/lib/active-user`.
 */
export function useActiveUser(groupId?: string) {
  return useActiveUserState(groupId) ?? null
}

const fetcher: Fetcher<FrankfurterAPIResponse> = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok)
      throw new TypeError('Unsuccessful response from API', { cause: res })
    return res.json() as Promise<FrankfurterAPIResponse>
  })

export function useCurrencyRate(
  date: Date,
  baseCurrency: string,
  targetCurrency: string,
) {
  // Only send request if both currency codes are given and not the same. The URL is built by the
  // same helper the server uses, so both paths ask for the same rate.
  const url =
    isExchangeRateNeeded(date, baseCurrency, targetCurrency) &&
    exchangeRateUrl(date, baseCurrency)
  const { data, error, isLoading, mutate } = useSWR<FrankfurterAPIResponse>(
    url,
    fetcher,
    { shouldRetryOnError: false, revalidateOnFocus: false },
  )

  if (data) {
    let exchangeRate = undefined
    let sentError = error
    // Commented as when checking during weekends, the dates won't match
    // if (!error && data.date !== dateString) {
    //   // this happens if for example, the requested date is in the future.
    //   sentError = new RangeError(data.date)
    // }
    if (data.rates[targetCurrency]) {
      exchangeRate = data.rates[targetCurrency]
    }
    return {
      data: exchangeRate,
      error: sentError,
      isLoading,
      refresh: mutate,
    }
  }

  return {
    data,
    error,
    isLoading,
    refresh: mutate,
  }
}
