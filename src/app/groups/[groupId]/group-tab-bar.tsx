'use client'

import { GROUP_TABS, useGroupTabValue } from '@/app/groups/[groupId]/group-tabs'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { ChevronRight, MoreHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

/** Four tabs and a More: the fifth slot is what stops "Information" having to fit. */
const PRIMARY = GROUP_TABS.slice(0, 4)
const OVERFLOW = GROUP_TABS.slice(4)

/**
 * Whether the bar belongs on this screen.
 *
 * Only on the tab destinations themselves. The expense form, the settle sheet and the receipt
 * screens all have their own sticky footer, and two bands of chrome stacked at the bottom of a
 * phone is one too many — those screens are a task you finish or cancel, not somewhere you navigate
 * away from.
 */
function useShowsTabBar() {
  const pathname = usePathname()
  const rest = pathname.replace(/^\/groups\/[^/]+\/?/, '')
  return rest === '' || rest.split('/').length === 1
}

/**
 * Primary navigation on a phone: fixed to the bottom, within reach of a thumb.
 *
 * The strip it replaces sat at the top of a screen whose chrome already ran to 214px — a measured
 * 32% of an iPhone SE — before a single expense was visible. Retiring it below `sm` gives about 90
 * of those pixels back and puts the four places you actually go where your hand already is.
 *
 * It is a real tablist rather than a row of links, so the four primary destinations keep
 * `role="tab"` and the accessible names they had in the strip. More is a tab too — it takes the
 * active state when you are on one of the screens it holds — but it opens a sheet instead of
 * navigating, which is why the selection is controlled by the URL and not by Radix.
 */
export function GroupTabBar({ groupId }: { groupId: string }) {
  const t = useTranslations()
  const router = useRouter()
  const tabValue = useGroupTabValue()
  const [open, setOpen] = useState(false)
  const showsTabBar = useShowsTabBar()

  if (!showsTabBar) return null

  const isOverflow = OVERFLOW.some((tab) => tab.value === tabValue)
  const value = isOverflow ? 'more' : tabValue

  return (
    <>
      <Tabs
        value={value}
        onValueChange={(next) => {
          if (next === 'more') {
            setOpen(true)
            return
          }
          router.push(`/groups/${groupId}/${next}`)
        }}
        // `sm:hidden` on the bar and `hidden sm:block` on the strip: display:none keeps the
        // inactive one out of the accessibility tree, so a `getByRole('tab')` — which every e2e
        // spec navigates by — never matches two elements at once. `contents` so the root box
        // itself is not a flex item of the page container, which would reserve a `gap-6` for an
        // element whose only child is fixed to the viewport.
        className="contents sm:hidden"
      >
        <TabsList
          className={cn(
            'fixed inset-x-0 bottom-0 z-40 grid h-auto grid-cols-5 rounded-none border-t p-0',
            'bg-background/95 supports-[backdrop-filter]:bg-background/80 backdrop-blur',
            // The home indicator on a modern iPhone sits over the bottom ~34px. Nothing else in
            // the app reads the safe area yet; a bar pinned to the bottom edge is the first thing
            // that has to.
            'pb-[env(safe-area-inset-bottom)]',
          )}
        >
          {PRIMARY.map(({ value, messageKey, Icon }) => (
            <TabBarTrigger
              key={value}
              value={value}
              label={t(messageKey as never)}
              Icon={Icon}
            />
          ))}
          <TabBarTrigger
            value="more"
            label={t('Common.more')}
            Icon={MoreHorizontal}
          />
        </TabsList>
      </Tabs>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="sm:hidden">
          <DrawerHeader className="sr-only">
            <DrawerTitle>{t('Common.more')}</DrawerTitle>
            <DrawerDescription>{t('Common.moreDescription')}</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {OVERFLOW.map(({ value, messageKey, Icon }) => (
              <Link
                key={value}
                href={`/groups/${groupId}/${value}`}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 border-b py-4 text-sm font-medium last:border-0',
                  value === tabValue && 'font-semibold text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t(messageKey as never)}
                <ChevronRight
                  className="ml-auto h-4 w-4 text-subtle-foreground"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}

const TabBarTrigger = ({
  value,
  label,
  Icon,
}: {
  value: string
  label: string
  Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
}) => (
  <TabsTrigger
    value={value}
    // The strip's active state is a raised white plate, which is right for a control sitting on a
    // muted track and wrong for a bar that is the ground. Here the accent on the glyph and the
    // label carries it, the way a tab bar has always done it.
    className={cn(
      'flex-col gap-1 rounded-none px-1 py-2 min-w-0 h-full',
      'data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none',
    )}
  >
    <Icon className="h-5 w-5 shrink-0" aria-hidden={true} />
    <span className="max-w-full truncate text-[11px] leading-none">
      {label}
    </span>
  </TabsTrigger>
)
