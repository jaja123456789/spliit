'use client'
import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { ExpenseFilters, MONTH_PATTERN } from '@/lib/expense-filters'
import { useMediaQueryAfterHydration, useMobilePopoverState } from '@/lib/hooks'
import { cn, formatDateOnly } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { Check, ChevronDown, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { ReactNode, useRef, useState } from 'react'
import { useCurrentGroup } from '../current-group-context'

/** Where each filter lives in the address. */
const PARAM = {
  search: 'q',
  paidBy: 'paidBy',
  categoryId: 'category',
  month: 'month',
} as const

function readFilters(params: URLSearchParams): ExpenseFilters {
  const category = params.get(PARAM.categoryId)
  const month = params.get(PARAM.month)
  return {
    search: params.get(PARAM.search) ?? '',
    paidBy: params.get(PARAM.paidBy) || undefined,
    categoryId:
      category && /^\d+$/.test(category) ? Number(category) : undefined,
    month: month && MONTH_PATTERN.test(month) ? month : undefined,
  }
}

function writeFilters(filters: ExpenseFilters) {
  const params = new URLSearchParams(window.location.search)
  for (const key of Object.keys(PARAM) as (keyof typeof PARAM)[]) {
    const value = filters[key]
    if (value === undefined || value === '') params.delete(PARAM[key])
    else params.set(PARAM[key], String(value))
  }
  const query = params.toString()
  const url = `${window.location.pathname}${query ? `?${query}` : ''}`
  if (url !== `${window.location.pathname}${window.location.search}`) {
    // The browser's own `replaceState`, which Next keeps in step with `useSearchParams`, rather
    // than `router.replace`: that would ask the server for the page again on every change.
    window.history.replaceState(null, '', url)
  }
}

/**
 * Writes the address now — unless a picker on a phone still holds its history entry
 * (`useMobilePopoverState` pushes one while it is open, and takes it back as it closes). Written
 * onto that entry, the filters would vanish with it; so they wait for it to go.
 */
function writeFiltersWhenSettled(filters: ExpenseFilters) {
  if (window.history.state?.drawerOpen) {
    window.addEventListener('popstate', () => writeFilters(filters), {
      once: true,
    })
  } else {
    writeFilters(filters)
  }
}

/**
 * The list's filters, kept in the address so that opening an expense and coming back finds the
 * list as it was left — and so a filtered view can be bookmarked or shared.
 *
 * The address is written as the filters change, in the same event. It used to follow a moment
 * later, which let it land after a link had been clicked — and rewrite the address back to this
 * list in the middle of the navigation away from it.
 */
export function useExpenseListFilters() {
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState(() => readFilters(searchParams))
  const latest = useRef(filters)

  const update = (change: Partial<ExpenseFilters>) => {
    const next = { ...latest.current, ...change }
    latest.current = next
    setFilters(next)
    writeFiltersWhenSettled(next)
  }
  return [filters, update] as const
}

type Props = {
  filters: ExpenseFilters
  onChange: (change: Partial<ExpenseFilters>) => void
}

/** Who paid, what kind, which month: the three questions a long-lived group gets asked. */
export function ExpenseFiltersBar({ filters, onChange }: Props) {
  const t = useTranslations('Expenses.Filters')
  return (
    <div
      role="group"
      aria-label={t('label')}
      className="mx-4 sm:mx-6 flex flex-wrap gap-2"
    >
      <PaidByFilter
        value={filters.paidBy}
        onChange={(paidBy) => onChange({ paidBy })}
      />
      <CategoryFilter
        value={filters.categoryId}
        onChange={(categoryId) => onChange({ categoryId })}
      />
      <MonthFilter
        value={filters.month}
        onChange={(month) => onChange({ month })}
      />
    </div>
  )
}

function PaidByFilter({
  value,
  onChange,
}: {
  value?: string
  onChange: (value?: string) => void
}) {
  const t = useTranslations('Expenses.Filters')
  const { group } = useCurrentGroup()
  const participants = group?.participants ?? []
  const selected = participants.find((p) => p.id === value)

  return (
    <FilterChip
      label={t('paidBy')}
      valueLabel={selected?.name}
      onClear={() => onChange(undefined)}
      testId="filter-paid-by"
    >
      {(close) => (
        <Command>
          <CommandList className="max-h-[60vh] sm:max-h-[300px]">
            <CommandGroup>
              <Option
                value="any"
                selected={!value}
                onSelect={() => close(() => onChange(undefined))}
              >
                {t('anyone')}
              </Option>
              {participants.map((participant) => (
                <Option
                  key={participant.id}
                  value={participant.id}
                  keywords={[participant.name]}
                  selected={participant.id === value}
                  onSelect={() => close(() => onChange(participant.id))}
                >
                  {participant.name}
                </Option>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      )}
    </FilterChip>
  )
}

function CategoryFilter({
  value,
  onChange,
}: {
  value?: number
  onChange: (value?: number) => void
}) {
  const t = useTranslations('Expenses.Filters')
  const tCategories = useTranslations('Categories')
  const { groupId } = useCurrentGroup()
  const [opened, setOpened] = useState(false)
  // Only once there is something to show: the label of a category already chosen, or the menu.
  const { data: categoriesData } = trpc.categories.list.useQuery(undefined, {
    enabled: opened || value !== undefined,
  })
  const { data: facets } = trpc.groups.expenses.facets.useQuery(
    { groupId },
    { enabled: opened },
  )
  const categories = categoriesData?.categories ?? []
  const nameOf = (category: (typeof categories)[number]) =>
    tCategories(`${category.grouping}.${category.name}`)
  const selected = categories.find((category) => category.id === value)

  // The categories this group uses, most used first; the full list of forty-odd would mostly
  // offer ways to find nothing.
  const used = (facets?.categories ?? []).flatMap(({ id, count }) => {
    const category = categories.find((c) => c.id === id)
    return category ? [{ category, count }] : []
  })

  return (
    <FilterChip
      label={t('category')}
      valueLabel={selected && nameOf(selected)}
      onClear={() => onChange(undefined)}
      onOpenChange={(open) => open && setOpened(true)}
      testId="filter-category"
    >
      {(close) => (
        <Command>
          {used.length > 8 && (
            <CommandInput
              placeholder={tCategories('search')}
              className="text-base h-11"
            />
          )}
          <CommandList className="max-h-[60vh] sm:max-h-[300px]">
            <CommandEmpty>{tCategories('noCategory')}</CommandEmpty>
            <CommandGroup>
              <Option
                value="any"
                keywords={[t('anyCategory')]}
                selected={value === undefined}
                onSelect={() => close(() => onChange(undefined))}
              >
                {t('anyCategory')}
              </Option>
              {!facets && <LoadingOptions />}
              {used.map(({ category, count }) => (
                <Option
                  key={category.id}
                  value={`category-${category.id}`}
                  keywords={[nameOf(category)]}
                  selected={category.id === value}
                  count={count}
                  onSelect={() => close(() => onChange(category.id))}
                >
                  <CategoryIcon
                    category={category}
                    className="w-4 h-4 mr-2 text-muted-foreground"
                  />
                  {nameOf(category)}
                </Option>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      )}
    </FilterChip>
  )
}

function monthLabel(month: string, locale: string) {
  return formatDateOnly(new Date(`${month}-01T00:00:00Z`), locale, {
    month: 'long',
    year: 'numeric',
  })
}

function MonthFilter({
  value,
  onChange,
}: {
  value?: string
  onChange: (value?: string) => void
}) {
  const t = useTranslations('Expenses.Filters')
  const locale = useLocale()
  const { groupId } = useCurrentGroup()
  const [opened, setOpened] = useState(false)
  const { data: facets } = trpc.groups.expenses.facets.useQuery(
    { groupId },
    { enabled: opened },
  )

  return (
    <FilterChip
      label={t('month')}
      valueLabel={value && monthLabel(value, locale)}
      onClear={() => onChange(undefined)}
      onOpenChange={(open) => open && setOpened(true)}
      testId="filter-month"
    >
      {(close) => (
        <Command>
          <CommandList className="max-h-[60vh] sm:max-h-[300px]">
            <CommandGroup>
              <Option
                value="any"
                selected={!value}
                onSelect={() => close(() => onChange(undefined))}
              >
                {t('anyTime')}
              </Option>
              {!facets && <LoadingOptions />}
              {(facets?.months ?? []).map(({ month, count }) => (
                <Option
                  key={month}
                  value={month}
                  keywords={[monthLabel(month, locale)]}
                  selected={month === value}
                  count={count}
                  onSelect={() => close(() => onChange(month))}
                >
                  {monthLabel(month, locale)}
                </Option>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      )}
    </FilterChip>
  )
}

function Option({
  value,
  selected,
  count,
  keywords,
  onSelect,
  children,
}: {
  /** Unique within the list: two people can share a name. */
  value: string
  selected: boolean
  count?: number
  keywords?: string[]
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <CommandItem
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      data-checked={selected}
      className="py-2.5 px-3 text-base sm:text-sm"
    >
      <Check
        className={cn(
          'w-4 h-4 mr-2 shrink-0',
          selected ? 'opacity-100' : 'opacity-0',
        )}
      />
      <span className="flex items-center min-w-0 flex-1 truncate">
        {children}
      </span>
      {count !== undefined && (
        <span className="ml-3 text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </CommandItem>
  )
}

function LoadingOptions() {
  return (
    <div className="space-y-3 px-3 py-2.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-4 w-32 ml-6" />
      ))}
    </div>
  )
}

/**
 * A filter as a chip: its name until it is set, then its value, with a way to clear it. It opens
 * its options in a popover on a wide screen and a drawer on a phone, as the category picker does.
 */
function FilterChip({
  label,
  valueLabel,
  onClear,
  onOpenChange,
  testId,
  children,
}: {
  label: string
  valueLabel?: string
  onClear: () => void
  onOpenChange?: (open: boolean) => void
  testId: string
  /** The options. `close` shuts the picker and then applies the choice. */
  children: (close: (then: () => void) => void) => ReactNode
}) {
  const t = useTranslations('Expenses.Filters')
  const [open, setOpenState] = useState(false)
  const setOpen = (next: boolean) => {
    setOpenState(next)
    onOpenChange?.(next)
  }
  const isDesktop = useMediaQueryAfterHydration('(min-width: 1024px)')
  useMobilePopoverState(open, setOpenState, isDesktop)
  const active = valueLabel !== undefined

  const close = (then: () => void) => {
    setOpen(false)
    then()
  }

  const trigger = (
    <button
      type="button"
      data-testid={testId}
      aria-label={active ? `${label}: ${valueLabel}` : undefined}
      className="inline-flex h-full max-w-[14rem] items-center gap-1 rounded-full pl-3 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="truncate">{active ? valueLabel : label}</span>
      {!active && <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />}
    </button>
  )
  const options = children(close)

  return (
    <div
      className={cn(
        'inline-flex h-8 items-center rounded-full border text-xs font-medium transition-colors',
        active
          ? 'border-foreground/30 bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent',
      )}
    >
      {isDesktop ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent className="p-0 w-64" align="start">
            {options}
          </PopoverContent>
        </Popover>
      ) : (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
          <DrawerContent className="p-0 max-h-[85vh]">
            <DrawerTitle className="px-4 pt-4 pb-2 text-base font-semibold">
              {label}
            </DrawerTitle>
            <div className="pb-[env(safe-area-inset-bottom)]">{options}</div>
          </DrawerContent>
        </Drawer>
      )}
      {active && (
        <button
          type="button"
          aria-label={t('clear', { filter: label })}
          onClick={onClear}
          className="inline-flex h-full items-center rounded-full pl-1 pr-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
