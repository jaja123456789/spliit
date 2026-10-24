'use client'

import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

/**
 * A line of text the group's bar shows under the group's name — the screen's headline figure,
 * once the figure itself has scrolled away under the bar. The Expenses total used to leave the
 * screen with the first scroll, on the one page you scroll the most.
 */
const SummaryContext = createContext<{
  summary: string | null
  setSummary: (summary: string | null) => void
} | null>(null)

export function GroupBarSummaryProvider({ children }: PropsWithChildren) {
  const [summary, setSummary] = useState<string | null>(null)
  return (
    <SummaryContext.Provider value={{ summary, setSummary }}>
      {children}
    </SummaryContext.Provider>
  )
}

export const useGroupBarSummary = () =>
  useContext(SummaryContext)?.summary ?? null

/** The bar's height, which is where "scrolled away" begins. */
const BAR_HEIGHT = 56

/**
 * Puts `text` in the group's bar while the element the returned ref is attached to is hidden
 * under the bar, and takes it out again when the element comes back or unmounts.
 */
export function useCollapseIntoGroupBar<T extends HTMLElement>(
  text: string | null,
) {
  const setSummary = useContext(SummaryContext)?.setSummary
  const ref = useRef<T>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) =>
        setHidden(
          !entry.isIntersecting && entry.boundingClientRect.top < BAR_HEIGHT,
        ),
      { rootMargin: `-${BAR_HEIGHT}px 0px 0px 0px` },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setSummary?.(hidden ? text : null)
  }, [hidden, text, setSummary])

  useEffect(() => () => setSummary?.(null), [setSummary])

  return ref
}
