import { Metadata } from 'next'
import { PaymentPageClient } from './page.client'

export const metadata: Metadata = {
  title: 'Record a payment',
}

export default async function RecordPaymentPage() {
  return <PaymentPageClient />
}
