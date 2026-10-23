'use client'
import { useDeleteExpense } from '@/app/groups/[groupId]/expenses/use-delete-expense'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useActiveUser } from '@/lib/hooks'
import { Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { PointerEvent, useRef } from 'react'

type Target = { groupId: string; expenseId: string; title: string }

/** Edit, duplicate, delete — the same three wherever an expense's actions are offered. */
function useExpenseActions({ groupId, expenseId, title }: Target) {
  const router = useRouter()
  const activeUser = useActiveUser(groupId)
  const deleteExpense = useDeleteExpense(groupId)
  return {
    edit: () => router.push(`/groups/${groupId}/expenses/${expenseId}/edit`),
    duplicate: () =>
      router.push(`/groups/${groupId}/expenses/create?duplicate=${expenseId}`),
    // No "are you sure?" here: the toast that follows offers Undo, which answers the same worry
    // after the fact instead of asking it every time.
    remove: () =>
      deleteExpense({
        expenseId,
        title,
        participantId: activeUser ?? undefined,
      }),
  }
}

/** The row's "⋯" on screens wide enough to have room for it. */
export function ExpenseRowMenu(target: Target) {
  const t = useTranslations('ExpenseCard.Actions')
  const actions = useExpenseActions(target)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-subtle-foreground hover:text-foreground"
          aria-label={t('label', { title: target.title })}
          data-testid={`expense-actions-${target.expenseId}`}
        >
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={actions.edit}>
          <Pencil className="w-4 h-4 mr-2" />
          {t('edit')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={actions.duplicate}>
          <Copy className="w-4 h-4 mr-2" />
          {t('duplicate')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={actions.remove}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {t('delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The same actions as a sheet, for a long press on a phone. */
export function ExpenseRowSheet({
  open,
  onOpenChange,
  ...target
}: Target & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('ExpenseCard.Actions')
  const actions = useExpenseActions(target)
  const run = (action: () => unknown) => () => {
    onOpenChange(false)
    action()
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="p-0">
        <DrawerTitle className="px-4 pt-4 pb-2 text-base font-semibold truncate">
          {target.title}
        </DrawerTitle>
        <div className="flex flex-col px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          {[
            { label: t('edit'), Icon: Pencil, action: actions.edit },
            { label: t('duplicate'), Icon: Copy, action: actions.duplicate },
            {
              label: t('delete'),
              Icon: Trash2,
              action: actions.remove,
              destructive: true,
            },
          ].map(({ label, Icon, action, destructive }) => (
            <Button
              key={label}
              variant="ghost"
              className={
                destructive
                  ? 'h-12 justify-start text-base text-destructive hover:text-destructive'
                  : 'h-12 justify-start text-base'
              }
              onClick={run(action)}
            >
              <Icon className="w-5 h-5 mr-3" />
              {label}
            </Button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

/**
 * A press held on a row, by touch only: a mouse keeps its own right-click menu (open in a new tab,
 * copy the link), which a row of links should not take away.
 *
 * Browsers answer a held touch in their own ways — Android with a `contextmenu` event, iOS with a
 * link preview and no event at all — so this keeps its own timer, cancels on movement (a scroll
 * starts as a press too), and swallows the tap that ends a long press so it does not also open the
 * expense.
 */
export function useLongPress(onLongPress: () => void, delay = 500) {
  const timer = useRef<number | undefined>(undefined)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const touch = useRef(false)
  const fired = useRef(false)

  const cancel = () => {
    window.clearTimeout(timer.current)
    origin.current = null
  }
  const fire = () => {
    cancel()
    if (fired.current) return
    fired.current = true
    onLongPress()
  }

  return {
    onPointerDown: (event: PointerEvent) => {
      fired.current = false
      touch.current = event.pointerType === 'touch'
      if (!touch.current) return
      origin.current = { x: event.clientX, y: event.clientY }
      timer.current = window.setTimeout(fire, delay)
    },
    onPointerMove: (event: PointerEvent) => {
      if (!origin.current) return
      const moved = Math.hypot(
        event.clientX - origin.current.x,
        event.clientY - origin.current.y,
      )
      if (moved > 10) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: React.MouseEvent) => {
      if (!touch.current) return
      event.preventDefault()
      fire()
    },
    onClick: (event: React.MouseEvent) => {
      if (fired.current) {
        event.preventDefault()
        fired.current = false
      }
    },
  }
}
