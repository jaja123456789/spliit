'use client'

import { GROUP_TABS, useGroupTabValue } from '@/app/groups/[groupId]/group-tabs'
import { useEnv } from '@/components/env-provider'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  ChevronRight,
  FileDown,
  FileJson,
  MoreHorizontal,
  Plus,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Three tabs, add in the middle, and More. Add is the action the bar is for. Stats is a tab and
 * Activity sits in More with Settings and Export: Stats used to be the one in More, which left More
 * holding two things and the colourful screen two taps away.
 */
const PRIMARY_VALUES = ['expenses', 'balances', 'stats']
const PRIMARY = GROUP_TABS.filter((tab) => PRIMARY_VALUES.includes(tab.value))
const OVERFLOW = GROUP_TABS.filter((tab) => !PRIMARY_VALUES.includes(tab.value))
/** Their columns in the bar's five, the middle one being add's. */
const COLUMN: Record<string, string> = {
  expenses: 'col-start-1',
  balances: 'col-start-2',
  stats: 'col-start-4',
  more: 'col-start-5',
}

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
  const basePath = useEnv().NEXT_PUBLIC_BASE_PATH ?? ''

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
        {/* Solid, not 80% with a blur: the list showed through behind the 11px labels. */}
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background',
            // The home indicator on a modern iPhone sits over the bottom ~34px. Nothing else in
            // the app reads the safe area yet; a bar pinned to the bottom edge is the first thing
            // that has to.
            'pb-[env(safe-area-inset-bottom)]',
          )}
        >
          {/* `contents`, so the tabs are cells of the bar's grid while the tablist stays one
              element holding only tabs. Add sits between them as a link, not a tab: it starts
              something rather than going somewhere. */}
          <TabsList className="contents">
            {PRIMARY.map(({ value, messageKey, Icon }) => (
              <TabBarTrigger
                key={value}
                value={value}
                label={t(messageKey as never)}
                Icon={Icon}
                className={COLUMN[value]}
              />
            ))}
            <TabBarTrigger
              value="more"
              label={t('Common.more')}
              Icon={MoreHorizontal}
              className={COLUMN.more}
            />
          </TabsList>
          {/* The add button used to float over the list's right edge, which is where the amounts
              are: at rest it hid one row's figures, and every row's on the way past. In the bar it
              covers nothing. One tap to the form; scanning a receipt is the form's first row. */}
          <Link
            href={`/groups/${groupId}/expenses/create`}
            aria-label={t('Expenses.create')}
            title={t('Expenses.create')}
            className="col-start-3 row-start-1 grid place-items-center py-1.5"
          >
            <span className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform active:scale-95">
              <Plus className="h-6 w-6" aria-hidden={true} />
            </span>
          </Link>
        </div>
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
            {/* Export lived in the expense list's total card on a phone, an icon beside the
                figure; it is rare enough to sit here instead. */}
            {(
              [
                ['json', 'Expenses.exportJson', FileJson],
                ['csv', 'Expenses.exportCsv', FileDown],
              ] as const
            ).map(([format, messageKey, Icon]) => (
              <a
                key={format}
                href={`${basePath}/groups/${groupId}/expenses/export/${format}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 border-b py-4 text-sm font-medium last:border-0"
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t(messageKey)}
              </a>
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
  className,
}: {
  value: string
  label: string
  Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  className?: string
}) => (
  <TabsTrigger
    value={value}
    // The strip's active state is a raised white plate, which is right for a control sitting on a
    // muted track and wrong for a bar that is the ground. Here the accent on the glyph and the
    // label carries it, the way a tab bar has always done it.
    className={cn(
      'row-start-1 flex-col gap-1 rounded-none px-1 py-2 min-w-0 h-full',
      'data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none',
      className,
    )}
  >
    <Icon className="h-5 w-5 shrink-0" aria-hidden={true} />
    <span className="max-w-full truncate text-[11px] leading-none">
      {label}
    </span>
  </TabsTrigger>
)
