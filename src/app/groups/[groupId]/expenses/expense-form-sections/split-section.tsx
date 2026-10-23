'use client'

import { ItemizationBuilder } from '@/app/groups/[groupId]/expenses/itemization-builder'
import { SplitRows } from '@/app/groups/[groupId]/expenses/split-rows'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Label } from '@/components/ui/label'
import { Currency } from '@/lib/currency'
import { ExpenseFormValues } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  FieldArrayWithId,
  UseFieldArrayAppend,
  UseFieldArrayRemove,
  UseFormReturn,
} from 'react-hook-form'
import { match } from 'ts-pattern'
import { PaidForList } from './paid-for-list'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>
type Form = UseFormReturn<ExpenseFormValues>
type Wording = 'Expense' | 'Income'

type SplitControl = 'EVENLY' | 'ITEMS' | 'OTHER'

function useSplitModeLabels() {
  const t = useTranslations('ExpenseForm')

  /**
   * Short names for the overflow modes. The `SplitModeField.*` strings say "Unevenly – By shares",
   * a prefix that existed to group them inside a Select; in a sheet headed "How to split" it is
   * noise, and it does not fit on a chip. Those strings are left alone — they are translated in 22
   * other locales and asserted on by the e2e suite.
   */
  const shortSplitModeLabel = (mode: string) =>
    match(mode)
      .with('BY_SHARES', () => t('SplitMode.byShares'))
      .with('BY_PERCENTAGE', () => t('SplitMode.byPercentage'))
      .with('BY_AMOUNT', () => t('SplitMode.byAmount'))
      .otherwise(() => t('SplitMode.more'))

  /** What the chosen mode asks of you, for the line under the control. */
  const splitModeHint = (mode: string) =>
    match(mode)
      .with('BY_SHARES', () => t('SplitMode.bySharesHint'))
      .with('BY_PERCENTAGE', () => t('SplitMode.byPercentageHint'))
      .with('BY_AMOUNT', () => t('SplitMode.byAmountHint'))
      .otherwise(() => t('SplitMode.description'))

  return { shortSplitModeLabel, splitModeHint }
}

