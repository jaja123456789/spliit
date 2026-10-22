'use client'

import { ExpenseDocumentsInput } from '@/components/expense-documents-input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FormField } from '@/components/ui/form'
import { ExpenseFormValues } from '@/lib/schemas'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { useTranslations } from 'next-intl'
import { UseFormReturn } from 'react-hook-form'

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
