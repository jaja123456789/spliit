'use client'
import { useToast } from '@/components/ui/use-toast'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { isNetworkError } from '@/lib/network-error'
import { enqueueExpense } from '@/lib/outbox'
import { randomId } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { ExpenseForm } from './expense-form'

export function CreateExpenseForm({
  groupId,
  runtimeFeatureFlags,
}: {
  groupId: string
  expenseId?: string
  runtimeFeatureFlags: RuntimeFeatureFlags
}) {
  const { data: groupData } = trpc.groups.get.useQuery({ groupId })
  const group = groupData?.group

  const { data: categoriesData } = trpc.categories.list.useQuery()
  const categories = categoriesData?.categories

  const searchParams = useSearchParams()
  // "Duplicate" on an expense opens this form as a copy of it.
  const duplicateOf = searchParams.get('duplicate')
  const { data: templateData, isError: templateMissing } =
    trpc.groups.expenses.get.useQuery(
      { groupId, expenseId: duplicateOf ?? '' },
      { enabled: !!duplicateOf, retry: false },
    )
  const template = duplicateOf ? templateData?.expense : undefined
  // Asked alongside the group, not by the shortcuts once the form is up: arriving half a second
  // later, they pushed the title field down under a finger already reaching for it.
  const { isPending: shortcutsPending } =
    trpc.groups.expenses.shortcuts.useQuery(
      { groupId },
      { enabled: !duplicateOf },
    )

  const { mutateAsync: createExpenseMutateAsync } =
    trpc.groups.expenses.create.useMutation()

  const utils = trpc.useUtils()
  const router = useRouter()
  const { toast } = useToast()
  const tOffline = useTranslations('Offline')

  if (!group || !categories || (!duplicateOf && shortcutsPending)) return null
  // The form reads its starting values once, so it waits for the expense it copies. One that has
  // gone since — deleted on another phone — leaves an ordinary blank form.
  if (duplicateOf && !template && !templateMissing) return null

  return (
    <ExpenseForm
      // A different starting point is a different form, not a change to this one.
      key={template?.id ?? 'new'}
      group={group}
      categories={categories}
      template={template}
      onSubmit={async (expenseFormValues, participantId) => {
        // Chosen here so that the outbox can send it again without making two.
        const expenseId = randomId()
        const queue = () => {
          enqueueExpense({
            id: expenseId,
            groupId,
            values: expenseFormValues,
            participantId,
          })
          toast({
            title: tOffline('queued'),
            description: tOffline('queuedDescription'),
          })
        }
        if (!navigator.onLine) {
          queue()
        } else {
          try {
            await createExpenseMutateAsync({
              groupId,
              expenseFormValues,
              participantId,
              expenseId,
            })
          } catch (error) {
            // A refusal is the form's to show; only a request that never arrived waits its turn.
            if (!isNetworkError(error)) throw error
            queue()
          }
        }
        // Everything about the group, not just the list: the totals above it, Stats, Balances and
        // Activity are their own queries and were left showing the group without this expense.
        utils.groups.invalidate()
        // The list itself, not the group's address: that redirects, and a redirect is not saved
        // for offline use.
        router.push(`/groups/${group.id}/expenses`)
      }}
      runtimeFeatureFlags={runtimeFeatureFlags}
    />
  )
}