/** How the money divides: the three-way control and whatever the chosen position asks for. */
export function SplitSection({
  form,
  group,
  splitControl,
  splitMode,
  onSelect,
  onOpenSheet,
  expenseCurrency,
  totalAmount,
  effectiveTotal,
  manuallyEditedParticipants,
  setManuallyEditedParticipants,
  recalculateByAmount,
  activeUserId,
  isItemized,
  itemFields,
  itemAppend,
  itemRemove,
}: {
  form: Form
  group: Group
  splitControl: SplitControl
  splitMode: ExpenseFormValues['splitMode']
  onSelect: (next: SplitControl, mode?: string) => void
  onOpenSheet: () => void
  expenseCurrency: Currency
  totalAmount: number
  effectiveTotal: number
  manuallyEditedParticipants: Set<string>
  setManuallyEditedParticipants: (s: Set<string>) => void
  recalculateByAmount: (total: number, paidFor: any, edited: Set<string>) => any
  activeUserId: string | null
  isItemized: boolean
  itemFields: FieldArrayWithId<ExpenseFormValues, 'items', 'id'>[]
  itemAppend: UseFieldArrayAppend<ExpenseFormValues, 'items'>
  itemRemove: UseFieldArrayRemove
}) {
  const t = useTranslations('ExpenseForm')
  const { shortSplitModeLabel, splitModeHint } = useSplitModeLabels()

  return (
    <div className="px-6 py-3" data-testid="split-control">
      <Label className="text-sm font-normal text-muted-foreground">
        {t('SplitMode.title')}
      </Label>
      <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
        {(
          [
            ['EVENLY', 'evenly', t('SplitMode.evenly')],
            ['ITEMS', 'items', t('SplitMode.byItem')],
          ] as const
        ).map(([value, testId, label]) => (
          <button
            key={value}
            type="button"
            data-testid={`split-mode-${testId}`}
            aria-pressed={splitControl === value}
            onClick={() => onSelect(value)}
            className={cn(
              'min-h-11 rounded-md px-2 text-sm font-medium transition-colors',
              splitControl === value
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          data-testid="split-mode-more"
          aria-pressed={splitControl === 'OTHER'}
          onClick={onOpenSheet}
          className={cn(
            'min-h-11 rounded-md px-2 text-sm font-medium transition-colors',
            splitControl === 'OTHER'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {/* Carries the chosen mode's name once one is active, so the third position
                        never reads as "something unspecified is going on". */}
          {splitControl === 'OTHER'
            ? shortSplitModeLabel(splitMode)
            : t('SplitMode.custom')}
        </button>
      </div>
      {splitControl !== 'EVENLY' && (
        <p className="mt-1.5 text-sm text-muted-foreground">
          {splitControl === 'ITEMS'
            ? t('itemizeField.description')
            : splitModeHint(splitMode)}
        </p>
      )}
      {/* The hint directly above says "enter each line of the receipt", and until now
                    this screen had no way to reach the thing that reads receipts — the scanner's
                    only entry point in the whole app was an icon in the expense list's header. The
                    itemised path is the one that most wants OCR, so it is the one that gets the
                    offer, and it fills the lines in place rather than navigating anywhere. */}
      {/* Evenly is most expenses, and who is in is the thing people actually change on
                    it. It used to live in a second card at the far end of a page one and a half
                    screens long; here it is under the control that decides it, each chip carrying
                    that person's share. */}
      {splitControl === 'OTHER' && (
        <div className="mt-2">
          <FormField
            control={form.control}
            name="paidFor"
            render={() => (
              <FormItem className="space-y-0">
                <PaidForList
                  form={form}
                  group={group}
                  expenseCurrency={expenseCurrency}
                  totalAmount={totalAmount}
                  splitMode={splitMode}
                  manuallyEditedParticipants={manuallyEditedParticipants}
                  setManuallyEditedParticipants={setManuallyEditedParticipants}
                  recalculateByAmount={recalculateByAmount}
                />
                <FormMessage className="mt-1" />
              </FormItem>
            )}
          />
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-1 h-auto min-h-11 px-0 text-xs font-normal text-muted-foreground"
            onClick={() => {
              const currentPaidFor = form.getValues('paidFor')
              const allSelected =
                currentPaidFor.length === group.participants.length
              const newPaidFor = allSelected
                ? []
                : group.participants.map((p) => {
                    const existing = currentPaidFor.find(
                      (pf) => pf.participant === p.id,
                    )
                    return {
                      participant: p.id,
                      shares: existing?.shares ?? '1',
                    }
                  })
              form.setValue('paidFor', newPaidFor as any, {
                shouldDirty: true,
                shouldTouch: true,
                shouldValidate: true,
              })
              if (!allSelected) {
                setManuallyEditedParticipants(new Set())
              }
            }}
          >
            {form.watch('paidFor').length === group.participants.length
              ? t('selectNone')
              : t('selectAll')}
          </Button>
        </div>
      )}
      {splitControl === 'EVENLY' && (
        <SplitRows
          form={form}
          group={group}
          currency={expenseCurrency}
          totalAmount={effectiveTotal}
          activeUserId={activeUserId}
        />
      )}
      {isItemized && (
        <div className="mt-3">
          <ItemizationBuilder
            group={group}
            currency={expenseCurrency}
            totalAmount={totalAmount}
            fields={itemFields}
            append={itemAppend}
            remove={itemRemove}
            activeUserId={activeUserId}
          />
        </div>
      )}
    </div>
  )
}

/**
 * The overflow half of the split control. A sheet rather than a menu: these are three mutually
 * exclusive answers to one question, and the question deserves a title.
 */
export function SplitModeSheet({
  open,
  onOpenChange,
  splitControl,
  splitMode,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  splitControl: SplitControl
  splitMode: ExpenseFormValues['splitMode']
  onSelect: (next: SplitControl, mode?: string) => void
}) {
  const t = useTranslations('ExpenseForm')
  const { shortSplitModeLabel } = useSplitModeLabels()

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent data-testid="split-mode-sheet">
        <DrawerHeader className="text-left">
          <DrawerTitle>{t('SplitMode.title')}</DrawerTitle>
          <DrawerDescription>{t('SplitMode.sheetHint')}</DrawerDescription>
        </DrawerHeader>
        {/* Rows big enough to hit, each saying what the mode actually does, and a way out that
                is not "guess that the backdrop is tappable". The first version was three bare
                12px-tall lines with no description and no dismiss. */}
        <div className="flex flex-col gap-2 px-4">
          {(['BY_SHARES', 'BY_PERCENTAGE', 'BY_AMOUNT'] as const).map(
            (mode) => {
              const active = splitControl === 'OTHER' && splitMode === mode
              const hint = match(mode)
                .with('BY_SHARES', () => t('SplitMode.bySharesHint'))
                .with('BY_PERCENTAGE', () => t('SplitMode.byPercentageHint'))
                .otherwise(() => t('SplitMode.byAmountHint'))
              return (
                <button
                  key={mode}
                  type="button"
                  data-testid={`split-mode-${mode}`}
                  onClick={() => {
                    onSelect('OTHER', mode)
                    onOpenChange(false)
                  }}
                  className={cn(
                    'flex min-h-16 items-center justify-between gap-3 rounded-md px-4 py-3 text-left transition-colors',
                    active
                      ? 'bg-muted ring-2 ring-inset ring-foreground'
                      : 'bg-muted hover:bg-muted-foreground/15',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-base font-medium">
                      {shortSplitModeLabel(mode)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {hint}
                    </span>
                  </span>
                  {active && (
                    <Check className="h-5 w-5 shrink-0 text-foreground" />
                  )}
                </button>
              )
            },
          )}
        </div>
        <DrawerFooter>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            {t('SplitMode.close')}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
