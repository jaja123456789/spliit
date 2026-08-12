'use client'

import { Money } from '@/components/money'
import { ProfileAvatar } from '@/components/profile-avatar'
import { Button } from '@/components/ui/button'
import { CalculatorInput } from '@/components/ui/calculator-input'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Currency } from '@/lib/currency'
import { useMediaQuery, useMobilePopoverState } from '@/lib/hooks'
import {
  amountAsDecimal,
  amountAsMinorUnits,
  cn,
  distributeMinorUnits,
} from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { Check, EyeOff, Plus, Trash2, Users } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { useFormContext } from 'react-hook-form'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>

/** How many marks fit before the stack starts counting instead of showing. */
const STACK_LIMIT = 4

/**
 * Who shared a line, as overlapping marks rather than a list of names.
 *
 * A comma-separated list is fine for three people and unreadable for eight, and it grows the row
 * every time the group does. This is fixed-width past four, and the active user's mark keeps its
 * accent so you can see at a glance which lines are yours. Display only — assignment happens in
 * the picker beside it.
 */
function ParticipantStack({
  participantIds,
  group,
  activeUserId,
}: {
  participantIds: string[]
  group: Group
  activeUserId?: string | null
}) {
  if (participantIds.length === 0) return null
  // The active user first, so their mark is never the one hidden behind the "+n".
  const ordered = [...participantIds].sort((a, b) =>
    a === activeUserId ? -1 : b === activeUserId ? 1 : 0,
  )
  const shown = ordered.slice(0, STACK_LIMIT)
  const extra = ordered.length - shown.length

  return (
    <span className="flex shrink-0 items-center" aria-hidden="true">
      {shown.map((id, index) => (
        <span
          key={id}
          className={cn(
            'rounded-[5px] ring-2 ring-card',
            index > 0 && '-ml-1.5',
          )}
        >
          <ProfileAvatar
            name={group.participants.find((p) => p.id === id)?.name ?? '?'}
            isActiveUser={!!activeUserId && id === activeUserId}
            size={20}
          />
        </span>
      ))}
      {extra > 0 && (
        <span className="-ml-1.5 grid h-5 min-w-5 place-items-center rounded-[5px] bg-muted px-1 font-mono text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
          +{extra}
        </span>
      )}
    </span>
  )
}

interface Props {
  group: Group
  currency: Currency
  totalAmount: number
  // Lifted state props
  fields: any[]
  append: (value: any) => void
  remove: (index: number) => void
  activeUserId?: string | null
}

