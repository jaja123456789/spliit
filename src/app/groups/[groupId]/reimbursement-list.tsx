'use client'

import { Money } from '@/components/money'
import { ProfileAvatar } from '@/components/profile-avatar'
import { Button } from '@/components/ui/button'
import { assignAvatarHues } from '@/lib/avatar-hue'
import { Reimbursement } from '@/lib/balances'
import { Currency } from '@/lib/currency'
import { useActiveUser } from '@/lib/hooks'
import { Participant } from '@prisma/client'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

type Props = {
  reimbursements: Reimbursement[]
  participants: Participant[]
  currency: Currency
  groupId: string
}

/**
 * The payments that would clear the group, one row each.
 *
 * The row used to be a sentence with a button under it and up to five brand-coloured chips beside
 * that — a paragraph and a toolbar for a fact that is three values wide. It is now the same row as
 * every other row on the sheet: mark, who, figure, action. The chips moved to the settle sheet,
 * where paying is one of the two things the screen exists for rather than a fifth thing on a line.
 *
 * "Bob → Alice" instead of "Bob owes Alice" because the arrow needs no translation, aligns down a
 * column and fits beside a figure; the one word that does get translated is your own name for
 * yourself.
 */
export function ReimbursementList({
  reimbursements,
  participants,
  currency,
  groupId,
}: Props) {
  const t = useTranslations('Balances.Reimbursements')
  const tBalances = useTranslations('Balances')
  const activeUserId = useActiveUser(groupId)
  const avatarHues = assignAvatarHues(participants.map((p) => p.name))

  if (reimbursements.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="no-reimbursements"
      >
        {t('noImbursements')}
      </p>
    )
  }

  const getParticipant = (id: string) => participants.find((p) => p.id === id)

  return (
    <div data-testid="reimbursements-list">
      {reimbursements.map((reimbursement) => {
        const fromParticipant = getParticipant(reimbursement.from)
        const toParticipant = getParticipant(reimbursement.to)

        const fromName = fromParticipant?.name ?? ''
        const toName = toParticipant?.name ?? ''

        return (
          <div
            // Dropped by 4943192 when payment links were added; three e2e assertions have been
            // looking for it ever since, on a suite that could not start to report it.
            data-testid={`reimbursement-row-${fromName}-${toName}`}
            className="flex items-center gap-3 py-3 border-b last:border-0"
            key={`${reimbursement.from}-${reimbursement.to}`}
          >
            <ProfileAvatar
              name={fromName}
              hue={avatarHues.get(fromName)}
              isActiveUser={activeUserId === reimbursement.from}
              size={32}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {fromName}
                <span className="text-subtle-foreground"> → </span>
                {activeUserId === reimbursement.to ? tBalances('you') : toName}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('suggested')}
              </div>
            </div>
            <Money currency={currency} amount={reimbursement.amount} bold />
            {/* Prefills the settle sheet rather than the expense form. Same three values,
                somewhere they mean something. */}
            {/* An outlined pill, not a filled one. Most rows on this sheet involve the reader, so
                a "this one is yours" fill made the whole list read as stacked calls to action and
                out-shouted the figures beside them. */}
            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-7 shrink-0 rounded-full border-primary px-3 text-xs text-primary hover:bg-primary/5 hover:text-primary"
            >
              <Link
                // A bare "Settle" repeated down a list tells a screen reader nothing about which
                // debt it settles, and the row's own text is not part of the link.
                aria-label={t('settleAria', { from: fromName, to: toName })}
                href={`/groups/${groupId}/payments/create?from=${reimbursement.from}&to=${reimbursement.to}&amount=${reimbursement.amount}`}
              >
                {t('settle')}
              </Link>
            </Button>
          </div>
        )
      })}
    </div>
  )
}
