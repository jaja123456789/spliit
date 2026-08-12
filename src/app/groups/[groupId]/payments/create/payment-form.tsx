'use client'

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
import { Textarea } from '@/components/ui/textarea'
import { readActiveUser } from '@/lib/active-user'
import { Currency } from '@/lib/currency'
import { amountAsDecimal, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { Loader2, Save } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>

function todayAsInputValue() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

/**
 * Recording money that has already moved.
 *
 * This used to be a query string into the expense form —
 * `?reimbursement=yes&from=…&to=…&amount=…` — which meant the screen for settling up was the screen
 * for adding an expense, wearing a flag. It carried a split control, itemisation, categories,
 * recurrence and document attachments, none of which mean anything for a payment, and the field
 * that made it a payment at all was a checkbox inside "More options".
 *
 * Worse, that link only existed on a suggested-reimbursement row. In a settled group there were no
 * such rows, so there was no way to record a payment at all — which is exactly when you want to
 * record the one that settled it.
 *
 * It still writes an ordinary expense with `isReimbursement`, so there is no migration and every
 * balance calculation already understands it.
 */
export function PaymentForm({ group }: { group: Group }) {
  const t = useTranslations('Payment')
  const router = useRouter()
  const searchParams = useSearchParams()
  const utils = trpc.useUtils()
  const { mutateAsync } = trpc.groups.expenses.create.useMutation()

  const currency: Currency = getCurrencyFromGroup(group)
  const participants = group.participants

  // Prefilled by the Settle pill, which knows who owes whom and how much. Amounts arrive in minor
  // units, because that is what balances are computed in.
  const prefilledAmount = searchParams.get('amount')
  const [from, setFrom] = useState(
    () => searchParams.get('from') ?? participants[0]?.id ?? '',
  )
  const [to, setTo] = useState(
    () => searchParams.get('to') ?? participants[1]?.id ?? '',
  )
  const [amount, setAmount] = useState(() =>
    prefilledAmount
      ? String(amountAsDecimal(Number(prefilledAmount) || 0, currency))
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

  const submit = async () => {
    if (from === to) {
      setError(t('sameParticipant'))
      return
    }
    setError(null)
    setIsSaving(true)
    const fromName = participants.find((p) => p.id === from)?.name ?? ''
    const toName = participants.find((p) => p.id === to)?.name ?? ''

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
    utils.groups.expenses.invalidate()
    utils.groups.balances.invalidate()
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
      <Card className="mb-4">
        <CardContent className="grid gap-5 pt-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {t('title')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('description')}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="payment-from">{t('from')}</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger id="payment-from" data-testid="payment-from">
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
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="payment-to">{t('to')}</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger id="payment-to" data-testid="payment-to">
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
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="payment-amount">{t('amount')}</Label>
            <CalculatorInput
              id="payment-amount"
              data-testid="payment-amount"
              name="paymentAmount"
              value={amount}
              onValueChange={setAmount}
              inputClassName="font-mono tabular-nums"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="payment-date">{t('date')}</Label>
            <Input
              id="payment-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="payment-notes">{t('notes')}</Label>
            <Textarea
              id="payment-notes"
              placeholder={t('notesPlaceholder')}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          {error && (
            <p className="sm:col-span-2 text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          <div className="sm:col-span-2 flex gap-2">
            <Button
              type="submit"
              className="flex-1 sm:flex-none"
              disabled={isSaving}
              data-testid="payment-save"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('saving')}
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {t('save')}
                </>
              )}
            </Button>
            <Button variant="ghost" asChild>
              <Link href={`/groups/${group.id}/balances`}>{t('cancel')}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
