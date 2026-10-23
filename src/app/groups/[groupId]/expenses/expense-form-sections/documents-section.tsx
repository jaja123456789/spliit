'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FormField } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/skeleton'
import { ExpenseFormValues } from '@/lib/schemas'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { UseFormReturn } from 'react-hook-form'

// Loaded on demand: it carries `next-s3-upload`'s client, and with it the AWS SDK (~100 KB gzipped),
// which no one should download unless document storage is configured and this section is shown.
const ExpenseDocumentsInput = dynamic(
  () =>
    import('@/components/expense-documents-input').then(
      (m) => m.ExpenseDocumentsInput,
    ),
  { ssr: false, loading: () => <Skeleton className="h-24 w-full" /> },
)

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>
type Form = UseFormReturn<ExpenseFormValues>
type Wording = 'Expense' | 'Income'

/** Receipts and other files attached to the expense. Only where document storage is configured. */
export function DocumentsSection({
  form,
  sExpense,
}: {
  form: Form
  sExpense: Wording
}) {
  const t = useTranslations('ExpenseForm')
  return (
    <Card bleed className="mt-4">
      <CardHeader>
        <CardTitle className="flex justify-between">
          <span>{t('attachDocuments')}</span>
        </CardTitle>
        <CardDescription>{t(`${sExpense}.attachDescription`)}</CardDescription>
      </CardHeader>
      <CardContent>
        <FormField
          control={form.control}
          name="documents"
          render={({ field }) => (
            <ExpenseDocumentsInput
              documents={field.value}
              updateDocuments={field.onChange}
            />
          )}
        />
      </CardContent>
    </Card>
  )
}
