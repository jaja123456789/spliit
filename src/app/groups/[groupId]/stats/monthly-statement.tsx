'use client'
import { BalancesList } from '@/app/groups/[groupId]/balances-list'
import { Money } from '@/components/money'
import { SheetHeader } from '@/components/sheet-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MonthlyStatement, statementToCsv } from '@/lib/statement'
import {
  formatAmountAsDecimal,
  formatDateOnly,
  getCurrencyFromGroup,
} from '@/lib/utils'
import { Download } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCurrentGroup } from '../current-group-context'
import { monthLabel } from './stats-month'

/**
 * A month as a household settles it: who paid, who consumed what, the payments made, and where
 * everyone stood when it closed — with the whole thing, every line included, as a CSV.
 */
export function MonthlyStatementCard({
  month,
  statement,
}: {
  month: string
  statement: MonthlyStatement
}) {
  const t = useTranslations('Stats.Statement')
  const locale = useLocale()
  const { groupId, group } = useCurrentGroup()
  if (!group) return null
  const currency = getCurrencyFromGroup(group)
  const label = monthLabel(month, locale)

  const exportCsv = () => {
    const csv = statementToCsv(statement, {
      groupName: group.name,
      month,
      currencyCode: currency.code || group.currency,
      format: (minorUnits) => formatAmountAsDecimal(minorUnits, currency),
    })
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `${group.name.replace(
      /[^\p{L}\p{N}]+/gu,
      '-',
    )}-${month}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const closing = Object.fromEntries(
    statement.participants.map((p) => [
      p.id,
      { paid: 0, paidFor: 0, total: p.closingBalance },
    ]),
  )

  return (
    <Card bleed data-testid="monthly-statement">
      <SheetHeader
        // No figure: the month's total heads the page just above.
        label={t('title', { month: label })}
        context={t('count', { count: statement.expenseCount })}
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            {t('export')}
          </Button>
        }
      />
      <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
        {/* Smaller figures on a phone, so four columns leave a name its width. */}
        <table
          className="w-full text-sm [&_td_span]:text-xs sm:[&_td_span]:text-sm"
          data-testid="statement-people"
        >
          <thead>
            <tr className="text-xs text-subtle-foreground">
              <th className="py-2 text-left font-medium">{t('person')}</th>
              <th className="py-2 text-right font-medium">{t('paid')}</th>
              <th className="py-2 text-right font-medium">{t('share')}</th>
              <th className="py-2 text-right font-medium">{t('net')}</th>
            </tr>
          </thead>
          <tbody>
            {statement.participants.map((person) => (
              <tr key={person.id} className="border-t">
                <td className="break-words py-2.5 pr-2">{person.name}</td>
                <td className="py-2.5 text-right">
                  <Money currency={currency} amount={person.paid} />
                </td>
                <td className="py-2.5 text-right">
                  <Money currency={currency} amount={person.share} />
                </td>
                <td className="py-2.5 pl-2 text-right">
                  <Money
                    currency={currency}
                    amount={person.net}
                    signed
                    colored
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="section-label pb-2 pt-6">{t('payments')}</h3>
        {statement.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noPayments')}</p>
        ) : (
          <ul
            className="flex flex-col text-sm"
            data-testid="statement-payments"
          >
            {statement.payments.map((payment) => (
              <li
                key={payment.id}
                className="flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0"
              >
                <span className="min-w-0 truncate">
                  {payment.from} → {payment.to}
                  <span className="ml-2 text-xs text-subtle-foreground">
                    {formatDateOnly(payment.date, locale, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </span>
                <Money currency={currency} amount={payment.amount} />
              </li>
            ))}
          </ul>
        )}

        <h3 className="section-label pb-3 pt-6">
          {t('closing', { month: label })}
        </h3>
        <BalancesList
          balances={closing}
          participants={group.participants}
          currency={currency}
          groupId={groupId}
        />
      </CardContent>
    </Card>
  )
}
