'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentGroup } from '../../current-group-context'
import { PaymentForm } from './payment-form'

export function PaymentPageClient() {
  const { group } = useCurrentGroup()

  if (!group)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-40 w-full" />
      </div>
    )

  return <PaymentForm group={group} />
}
