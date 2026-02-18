'use client'
import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import { DocumentsCount } from '@/app/groups/[groupId]/expenses/documents-count'
import { Button } from '@/components/ui/button'
import { getGroupExpenses } from '@/lib/api'
import { getBalances } from '@/lib/balances'
import { Currency } from '@/lib/currency'
import { useActiveUser } from '@/lib/hooks'
import { cn, formatCurrency, formatDateOnly } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment } from 'react'

type Expense = Awaited<ReturnType<typeof getGroupExpenses>>[number]

function Participants({
  expense,
  participantCount,
}: {
  expense: Expense
  participantCount: number
}) {
  const t = useTranslations('ExpenseCard')
  const key = expense.amount > 0 ? 'paidBy' : 'receivedBy'

  // Handle multiple payers display
  let payerName = ''
  if (expense.paidBy.length === 1) {
    payerName = expense.paidBy[0].participant.name
  } else if (expense.paidBy.length > 1) {
    payerName = `${expense.paidBy[0].participant.name} & ${
      expense.paidBy.length - 1
    } more`
  } else {
    payerName = 'Unknown'
  }

  const paidFor =
    expense.paidFor.length == participantCount && participantCount >= 4 ? (
      <strong>{t('everyone')}</strong>
    ) : (
      expense.paidFor.map((paidFor, index) => (
        <Fragment key={index}>
          {index !== 0 && <>, </>}
          <strong>{paidFor.participant.name}</strong>
        </Fragment>
      ))
    )
  const participants = t.rich(key, {
    strong: (chunks) => <strong className="font-medium text-foreground">{chunks}</strong>,
    paidBy: payerName,
    paidFor: () => paidFor,
    forCount: expense.paidFor.length,
  })
  return <>{participants}</>
}

type Props = {
  expense: Expense
  currency: Currency
  groupId: string
  participantCount: number
}

export function ExpenseCard({
  expense,
  currency,
  groupId,
  participantCount,
}: Props) {
  const router = useRouter()
  const locale = useLocale()
  const activeUserId = useActiveUser(groupId)

  let userBalanceAmount = 0

  if (activeUserId && activeUserId !== 'None') {
    const balances = getBalances([expense])
    if (balances[activeUserId]) {
      userBalanceAmount = balances[activeUserId].total
    }
  }

  return (
    <div
      key={expense.id}
      data-testid={`expense-item-${expense.id}`}
      className={cn(
        'group relative flex justify-between px-4 sm:px-6 py-4 text-sm cursor-pointer transition-colors hover:bg-accent/50',
        'border-b last:border-b-0 sm:border sm:rounded-lg sm:mx-4 sm:my-1', // Clean standard borders
        expense.isReimbursement && 'italic bg-muted/20'
      )}
      onClick={() => {
        router.push(`/groups/${groupId}/expenses/${expense.id}/edit`)
      }}
    >
      <div className="flex items-start gap-3 flex-1 overflow-hidden">
        <CategoryIcon
          category={expense.category}
          className="w-8 h-8 p-1.5 rounded-full bg-secondary text-secondary-foreground shrink-0 mt-0.5"
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <div
              className={cn(
                'font-medium text-base truncate pr-2',
                expense.isReimbursement && 'italic text-muted-foreground'
              )}
              data-testid="expense-title"
            >
              {expense.title}
            </div>
            <div className="text-right shrink-0">
              <div
                className={cn(
                  'tabular-nums whitespace-nowrap text-base',
                  expense.isReimbursement ? 'italic font-normal' : 'font-bold'
                )}
                data-testid="expense-amount"
              >
                {formatCurrency(currency, expense.amount, locale)}
              </div>
            </div>
          </div>

          <div className="flex justify-between items-end mt-1">
            <div className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
              <Participants expense={expense} participantCount={participantCount} />
              
              {/* Contextual Balance Text - Colored text only, no card background */}
              {userBalanceAmount !== 0 && (
                <div className={cn(
                  "mt-1 font-medium",
                  userBalanceAmount > 0 ? "text-emerald-600 dark:text-emerald-500" : "text-orange-600 dark:text-orange-500"
                )}>
                  {userBalanceAmount > 0 ? "You lent " : "You borrowed "}
                  {formatCurrency(currency, Math.abs(userBalanceAmount), locale)}
                </div>
              )}
            </div>
            
            <div className="flex flex-col items-end gap-1 ml-2">
              <div
                className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium"
                data-testid="expense-date"
              >
                {formatDateOnly(expense.expenseDate, locale, { month: 'short', day: 'numeric' })}
              </div>
              <DocumentsCount count={expense._count.documents} />
            </div>
          </div>
        </div>
      </div>

      <div className="self-center pl-2 hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  )
}