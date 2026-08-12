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

/**
 * Six tabs did not fit a phone: the strip needed 483px in a 412px viewport, so Settings sat
 * off-screen and the share button covered Activity, with nothing to indicate it scrolled.
 * Stacking a glyph over the label fits all six and takes the touch target from 32px to ~44px.
 * The icons are aria-hidden so each trigger's accessible name stays exactly the translated label.
 */
const TABS: { value: string; messageKey: string; Icon: LucideIcon }[] = [
  { value: 'expenses', messageKey: 'Expenses.title', Icon: Receipt },
  { value: 'balances', messageKey: 'Balances.title', Icon: Scale },
  { value: 'stats', messageKey: 'Stats.title', Icon: BarChart3 },
  { value: 'activity', messageKey: 'Activity.title', Icon: History },
  { value: 'information', messageKey: 'Information.title', Icon: Info },
  { value: 'edit', messageKey: 'Settings.title', Icon: Settings },
]

export function GroupTabs({ groupId }: Props) {
  const t = useTranslations()
  const pathname = usePathname()
  const value =
    pathname.replace(/\/groups\/[^\/]+\/([^/]+).*/, '$1') || 'expenses'
  const router = useRouter()

  return (
    <Tabs
      value={value}
      className="[&>*]:border w-full min-w-0"
      onValueChange={(value) => {
        router.push(`/groups/${groupId}/${value}`)
      }}
    >
      <TabsList className="grid w-full grid-cols-6 h-auto sm:flex sm:h-10">
        {TABS.map(({ value, messageKey, Icon }) => (
          <TabsTrigger
            key={value}
            value={value}
            // No horizontal padding on the narrow layout. At 412px a tab is 53.7px wide and `px-1`
            // left the label 45.7px, which is under the 12px width of half these labels — so the
            // strip had been pushed to 10px to fit. Dropping the padding buys back 8px and the same
            // one label truncates as before ("Information", 62.5px, which never fitted at 10px
            // either).
            className="flex-col gap-1 px-0 py-2 min-w-0 sm:flex-row sm:gap-1.5 sm:px-3 sm:py-1.5"
          >
            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="text-xs leading-none truncate max-w-full sm:text-sm">
              {t(messageKey as never)}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