export function ItemizationBuilder({
  group,
  currency,
  totalAmount,
  fields,
  append,
  remove,
  activeUserId,
}: Props) {
  const { control, watch, setValue, trigger } = useFormContext()
  const locale = useLocale()
  const t = useTranslations('ExpenseForm.Itemization')
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // We use the 'items' from watch for calculating totals dynamically,
  // but we iterate over 'fields' for the inputs to maintain focus/state
  const watchedItems = watch('items') || []

  const currentTotal = watchedItems.reduce((sum: number, item: any) => {
    if (!item.participantIds || item.participantIds.length === 0) return sum
    return sum + (Number(item.price) || 0)
  }, 0)

  const allItemsEnteredSum = watchedItems.reduce(
    (sum: number, i: any) => sum + (Number(i.price) || 0),
    0,
  )
  const groupSplitSum = watchedItems.reduce((sum: number, item: any) => {
    if (!item.participantIds || item.participantIds.length === 0) return sum
    return sum + (Number(item.price) || 0)
  }, 0)
  const totalExcluded = totalAmount - groupSplitSum
  const unassignedRemainder = totalAmount - allItemsEnteredSum

  // Each participant's share of the items entered so far. Proportional allocation is meaningless
  // without it — and impossible if nobody has been assigned anything yet.
  const subtotals = group.participants.map((participant) =>
    watchedItems.reduce((sum: number, item: any) => {
      const ids: string[] = item.participantIds || []
      if (!ids.includes(participant.id)) return sum
      return sum + (Number(item.price) || 0) / ids.length
    }, 0),
  )
  const canSplitProportionally = subtotals.some((amount) => amount > 0)

  const addRemainderEvenly = () => {
    append({
      name: t('remainderName'),
      price: Number(unassignedRemainder.toFixed(2)),
      participantIds: group.participants.map((p) => p.id),
    })
    setTimeout(() => trigger(['items', 'paidBy']), 0)
  }

  // An item is always split evenly between the people on it, so a pro-rata share can only be
  // expressed as one single-participant item each. `distributeMinorUnits` does the allocation in
  // minor units, which is what guarantees the parts add back up to the remainder exactly rather
  // than leaving a stray cent to re-trigger the "unassigned" warning.
  const addRemainderProportionally = () => {
    const remainderMinor = amountAsMinorUnits(unassignedRemainder, currency)
    const weights = subtotals.map((amount) =>
      amountAsMinorUnits(amount, currency),
    )
    const allocated = distributeMinorUnits(weights, remainderMinor)
    group.participants.forEach((participant, index) => {
      if (weights[index] <= 0 || allocated[index] === 0) return
      append({
        name: t('remainderNameFor', { name: participant.name }),
        price: amountAsDecimal(allocated[index], currency),
        participantIds: [participant.id],
      })
    })
    setTimeout(() => trigger(['items', 'paidBy']), 0)
  }

  const getPayerSummary = (selectedIds: string[]) => {
    if (!selectedIds || selectedIds.length === 0) return 'No one'
    if (
      selectedIds.length === group.participants.length &&
      group.participants.length > 1
    )
      return 'Everyone'

    let names = selectedIds
      .map((id) => {
        if (activeUserId && id === activeUserId) return 'You'
        return group.participants.find((p) => p.id === id)?.name
      })
      .filter(Boolean) as string[]

    if (names.includes('You')) {
      names = ['You', ...names.filter((n) => n !== 'You')]
    }

    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]} & ${names[1]}`
    return `${names[0]}, ${names[1]} & ${names.length - 2} more`
  }

  return (
    <div>
      <div className="space-y-4">
        {/* The running totals used to live in a sticky header — "Receipt Breakdown" over a
            Shared Total, a struck-through Excluded and a pulsing red "Unassigned" badge, three
            figures competing above the lines they described. They are all one question, asked
            once, in the strip at the foot of this sheet. */}

        {/* Fields Loop */}
        <div className="space-y-3">
          {fields.map((field, index) => {
            // Safe access to watched values for summary calculations
            const currentItem = watchedItems[index] || {}
            const itemPrice = Number(currentItem.price) || 0
            const participantIds = currentItem.participantIds || []
            const isExcluded = participantIds.length === 0
            const perPersonAmount =
              participantIds.length > 0 ? itemPrice / participantIds.length : 0
            const summaryText = getPayerSummary(participantIds)

            const isMeInvolved =
              !!activeUserId && participantIds.includes(activeUserId)

            return (
              <div
                key={field.id}
                className={cn(
                  'group relative flex flex-col gap-3 p-3 rounded-lg border shadow-sm transition-all',
                  isExcluded
                    ? 'bg-muted/30 border-dashed opacity-75'
                    : 'bg-card hover:border-primary/40',
                )}
              >
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-start">
                  {/* Item Name */}
                  <div className="flex-1">
                    <FormField
                      control={control}
                      name={`items.${index}.name`}
                      render={({ field }) => (
                        <FormItem className="space-y-0">
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Item name..."
                              className={cn(
                                'h-9 text-sm transition-all',
                                isExcluded && 'text-muted-foreground',
                              )}
                            />
                          </FormControl>
                          <FormMessage className="text-xs pl-1 mt-1" />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex gap-2 items-start justify-end">
                    {/* Price Input */}
                    <div className="w-[110px]">
                      <FormField
                        control={control}
                        name={`items.${index}.price`}
                        render={({ field }) => (
                          <FormItem className="space-y-0">
                            <div className="relative">
                              <FormControl>
                                <CalculatorInput
                                  {...field}
                                  placeholder="0.00"
                                  className="h-9"
                                  inputClassName={cn(
                                    'h-9 text-sm text-right pr-8',
                                    isExcluded && 'text-muted-foreground',
                                  )}
                                  onValueChange={(val) => {
                                    field.onChange(val)
                                    trigger('items')
                                    trigger('paidBy')
                                  }}
                                />
                              </FormControl>
                              <div className="absolute right-9 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                                {currency.symbol || group.currency}
                              </div>
                            </div>
                            <FormMessage className="text-xs text-right pr-1 mt-1" />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Participant Popover */}
                    <FormField
                      control={control}
                      name={`items.${index}.participantIds`}
                      render={({ field }) => (
                        <FormItem className="space-y-0">
                          <ParticipantSelector
                            value={field.value || []}
                            onChange={(val) => {
                              field.onChange(val)
                              trigger('items')
                            }}
                            group={group}
                            isDesktop={isDesktop}
                            activeUserId={activeUserId}
                            isExcluded={isExcluded}
                            isMeInvolved={isMeInvolved}
                          />
                        </FormItem>
                      )}
                    />

                    {/* Delete Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => remove(index)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Second line: who shared it, and what it costs you.
                    It used to read "Alice, Bob will each pay $12.00" — a sentence that grows with
                    the group, and a figure that is only your share when you happen to be on the
                    line. The stack shows who without spending a line on names, and the figure is
                    now explicitly yours: a dash when you are not on this item. */}
                <div className="flex items-center justify-between gap-3 px-1 min-h-6">
                  {isExcluded ? (
                    <span className="text-xs text-subtle-foreground italic">
                      {t('excludedHint')}
                    </span>
                  ) : (
                    <>
                      <div className="flex min-w-0 items-center gap-2">
                        <ParticipantStack
                          participantIds={participantIds}
                          group={group}
                          activeUserId={activeUserId}
                        />
                        <span className="truncate text-xs text-muted-foreground">
                          {summaryText}
                        </span>
                      </div>

                      {itemPrice > 0 && (
                        <span className="flex shrink-0 items-baseline gap-1.5">
                          <span className="text-xs text-subtle-foreground">
                            {t('yourShare')}
                          </span>
                          {isMeInvolved ? (
                            <Money
                              currency={currency}
                              amount={perPersonAmount}
                              fractions
                              className="text-xs text-credit"
                              bold
                            />
                          ) : (
                            <span className="font-mono text-xs text-subtle-foreground">
                              —
                            </span>
                          )}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* A row, not an 80px dashed slab. Typing a receipt in means using this repeatedly, and
            each press used to push the line you had just filled in further off screen. The new
            line inherits the previous line's people, because consecutive lines on a receipt are
            usually shared by the same people — the exception is what needs the tap, not the rule. */}
        <Button
          type="button"
          variant="outline"
          data-testid="add-item"
          className="w-full justify-center gap-2 border-dashed"
          onClick={() => {
            const nextAmount =
              unassignedRemainder > 0
                ? Number(unassignedRemainder.toFixed(2))
                : 0
            const previous = watchedItems[watchedItems.length - 1]
            const inherited = previous?.participantIds?.length
              ? previous.participantIds
              : group.participants.map((p) => p.id)
            append({
              name: '',
              price: nextAmount,
              participantIds: inherited,
            })
          }}
        >
          <Plus className="w-4 h-4" />
          {t('addLine')}
        </Button>

        {/* The strip: one sunken bar at the foot carrying whatever is left to decide.
            What is left over after the lines is almost always tax and service. Splitting that
            evenly is wrong whenever people ordered different amounts — a 20% service charge on a
            £60 order is not the same as on a £15 one — so proportional leads. Even is still
            offered, because a flat cover charge genuinely is even. */}
        {Math.abs(unassignedRemainder) > 0.01 ? (
          <div
            data-testid="remainder-strip"
            className="rounded-lg bg-muted px-3 py-2.5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {t('remainderLabel')}
              </span>
              <Money
                currency={currency}
                amount={unassignedRemainder}
                fractions
                bold
                className="text-sm"
              />
            </div>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 flex-1 bg-card"
                onClick={addRemainderProportionally}
                disabled={!canSplitProportionally}
                title={
                  canSplitProportionally
                    ? undefined
                    : t('proportionalUnavailable')
                }
              >
                {t('remainderProportional')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 flex-1 bg-card"
                onClick={addRemainderEvenly}
              >
                {t('remainderEvenly')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-baseline justify-between gap-3 rounded-lg bg-muted px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-credit" />
              {t('allAssigned')}
            </span>
            <span className="flex items-baseline gap-3">
              {totalExcluded > 0.009 && (
                <span className="flex items-baseline gap-1 text-xs text-subtle-foreground">
                  <Money currency={currency} amount={totalExcluded} fractions />
                  {t('excludedTotal')}
                </span>
              )}
              <span className="flex items-baseline gap-1">
                <Money
                  currency={currency}
                  amount={groupSplitSum}
                  fractions
                  bold
                  className="text-sm"
                />
                <span className="text-xs text-muted-foreground">
                  {t('sharedTotal')}
                </span>
              </span>
            </span>
          </div>
        )}

        {/* Global Items Array Error (e.g. "Items must sum to total") */}
        <FormField
          control={control}
          name="items"
          render={() => <FormMessage className="mt-2" />}
        />
      </div>
    </div>
  )
}

function ParticipantSelector({
  value,
  onChange,
  group,
  isDesktop,
  activeUserId,
  isExcluded,
  isMeInvolved,
}: {
  value: string[]
  onChange: (val: string[]) => void
  group: Group
  isDesktop: boolean
  activeUserId?: string | null
  isExcluded: boolean
  isMeInvolved: boolean | null
}) {
  const [open, setOpen] = useState(false)
  useMobilePopoverState(open, setOpen, isDesktop)

  const TriggerButton = (
    <FormControl>
      <Button
        variant={isExcluded ? 'outline' : 'secondary'}
        size="icon"
        className={cn(
          'h-9 w-9 shrink-0 relative transition-colors',
          isExcluded &&
            'border-dashed border-muted-foreground/50 text-muted-foreground',
          isMeInvolved && 'bg-primary/10 text-primary border-primary/20',
        )}
        type="button"
        title={isExcluded ? 'Assign to someone' : 'Edit assignment'}
      >
        {isExcluded ? (
          <EyeOff className="h-4 w-4 opacity-50" />
        ) : (
          <Users className="h-4 w-4" />
        )}
        {value.length > 0 && value.length < group.participants.length && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-mono tabular-nums text-primary-foreground font-semibold shadow-sm">
            {value.length}
          </span>
        )}
      </Button>
    </FormControl>
  )

  const SelectionList = (
    <div className="space-y-1">
      <div className="flex justify-between items-center px-2 pb-2 border-b mb-1">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Split among
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-1 text-xs text-primary hover:bg-primary/10"
          onClick={() => {
            const allIds = group.participants.map((p) => p.id)
            const isAllSelected = value.length === group.participants.length
            onChange(isAllSelected ? [] : allIds)
          }}
        >
          {value.length === group.participants.length
            ? 'Clear (Exclude)'
            : 'Select All'}
        </Button>
      </div>
      <div className="max-h-[300px] overflow-y-auto grid grid-cols-1 gap-1">
        {group.participants.map((participant) => {
          const isSelected = value.includes(participant.id)
          const isMe = !!activeUserId && participant.id === activeUserId

          return (
            <div
              key={participant.id}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors',
                isSelected
                  ? 'bg-primary/5 font-medium text-primary'
                  : 'hover:bg-muted',
              )}
              onClick={() => {
                const isAllSelected = value.length === group.participants.length
                let next
                if (isAllSelected) {
                  // If all were selected, clicking one isolates it (optional behavior, but sticking to toggle here for simplicity)
                  next = isSelected
                    ? value.filter((id) => id !== participant.id)
                    : [...value, participant.id]
                } else {
                  next = isSelected
                    ? value.filter((id) => id !== participant.id)
                    : [...value, participant.id]
                }
                onChange(next)
              }}
            >
              <div
                className={cn(
                  'w-5 h-5 rounded border flex items-center justify-center transition-colors',
                  isSelected
                    ? 'bg-primary border-primary'
                    : 'border-muted-foreground/30 bg-background',
                )}
              >
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-primary-foreground stroke-[3]" />
                )}
              </div>
              <span className="truncate flex-1">
                {participant.name}
                {isMe && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (You)
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{TriggerButton}</PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="end">
          {SelectionList}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{TriggerButton}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left pb-0">
          <DrawerTitle>Split Item</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 pb-8">{SelectionList}</div>
      </DrawerContent>
    </Drawer>
  )
}
