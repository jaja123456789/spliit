'use client'

import { PaymentOptionButton } from '@/components/payment-option-button'
import { SheetHeader } from '@/components/sheet-header'
import { Button } from '@/components/ui/button'
import { CalculatorInput } from '@/components/ui/calculator-input'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { readActiveUser } from '@/lib/active-user'
import { Currency } from '@/lib/currency'
import { PaymentProfile, getPaymentOptions } from '@/lib/payment-links'
import {
  formatAmountAsDecimal,
  formatCurrency,
  getCurrencyFromGroup,
  toDateInputValue,
  todayAsDateOnly,
} from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { Loader2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ReactNode, useEffect, useState } from 'react'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>

const todayAsInputValue = () => toDateInputValue(todayAsDateOnly())

/**
 * Recording money that has already moved — and, right beside it, the way to move it.
 *
 * This used to be a query string into the expense form —
 * `?reimbursement=yes&from=…&to=…&amount=…` — which meant the screen for settling up was the screen
 * for adding an expense, wearing a flag. It carried a split control, itemisation, categories,
 * recurrence and document attachments, none of which mean anything for a payment, and the field
 * that made it a payment at all was a checkbox inside "More options".
 *
 * The sheet answers two different questions, so it has two sections. **Paying** leaves the app for
 * Venmo or PayPal and settles nothing here; **recording** is bookkeeping for money that has already
 * moved. The pay-with handles used to be chips on a balance row, where they were a fifth thing
 * competing for one line and nobody discovered that Spliit could open Venmo at all.
 *
 * The amount is the sheet's figure and stays editable, because a part-payment is ordinary.
 *
 * It still writes an ordinary expense with `isReimbursement`, so there is no migration and every
 * balance calculation already understands it.
 */
