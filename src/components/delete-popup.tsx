import { Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AsyncButton } from './async-button'
import { Button } from './ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'

/**
 * Asks before deleting. Opened by its own button, or — given `open` and `onOpenChange` and
 * `trigger={false}` — by something else, such as a menu item.
 */
export function DeletePopup({
  onDelete,
  open,
  onOpenChange,
  trigger = true,
  className,
}: {
  onDelete: () => Promise<void>
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: boolean
  className?: string
}) {
  const t = useTranslations('ExpenseForm.DeletePopup')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && (
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className={`h-11 sm:h-10 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive ${className ?? ''}`}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {t('label')}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
        <DialogFooter className="flex flex-col gap-2">
          <AsyncButton
            type="button"
            variant="destructive"
            loadingContent="Deleting…"
            action={onDelete}
          >
            {t('yes')}
          </AsyncButton>
          <DialogClose asChild>
            <Button variant={'secondary'}>{t('cancel')}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
