'use client'
import { cn } from '@/lib/utils'
import { usePathname } from 'next/navigation'
import { PropsWithChildren } from 'react'

/** A group's expense list: the one page with something to put beside it on a wide screen. */
const TWO_COLUMN_PAGE = /^\/groups\/[^/]+\/expenses\/?$/

/**
 * The groups' page column. 768px everywhere — forms and lists read best at that width — except a
 * group's expense list, which from `lg` widens to hold the balances beside it rather than leaving
 * a desktop's width as empty margin around one narrow column.
 */
export function GroupsMain({ children }: PropsWithChildren) {
  const wide = TWO_COLUMN_PAGE.test(usePathname())
  return (
    <main
      className={cn(
        'flex-1 max-w-screen-md w-full mx-auto px-4 py-6 flex flex-col gap-6',
        wide && 'lg:max-w-[1120px]',
      )}
    >
      {children}
    </main>
  )
}