export function PaymentForm({ group }: { group: Group }) {
  const t = useTranslations('Payment')
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const utils = trpc.useUtils()
  const { mutateAsync } = trpc.groups.expenses.create.useMutation()

  const currency: Currency = getCurrencyFromGroup(group)
  const participants = group.participants

  // Prefilled by the Settle pill, which knows who owes whom and how much. Amounts arrive in minor
  // units, because that is what balances are computed in.
  const prefilledAmount = searchParams.get('amount')
  const isPrefilled = !!searchParams.get('from')
  const [from, setFrom] = useState(
    () => searchParams.get('from') ?? participants[0]?.id ?? '',
  )
  const [to, setTo] = useState(
    () => searchParams.get('to') ?? participants[1]?.id ?? '',
  )
  const [amount, setAmount] = useState(() =>
    prefilledAmount
      ? formatAmountAsDecimal(Number(prefilledAmount) || 0, currency)
      : '',
  )
  const [date, setDate] = useState(todayAsInputValue)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Without a prefill, default to the reader paying someone else — the overwhelmingly common case
  // for a payment you are recording yourself.
  useEffect(() => {
    if (searchParams.get('from')) return
    const active = readActiveUser(group.id)
    if (!active) return
    setFrom(active)
    setTo((current) =>
      current === active
        ? participants.find((p) => p.id !== active)?.id ?? current
        : current,
    )
  }, [group.id, participants, searchParams])

  const nameOf = (id: string) =>
    participants.find((p) => p.id === id)?.name ?? ''
  const fromName = nameOf(from)
  const toName = nameOf(to)

  // Minor units, to match what `getPaymentOptions` and the balances both work in. A typed "30"
  // means 30.00, so it has to be scaled the same way the expense form scales it.
  const amountInMinorUnits = Math.round(
    (Number(amount) || 0) * 10 ** currency.decimal_digits,
  )
  // Only handles the recipient has actually filled in appear; an empty profile yields nothing, and
  // then the sheet is purely about recording.
  const paymentOptions =
    from === to
      ? []
      : getPaymentOptions(
          participants.find((p) => p.id === to)
            ?.paymentProfile as PaymentProfile | null,
          amountInMinorUnits,
          currency,
          fromName
            ? t('defaultTitle', { from: fromName, to: toName })
            : 'Spliit',
        )

  const submit = async () => {
    if (from === to) {
      setError(t('sameParticipant'))
      return
    }
    setError(null)
    setIsSaving(true)

    await mutateAsync({
      groupId: group.id,
      participantId: from,
      expenseFormValues: {
        title: t('defaultTitle', { from: fromName, to: toName }),
        expenseDate: new Date(date),
        category: 1,
        paidBy: [{ participant: from, amount: Number(amount) || 0 }],
        paidFor: [{ participant: to, shares: '1' as any }],
        splitMode: 'EVENLY',
        isReimbursement: true,
        saveDefaultSplittingOptions: false,
        recurrenceRule: 'NONE',
        documents: [],
        notes,
        items: [],
      } as any,
    })
    // Every query about the group, the Payments list included — it is its own query, and without
    // this the sheet saved, the balances moved, and the list still said there were none.
    utils.groups.invalidate()
    router.push(`/groups/${group.id}/balances`)
  }

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    // Deliberately not react-hook-form: four fields, no cross-field arithmetic, and `SubmitButton`
    // would need a form context this screen has no other use for.
    submit().catch(() => setIsSaving(false))
  }

  return (
    <form onSubmit={onSubmit}>
      <Card bleed className="mb-4">
        <SheetHeader
          label={t('amount')}
          figure={
            // The same amount idiom as the expense form: the currency on a plate beside the field
            // rather than inside it, so the caret never lands on the symbol.
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-lg font-semibold text-muted-foreground">
                {currency.symbol || group.currency}
              </span>
              <div className="min-w-0 flex-1 rounded-md border border-input p-0.5 transition-colors focus-within:border-primary">
                <Label htmlFor="payment-amount" className="sr-only">
                  {t('amount')}
                </Label>
                <CalculatorInput
                  id="payment-amount"
                  data-testid="payment-amount"
                  name="paymentAmount"
                  value={amount}
                  onValueChange={setAmount}
                  className="h-11 sm:h-10 w-full border-0 bg-transparent shadow-none"
                  inputClassName="h-11 sm:h-10 w-full border-0 bg-transparent px-2.5 text-2xl sm:text-2xl font-extrabold tracking-tight tabular-nums shadow-none focus-visible:ring-0"
                />
              </div>
            </div>
          }
          context={
            isPrefilled && fromName && toName
              ? `${fromName} → ${toName} · ${t('suggested')}`
              : t('description')
          }
        />

        <CardContent className="px-0 pb-0">
          <PickRow label={t('from')} htmlFor="payment-from">
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger
                id="payment-from"
                data-testid="payment-from"
                className="h-11 sm:h-8 border-0 bg-transparent px-0 font-medium shadow-none focus:ring-0 focus:ring-offset-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {participants.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PickRow>

          <PickRow label={t('to')} htmlFor="payment-to">
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger
                id="payment-to"
                data-testid="payment-to"
                className="h-11 sm:h-8 border-0 bg-transparent px-0 font-medium shadow-none focus:ring-0 focus:ring-offset-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {participants.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PickRow>
        </CardContent>

        {/* Paying leaves the app. It is offered first because it is the step that has to happen
            before there is anything to record — and it is skipped entirely by anyone settling a
            payment that already happened. */}
        {paymentOptions.length > 0 && (
          <>
            <SectionRule>{t('payNow', { name: toName })}</SectionRule>
            <div
              className="flex flex-col gap-2 px-4 sm:px-6"
              data-testid="pay-with-options"
            >
              {paymentOptions.map((option, index) => (
                <PaymentOptionButton key={index} option={option} />
              ))}
            </div>
            <p className="px-4 pt-2 text-xs text-subtle-foreground sm:px-6">
              {t('payNowHint', {
                amount: formatCurrency(currency, amountInMinorUnits, locale),
                name: toName,
              })}
            </p>
          </>
        )}

        <SectionRule>{t('alreadyPaid')}</SectionRule>
        <CardContent className="px-0 pb-0">
          <PickRow label={t('date')} htmlFor="payment-date">
            <Input
              id="payment-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-11 sm:h-8 border-0 bg-transparent px-0 font-medium shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </PickRow>
          <PickRow label={t('notes')} htmlFor="payment-notes">
            <Input
              id="payment-notes"
              placeholder={t('notesPlaceholder')}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="h-11 sm:h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </PickRow>
        </CardContent>

        <CardContent className="flex flex-col gap-3 px-4 pt-4 pb-4 sm:px-6 sm:pb-6">
          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}
          <Button type="submit" disabled={isSaving} data-testid="payment-save">
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaving ? t('saving') : t('save')}
          </Button>
          <Button variant="ghost" asChild>
            <Link href={`/groups/${group.id}/balances`}>{t('cancel')}</Link>
          </Button>
        </CardContent>
      </Card>
    </form>
  )
}

/** A ruled row whose right-hand side is a control: label, value, rule. */
const PickRow = ({
  label,
  htmlFor,
  children,
}: {
  label: ReactNode
  htmlFor: string
  children: ReactNode
}) => (
  <div className="flex items-center gap-3 border-b px-4 py-2 sm:px-6">
    <Label
      htmlFor={htmlFor}
      // Wide enough for "Who received it" on one line; a longer locale wraps, and the row is
      // centred so it stays tidy when it does.
      className="w-32 shrink-0 text-sm font-normal leading-tight text-muted-foreground"
    >
      {label}
    </Label>
    <div className="min-w-0 flex-1">{children}</div>
  </div>
)

const SectionRule = ({ children }: { children: ReactNode }) => (
  <div className="px-4 pt-5 pb-2 sm:px-6">
    <h3 className="section-label">{children}</h3>
  </div>
)
