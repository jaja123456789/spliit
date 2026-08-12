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
  formatCurrency,
} from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { Check, Plus, Trash2, Users } from 'lucide-react'
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
          // -3px, not -6px. A 20px plate centres two 8px mono letters across its middle 9.6px,
          // so the covering mark's 2px ring reached into the previous mark's second letter and
          // every mark in the stack but the last read as one and a half characters.
          className={cn(
            'rounded-[5px] ring-2 ring-card',
            index > 0 && '-ml-[3px]',
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
        <span className="-ml-[3px] grid h-5 min-w-5 place-items-center rounded-[5px] bg-muted px-1 font-mono text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
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

  /**
   * Assigning several lines to the same people in one go.
   *
   * The concept asked for long-press to select, which the row cannot support: it is a live form —
   * a text input for the name and a calculator input for the price — and long-pressing a text
   * input on a phone raises the platform's own selection handles and context menu. A mode toggle
   * gets the same end state without fighting the OS for the only surface the row has, and unlike a
   * gesture it can be reached from a keyboard.
   */
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([])

  /**
   * Which row has its picker open. One at a time, keyed by react-hook-form's row id.
   *
   * Only one, because the picker is 46px-tall targets six across: two open rows push the third
   * off a phone screen, and the whole point of opening one is to see the per-head figure change
   * against the lines around it.
   */
  const [openRowId, setOpenRowId] = useState<string | null>(null)

  /**
   * Whether the marks are individual targets in the row instead of a stack you tap to open.
   *
   * The concept draws it both ways deliberately: a phone row has space for a stack and nothing
   * more, a desktop row is "wide enough for individual targets again". Six is where twelve
   * 28px marks plus a name, a price and a figure stop fitting in a 734px row.
   */
  const inlineMarks = isDesktop && group.participants.length <= 6

  const toggleRow = (rowId: string) =>
    setSelectedRowIds((current) =>
      current.includes(rowId)
        ? current.filter((id) => id !== rowId)
        : [...current, rowId],
    )

  const leaveSelection = () => {
    setIsSelecting(false)
    setSelectedRowIds([])
  }

  // Keyed by react-hook-form's own row id, not by index: `remove(index)` shifts every index above
  // it, so an index-based selection would silently start pointing at different lines.
  const selectedIndexes = fields
    .map((field, index) => ({ id: field.id, index }))
    .filter(({ id }) => selectedRowIds.includes(id))
    .map(({ index }) => index)

  const selectedTotal = selectedIndexes.reduce(
    (sum, index) => sum + (Number(watchedItems[index]?.price) || 0),
    0,
  )

  const assignToSelected = (participantIds: string[]) => {
    for (const index of selectedIndexes) {
      setValue(`items.${index}.participantIds`, participantIds, {
        shouldDirty: true,
      })
    }
    // One validation pass for the batch, not one per line.
    trigger(['items', 'paidBy'])
    leaveSelection()
  }

  const removeRow = (index: number) => {
    const rowId = fields[index]?.id
    if (rowId)
      setSelectedRowIds((current) => current.filter((id) => id !== rowId))
    remove(index)
  }

  /**
   * What the line's strip says about who shares it.
   *
   * It describes the set rather than listing it: "everyone", "Bob only", "3 sharing", "not
   * shared". The list it replaced ("Alice, Bob & 2 more") grew with the group, and past two names
   * it was doing nothing the marks beside it were not already doing — while pushing your own
   * share off the end of the row.
   */
  const getPayerSummary = (selectedIds: string[]) => {
    if (!selectedIds || selectedIds.length === 0) return t('notShared')
    if (
      selectedIds.length === group.participants.length &&
      group.participants.length > 1
    )
      return t('sharedByEveryone')
    if (selectedIds.length === 1) {
      const only = selectedIds[0]
      return t('sharedByOne', {
        name:
          activeUserId && only === activeUserId
            ? t('yourShareShort')
            : group.participants.find((p) => p.id === only)?.name ?? '',
      })
    }
    return t('sharedByCount', { count: selectedIds.length })
  }

  return (
    <div>
      <div className="space-y-4">
        {/* The running totals used to live in a sticky header — "Receipt Breakdown" over a
            Shared Total, a struck-through Excluded and a pulsing red "Unassigned" badge, three
            figures competing above the lines they described. They are all one question, asked
            once, in the strip at the foot of this sheet. */}

        {fields.length > 1 && (
          <div className="-mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {isSelecting ? t('selectHint') : ''}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              data-testid="select-lines"
              onClick={() =>
                isSelecting ? leaveSelection() : setIsSelecting(true)
              }
            >
              {isSelecting ? t('selectDone') : t('select')}
            </Button>
          </div>
        )}

        {/* The lines, as one run of ruled rows spanning the sheet rather than a stack of cards.
            `-mx-6` with each row paying it back: a rule that stops at the card's padding reads as
            another box, which is the shape the concept trades away. */}
        <div className="-mx-6 border-t">
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

            const isRowSelected = selectedRowIds.includes(field.id)
            const isOpen = openRowId === field.id

            return (
              <div
                key={field.id}
                className={cn(
                  'border-b px-6 transition-colors',
                  isRowSelected && 'bg-primary/5',
                  isOpen && 'bg-muted/40',
                  // The excluded line stays legible — it is still a line on the receipt, and its
                  // own strip already says "not shared". A dashed border and a tinted card said it
                  // three more times.
                  isExcluded && !isOpen && 'opacity-60',
                )}
              >
                <div className="flex items-center gap-2 py-2">
                  {isSelecting && (
                    <label className="flex shrink-0 items-center">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[hsl(var(--primary))]"
                        data-testid={`select-line-${index}`}
                        checked={isRowSelected}
                        onChange={() => toggleRow(field.id)}
                      />
                      <span className="sr-only">
                        {currentItem.name || t('itemNamePlaceholder')}
                      </span>
                    </label>
                  )}

                  {/* Name and price are the receipt line. Borderless: a bordered box around each
                      is the "control array" the concept trades away — four lines of a bill became
                      eight bordered inputs stacked in four bordered cards. */}
                  <FormField
                    control={control}
                    name={`items.${index}.name`}
                    render={({ field }) => (
                      <FormItem className="min-w-0 flex-1 space-y-0">
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={t('itemNamePlaceholder')}
                            className={cn(
                              'h-8 border-0 bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-0',
                              isExcluded && 'line-through',
                            )}
                          />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  {/* Desktop, small group: the marks are individual targets in the row itself, as
                      the concept has them — "desktop rows are wide enough for individual targets
                      again". Past six people they stop fitting and the row falls back to the
                      stack-and-open form below. */}
                  {inlineMarks && (
                    <FormField
                      control={control}
                      name={`items.${index}.participantIds`}
                      render={({ field }) => (
                        <FormItem className="space-y-0">
                          <MarkRow
                            value={field.value || []}
                            onChange={(val) => {
                              field.onChange(val)
                              trigger('items')
                            }}
                            group={group}
                            activeUserId={activeUserId}
                            rowIndex={index}
                          />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={control}
                    name={`items.${index}.price`}
                    render={({ field }) => (
                      <FormItem className="w-[104px] shrink-0 space-y-0">
                        <FormControl>
                          <CalculatorInput
                            {...field}
                            placeholder="0.00"
                            className="h-8 w-full border-0 bg-transparent shadow-none"
                            inputClassName="h-8 border-0 bg-transparent px-0 text-right font-mono text-sm font-semibold tabular-nums shadow-none focus-visible:ring-0"
                            onValueChange={(val) => {
                              field.onChange(val)
                              trigger('items')
                              trigger('paidBy')
                            }}
                          />
                        </FormControl>
                        <FormMessage className="mt-1 pr-1 text-right text-xs" />
                      </FormItem>
                    )}
                  />

                  {inlineMarks && (
                    <span className="w-14 shrink-0 text-right">
                      <YourShare
                        currency={currency}
                        amount={perPersonAmount}
                        show={itemPrice > 0}
                        isMine={isMeInvolved}
                        withLabel={false}
                      />
                    </span>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-subtle-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => removeRow(index)}
                    type="button"
                    title={t('removeLine')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* The second line is the whole target. "Tap a row to change who" — one place to
                    aim at instead of a 36px icon button in the row's most crowded corner, and it
                    is the same strip that tells you who shares the line and what it costs you. */}
                {!inlineMarks && (
                  <button
                    type="button"
                    data-testid={`assign-row-${index}`}
                    aria-expanded={isOpen}
                    disabled={isSelecting}
                    onClick={() => setOpenRowId(isOpen ? null : field.id)}
                    className="flex w-full items-center gap-2 pb-2.5 pt-0.5 text-left disabled:opacity-100"
                  >
                    <ParticipantStack
                      participantIds={participantIds}
                      group={group}
                      activeUserId={activeUserId}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {summaryText}
                      {isOpen && participantIds.length > 1 && itemPrice > 0 && (
                        <>
                          {' · '}
                          {t('perHeadEach', {
                            amount: formatCurrency(
                              currency,
                              perPersonAmount,
                              locale,
                              true,
                            ),
                          })}
                        </>
                      )}
                    </span>
                    <YourShare
                      currency={currency}
                      amount={perPersonAmount}
                      show={itemPrice > 0}
                      isMine={isMeInvolved}
                      withLabel
                    />
                  </button>
                )}

                {isOpen && (
                  <FormField
                    control={control}
                    name={`items.${index}.participantIds`}
                    render={({ field }) => (
                      <FormItem className="space-y-0 pb-3">
                        <RowPicker
                          value={field.value || []}
                          onChange={(val) => {
                            field.onChange(val)
                            trigger('items')
                          }}
                          group={group}
                          activeUserId={activeUserId}
                          previousIds={
                            watchedItems[index - 1]?.participantIds ?? null
                          }
                          previousName={watchedItems[index - 1]?.name ?? ''}
                          rowIndex={index}
                        />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* The bar carries what is selected — how many lines and how much money — because "assign
            these to Bob" is a decision about an amount, not about a row count. */}
        {isSelecting && selectedIndexes.length > 0 && (
          <div
            data-testid="selection-bar"
            className="sticky bottom-2 z-20 flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 shadow-lg"
          >
            <span className="flex items-baseline gap-2 text-sm">
              <span className="font-medium">
                {t('selectedCount', { count: selectedIndexes.length })}
              </span>
              <Money
                currency={currency}
                amount={selectedTotal}
                fractions
                className="text-xs text-muted-foreground"
              />
            </span>
            <BulkAssign
              group={group}
              isDesktop={isDesktop}
              activeUserId={activeUserId}
              onApply={assignToSelected}
              label={t('assignSelected')}
            />
          </div>
        )}

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

/**
 * The list of people a line — or a batch of lines — is shared by.
 *
 * Extracted so the per-row picker and the bulk bar cannot drift apart: they are the same question
 * asked about a different number of lines, and a second copy would eventually answer it differently.
 */
function ParticipantChooser({
  value,
  onChange,
  group,
  activeUserId,
}: {
  value: string[]
  onChange: (val: string[]) => void
  group: Group
  activeUserId?: string | null
}) {
  const t = useTranslations('ExpenseForm.Itemization')
  const allSelected = value.length === group.participants.length

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center px-2 pb-2 border-b mb-1">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {t('splitAmong')}
        </span>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="h-auto p-1 text-xs text-primary hover:bg-primary/10"
          onClick={() =>
            onChange(allSelected ? [] : group.participants.map((p) => p.id))
          }
        >
          {allSelected ? t('clearAll') : t('selectAll')}
        </Button>
      </div>
      <div className="max-h-[300px] overflow-y-auto grid grid-cols-1 gap-1">
        {group.participants.map((participant) => {
          const isSelected = value.includes(participant.id)
          const isMe = !!activeUserId && participant.id === activeUserId

          return (
            <button
              key={participant.id}
              type="button"
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm transition-colors min-h-11',
                isSelected
                  ? 'bg-primary/5 font-medium text-primary'
                  : 'hover:bg-muted',
              )}
              onClick={() =>
                onChange(
                  isSelected
                    ? value.filter((id) => id !== participant.id)
                    : [...value, participant.id],
                )
              }
            >
              <span
                className={cn(
                  'w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0',
                  isSelected
                    ? 'bg-primary border-primary'
                    : 'border-muted-foreground/30 bg-background',
                )}
              >
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-primary-foreground stroke-[3]" />
                )}
              </span>
              <span className="truncate flex-1">
                {participant.name}
                {isMe && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({t('you')})
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Applies one set of people to every selected line at once.
 *
 * Its own draft state, and an explicit apply: picking people here is a decision about several rows,
 * so it should not start rewriting them on the first tap the way the per-row picker does.
 */
function BulkAssign({
  group,
  isDesktop,
  activeUserId,
  onApply,
  label,
}: {
  group: Group
  isDesktop: boolean
  activeUserId?: string | null
  onApply: (participantIds: string[]) => void
  label: string
}) {
  const t = useTranslations('ExpenseForm.Itemization')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(() =>
    group.participants.map((p) => p.id),
  )
  useMobilePopoverState(open, setOpen, isDesktop)

  const body = (
    <div className="space-y-2">
      <ParticipantChooser
        value={draft}
        onChange={setDraft}
        group={group}
        activeUserId={activeUserId}
      />
      <Button
        type="button"
        className="w-full"
        data-testid="bulk-assign-apply"
        onClick={() => {
          onApply(draft)
          setOpen(false)
        }}
      >
        {label}
      </Button>
    </div>
  )

  const trigger = (
    <Button type="button" size="sm" className="h-8" data-testid="bulk-assign">
      <Users className="mr-1.5 h-3.5 w-3.5" />
      {label}
    </Button>
  )

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="end">
          {body}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{t('splitAmong')}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-8">{body}</div>
      </DrawerContent>
    </Drawer>
  )
}

/**
 * What the line costs you, in the right-hand column of every row.
 *
 * A dash when the line is not yours — the concept is explicit that the figure is *your* share and
 * not the group's per-head cost, so a line you are not on has to say so rather than quietly
 * showing what the people on it are each paying.
 */
function YourShare({
  currency,
  amount,
  show,
  isMine,
  withLabel,
}: {
  currency: Currency
  amount: number
  show: boolean
  isMine: boolean
  withLabel: boolean
}) {
  const t = useTranslations('ExpenseForm.Itemization')
  if (!show) return null
  if (!isMine)
    return (
      <span className="shrink-0 font-mono text-xs text-subtle-foreground">
        —
      </span>
    )
  return (
    <span className="flex shrink-0 items-baseline justify-end gap-1">
      {withLabel && (
        <span className="font-mono text-xs text-subtle-foreground">
          {t('yourShareShort')}
        </span>
      )}
      <Money
        currency={currency}
        amount={amount}
        fractions
        bold
        className="text-xs text-credit"
      />
    </span>
  )
}

/** One person's mark, as a target rather than a picture of them. */
function MarkTile({
  participant,
  isOn,
  isMe,
  size,
  onClick,
}: {
  participant: { id: string; name: string }
  isOn: boolean
  isMe: boolean
  size: 'row' | 'grid'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isOn}
      title={participant.name}
      className={cn(
        'grid shrink-0 place-items-center font-mono font-semibold uppercase transition-colors',
        size === 'row'
          ? 'h-7 w-7 rounded-md text-[9px]'
          : 'h-11 rounded-xl text-[10px]',
        isOn
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-subtle-foreground hover:bg-muted-foreground/20',
        isMe && 'ring-2 ring-inset ring-primary/30',
      )}
    >
      {participant.name.slice(0, 2)}
      <span className="sr-only">{participant.name}</span>
    </button>
  )
}

/** The marks inline in a desktop row: every person is their own target, no opening required. */
function MarkRow({
  value,
  onChange,
  group,
  activeUserId,
  rowIndex,
}: {
  value: string[]
  onChange: (val: string[]) => void
  group: Group
  activeUserId?: string | null
  rowIndex: number
}) {
  return (
    <span className="flex shrink-0 gap-1" data-testid={`marks-${rowIndex}`}>
      {group.participants.map((participant) => (
        <MarkTile
          key={participant.id}
          participant={participant}
          isOn={value.includes(participant.id)}
          isMe={!!activeUserId && participant.id === activeUserId}
          size="row"
          onClick={() =>
            onChange(
              value.includes(participant.id)
                ? value.filter((id) => id !== participant.id)
                : [...value, participant.id],
            )
          }
        />
      ))}
    </span>
  )
}

/**
 * The picker that opens inside the row.
 *
 * Presets first, because the three answers people actually give — everyone, nobody, the same as
 * the line above — are three quarters of the taps. Then the marks as a grid of 44px targets, and
 * the consequence restated underneath so you watch your own share move while you are choosing,
 * rather than finding out after saving.
 */
function RowPicker({
  value,
  onChange,
  group,
  activeUserId,
  previousIds,
  previousName,
  rowIndex,
}: {
  value: string[]
  onChange: (val: string[]) => void
  group: Group
  activeUserId?: string | null
  previousIds: string[] | null
  previousName: string
  rowIndex: number
}) {
  const t = useTranslations('ExpenseForm.Itemization')
  const allIds = group.participants.map((p) => p.id)
  const isEveryone = value.length === allIds.length && allIds.length > 0
  const canCopyPrevious = !!previousIds && previousIds.length > 0

  const preset = (
    label: string,
    isOn: boolean,
    onClick: () => void,
    testId: string,
  ) => (
    <button
      key={testId}
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs transition-colors',
        isOn
          ? 'border-primary bg-primary/10 font-medium text-primary'
          : 'border-input text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  )

  return (
    <div data-testid={`row-picker-${rowIndex}`}>
      <div className="flex flex-wrap gap-1.5">
        {preset(
          t('sharedByEveryone'),
          isEveryone,
          () => onChange(allIds),
          `preset-everyone-${rowIndex}`,
        )}
        {preset(
          t('notShared'),
          value.length === 0,
          () => onChange([]),
          `preset-none-${rowIndex}`,
        )}
        {canCopyPrevious &&
          preset(
            previousName
              ? t('sameAsNamed', { name: previousName })
              : t('sameAsAbove'),
            false,
            () => onChange(previousIds),
            `preset-same-${rowIndex}`,
          )}
      </div>

      <div className="mt-2 grid grid-cols-6 gap-1.5 lg:grid-cols-8">
        {group.participants.map((participant) => (
          <MarkTile
            key={participant.id}
            participant={participant}
            isOn={value.includes(participant.id)}
            isMe={!!activeUserId && participant.id === activeUserId}
            size="grid"
            onClick={() =>
              onChange(
                value.includes(participant.id)
                  ? value.filter((id) => id !== participant.id)
                  : [...value, participant.id],
              )
            }
          />
        ))}
      </div>
    </div>
  )
}
