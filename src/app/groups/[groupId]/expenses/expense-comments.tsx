'use client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { useActiveUser } from '@/lib/hooks'
import { formatDate } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useLocale, useTranslations } from 'next-intl'
import { FormEvent, useState } from 'react'
import { useCurrentGroup } from '../current-group-context'

/**
 * The conversation about one expense — "was this the whole bill?", "the second one was mine" —
 * kept with it instead of in a chat somewhere else. Written as whoever is "you" on this device.
 */
export function ExpenseComments({
  groupId,
  expenseId,
}: {
  groupId: string
  expenseId: string
}) {
  const t = useTranslations('ExpenseComments')
  const { toast } = useToast()
  const locale = useLocale()
  const { group } = useCurrentGroup()
  const activeUser = useActiveUser(groupId)
  const utils = trpc.useUtils()
  const { data } = trpc.groups.expenses.comments.list.useQuery({
    groupId,
    expenseId,
  })
  const create = trpc.groups.expenses.comments.create.useMutation()
  const remove = trpc.groups.expenses.comments.delete.useMutation()
  const [text, setText] = useState('')

  const nameOf = (participantId: string | null) =>
    group?.participants.find((p) => p.id === participantId)?.name ??
    t('someone')

  // The thread, the count on the expense's row, and the line in Activity all moved.
  const refresh = () =>
    Promise.all([
      utils.groups.expenses.comments.list.invalidate({ groupId, expenseId }),
      utils.groups.expenses.list.invalidate(),
      utils.groups.activities.invalidate(),
    ])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const comment = text.trim()
    if (!comment) return
    try {
      await create.mutateAsync({
        groupId,
        expenseId,
        text: comment,
        participantId: activeUser ?? undefined,
      })
    } catch {
      // Offline, a server error, or "you" no longer in the group. The text stays to send again;
      // before, the button simply came back and nothing said the comment was not posted.
      toast({ title: t('postFailed'), variant: 'destructive' })
      return
    }
    setText('')
    await refresh()
  }

  const comments = data?.comments ?? []

  return (
    <Card bleed className="mt-4" data-testid="expense-comments">
      <CardContent className="flex flex-col gap-4 pt-6">
        <h2 className="section-label">{t('title')}</h2>
        {data && comments.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        )}
        {comments.length > 0 && (
          <ul className="flex flex-col gap-3">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="border-b pb-3 last:border-b-0"
                data-testid="expense-comment"
              >
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-medium text-foreground">
                    {nameOf(comment.participantId)}
                  </span>
                  <time
                    dateTime={comment.createdAt.toISOString()}
                    className="text-subtle-foreground"
                  >
                    {formatDate(comment.createdAt, locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                  {comment.text}
                </p>
                {/* Only your own: the group has no accounts, so this is a courtesy, not a lock. */}
                {activeUser && comment.participantId === activeUser && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs text-muted-foreground"
                    disabled={remove.isPending}
                    onClick={async () => {
                      try {
                        await remove.mutateAsync({
                          groupId,
                          commentId: comment.id,
                        })
                      } catch {
                        toast({
                          title: t('deleteFailed'),
                          variant: 'destructive',
                        })
                      }
                      await refresh()
                    }}
                  >
                    {t('delete')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submit} className="flex flex-col gap-2">
          <Textarea
            rows={2}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t('placeholder')}
            aria-label={t('placeholder')}
            maxLength={2000}
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="secondary"
              disabled={!text.trim() || create.isPending}
            >
              {t('send')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
