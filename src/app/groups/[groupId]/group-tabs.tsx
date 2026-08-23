'use client'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BarChart3,
  History,
  Info,
  Receipt,
  Scale,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'

type Props = {
  groupId: string
}

export type GroupTab = {
  value: string
  messageKey: string
  Icon: LucideIcon
}

/**
 * The six places a group can be, in order. Shared with the bottom bar, which shows the first four
 * and folds the rest into "More".
 */
export const GROUP_TABS: GroupTab[] = [
  { value: 'expenses', messageKey: 'Expenses.title', Icon: Receipt },
  { value: 'balances', messageKey: 'Balances.title', Icon: Scale },
  { value: 'stats', messageKey: 'Stats.title', Icon: BarChart3 },
  { value: 'activity', messageKey: 'Activity.title', Icon: History },
  { value: 'information', messageKey: 'Information.title', Icon: Info },
  { value: 'edit', messageKey: 'Settings.title', Icon: Settings },
]

/** The tab the current URL is on. `/groups/<id>` with nothing after it lands on expenses. */
export function useGroupTabValue() {
  const pathname = usePathname()
  return pathname.replace(/\/groups\/[^\/]+\/([^/]+).*/, '$1') || 'expenses'
}

/**
 * The horizontal strip, which is now the *desktop* navigation only.
 *
 * It never fitted a phone. Six labels needed 483px in a 412px viewport, and stacking a glyph over
 * each label — the previous fix — bought enough room for the touch targets but not for the words:
 * measured at four phone widths, "Information" wanted 62px in a box that is 45px at 360 and still
 * only 57px at 430, so it was clipped on every phone made. At 360 "Expenses" and "Balances" clipped
 * too, and with no horizontal padding left to give, the six labels ran together with no visible
 * boundary between one target and the next.
 *
 * Below `sm` this is replaced by `GroupTabBar`, which shows four tabs and a More. Exactly one of
 * the two is ever in the accessibility tree, so `getByRole('tab')` stays unambiguous.
 */
export function GroupTabs({ groupId }: Props) {
  const t = useTranslations()
  const value = useGroupTabValue()
  const router = useRouter()

  return (
    <Tabs
      value={value}
      className="[&>*]:border w-full min-w-0"
      onValueChange={(value) => {
        router.push(`/groups/${groupId}/${value}`)
      }}
    >
      <TabsList className="flex w-full h-10">
        {GROUP_TABS.map(({ value, messageKey, Icon }) => (
          <TabsTrigger
            key={value}
            value={value}
            className="flex-row gap-1.5 px-3 py-1.5 min-w-0"
          >
            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="text-sm leading-none truncate max-w-full">
              {t(messageKey as never)}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
