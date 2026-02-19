'use client'

import { Button } from '@/components/ui/button'
import { Reimbursement } from '@/lib/balances'
import { Currency } from '@/lib/currency'
import { getPaymentOptions, PaymentOption } from '@/lib/payment-links'
import { formatCurrency } from '@/lib/utils'
import { Participant } from '@prisma/client'
import { Check, Copy, ExternalLink, Landmark, Smartphone } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'

type Props = {
  reimbursements: Reimbursement[]
  participants: Participant[]
  currency: Currency
  groupId: string
}

export function ReimbursementList({
  reimbursements,
  participants,
  currency,
  groupId,
}: Props) {
  const locale = useLocale()
  const t = useTranslations('Balances.Reimbursements')
  if (reimbursements.length === 0) {
    return (
      <p className="text-sm pb-6" data-testid="no-reimbursements">
        {t('noImbursements')}
      </p>
    )
  }

  const getParticipant = (id: string) => participants.find((p) => p.id === id)
  return (
    <div className="text-sm" data-testid="reimbursements-list">
      {reimbursements.map((reimbursement) => {
        const fromParticipant = getParticipant(reimbursement.from)
        const toParticipant = getParticipant(reimbursement.to)

        const fromName = fromParticipant?.name ?? ''
        const toName = toParticipant?.name ?? ''

        const paymentOptions = getPaymentOptions(
          toParticipant?.paymentProfile as any,
          reimbursement.amount,
          currency,
          `Reimbursement from ${fromName}`,
        )

        return (
          <div
            className="py-4 flex flex-col gap-2 border-b last:border-0"
            key={`${reimbursement.from}-${reimbursement.to}`}
          >
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1 items-start sm:flex-row sm:items-center sm:gap-4 w-full">
                <div>
                  {t.rich('owes', {
                    from: fromName,
                    to: toName,
                    strong: (chunks) => (
                      <strong className="font-semibold text-foreground">
                        {chunks}
                      </strong>
                    ),
                  })}
                </div>
                {/* Mark as paid button */}
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-7 text-xs gap-1 sm:ml-auto"
                >
                  <Link
                    href={`/groups/${groupId}/expenses/create?reimbursement=yes&from=${reimbursement.from}&to=${reimbursement.to}&amount=${reimbursement.amount}`}
                  >
                    <Check className="w-3 h-3" />
                    {t('markAsPaid')}
                  </Link>
                </Button>
              </div>
              <div className="font-semibold ml-4">
                {formatCurrency(currency, reimbursement.amount, locale)}
              </div>
            </div>

            {/* Payment Links Row */}
            {paymentOptions.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-1">
                <span className="text-xs text-muted-foreground self-center">
                  Pay with:
                </span>
                {paymentOptions.map((opt, idx) => (
                  <PaymentOptionButton key={idx} option={opt} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// FIX: Removed dynamic variable assignment.
// Uses direct returns to satisfy "static-components" linter rule.
function PaymentOptionIcon({
  option,
  copied,
  className,
}: {
  option: PaymentOption
  copied: boolean
  className?: string
}) {
  if (option.type === 'link') {
    return <ExternalLink className={className} />
  }

  if (copied) {
    return <Check className={className} />
  }

  if (option.icon === 'phone') {
    return <Smartphone className={className} />
  }

  if (option.icon === 'landmark') {
    return <Landmark className={className} />
  }

  return <Copy className={className} />
}

function PaymentOptionButton({ option }: { option: PaymentOption }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(option.value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const classes = `h-7 text-xs px-3 ${option.bgColor} ${option.textColor} hover:opacity-90 border-none transition-all`
  const iconClasses = 'w-3 h-3 ml-1.5 opacity-70'

  const content = (
    <>
      {option.label}
      <PaymentOptionIcon
        option={option}
        copied={copied}
        className={iconClasses}
      />
    </>
  )

  if (option.type === 'link') {
    return (
      <Button size="sm" className={classes} asChild>
        <a href={option.value} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      </Button>
    )
  }

  return (
    <Button size="sm" className={classes} onClick={handleCopy}>
      {content}
    </Button>
  )
}
