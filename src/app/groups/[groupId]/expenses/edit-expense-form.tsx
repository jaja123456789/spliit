'use client'
import { Button } from '@/components/ui/button'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExpenseComments } from './expense-comments'
import { ExpenseForm } from './expense-form'
import { useDeleteExpense } from './use-delete-expense'

export function EditExpenseForm({
  groupId,
  expenseId,
  runtimeFeatureFlags,
}: {
  groupId: string
  expenseId: string
  runtimeFeatureFlags: RuntimeFeatureFlags
}) {
  const { data: groupData } = trpc.groups.get.useQuery({ groupId })
  const group = groupData?.group

  const { data: categoriesData } = trpc.categories.list.useQuery()
  const categories = categoriesData?.categories

  const { data: expenseData, error: expenseError } =
    trpc.groups.expenses.get.useQuery(
      { groupId, expenseId },
      // Not found is an answer, not a hiccup: retrying it only delays saying so.
      {
        retry: (count, error) => error.data?.code !== 'NOT_FOUND' && count < 3,
      },
    )
  const expense = expenseData?.expense
  const t = useTranslations('ExpenseForm.NotFound')

  const { mutateAsync: updateExpenseMutateAsync } =
    trpc.groups.expenses.update.useMutation()
  const deleteExpense = useDeleteExpense(groupId)

  const utils = trpc.useUtils()
  const router = useRouter()

  // Deleted by someone else, or a stale link from a notification or the activity feed. This used to
  // render nothing at all, under the header, for good.
  if (expenseError?.data?.code === 'NOT_FOUND') {
    return (
      <div
        className="mx-auto max-w-md px-4 py-16 text-center"
        data-testid="expense-not-found"
      >
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('description')}</p>
        <Button asChild className="mt-6">
          <Link href={`/groups/${groupId}/expenses`}>{t('link')}</Link>
        </Button>
      </div>
    )
  }

  if (!group || !categories || !expense) return null

  return (
    <>
      <ExpenseForm
        group={group}
        expense={expense}
        categories={categories}
        onSubmit={async (expenseFormValues, participantId) => {
          await updateExpenseMutateAsync({
            expenseId,
            groupId,
            expenseFormValues,
            participantId,
          })
          // The whole group: totals, Stats, Balances and Activity all moved with this expense.
          utils.groups.invalidate()
          router.push(`/groups/${group.id}`)
        }}
        onDelete={async (participantId) => {
          // Offers Undo in a toast, which stays up on the list this goes back to.
          await deleteExpense({
            expenseId,
            title: expense.title,
            participantId,
          })
          router.push(`/groups/${group.id}`)
        }}
        runtimeFeatureFlags={runtimeFeatureFlags}
      />
      {/* Beside the form, not in it: a form inside a form is not one. */}
      <ExpenseComments groupId={groupId} expenseId={expenseId} />
    </>
  )
}
