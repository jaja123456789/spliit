import { Button } from '@/components/ui/button'
import { Reimbursement } from '@/lib/balances'
import { Currency } from '@/lib/currency'
import { getPaymentLinks } from '@/lib/payment-links'
import { formatCurrency } from '@/lib/utils'
import { Participant } from '@prisma/client'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'


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

        // Ensure we cast paymentProfile to any or PaymentProfile type depending on your Prisma types generation
        const paymentLinks = getPaymentLinks(
          (toParticipant?.paymentProfile as any), 
          reimbursement.amount,
          currency,
          `Reimbursement from ${fromName}`
        )

        return (
          <div
            className="py-4 flex flex-col gap-2 border-b last:border-0"
            key={`${reimbursement.from}-${reimbursement.to}`}
          >
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1 items-start sm:flex-row sm:items-baseline sm:gap-4">
                <div>
                  {t.rich('owes', {
                    from: fromName,
                    to: toName,
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
                </div>
                {/* Mark as paid button */}
                <Button variant="link" asChild className="-mx-4 -my-3 h-auto p-2">
                  <Link
                    href={`/groups/${groupId}/expenses/create?reimbursement=yes&from=${reimbursement.from}&to=${reimbursement.to}&amount=${reimbursement.amount}`}
                  >
                    {t('markAsPaid')}
                  </Link>
                </Button>
              </div>
              <div className="font-semibold">
                {formatCurrency(currency, reimbursement.amount, locale)}
              </div>
            </div>

            {/* NEW: Payment Links Row */}
            {paymentLinks.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-1">
                <span className="text-xs text-muted-foreground self-center">Pay with:</span>
                {paymentLinks.map((link) => (
                  <Button
                    key={link.provider}
                    size="sm"
                    className={`h-7 text-xs px-3 ${link.bgColor} ${link.textColor} hover:opacity-90 border-none`}
                    asChild
                  >
                    <a href={link.url} target="_blank" rel="noopener noreferrer">
                      {link.provider}
                      <ExternalLink className="w-3 h-3 ml-1.5 opacity-70" />
                    </a>
                  </Button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}