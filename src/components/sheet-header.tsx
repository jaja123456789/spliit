import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

type Props = {
  /** Caps label. Names what the figure is, and doubles as the sheet's heading. */
  label: ReactNode
  /**
   * The one number this screen is about. Pass a skeleton while it loads rather than nothing — the
   * box is reserved either way, so the page does not move under the reader. Omit the prop entirely
   * only for a screen that structurally has no figure, such as Activity.
   */
  figure?: ReactNode
  /** Goes on the figure's box, so it is addressable while loading as well as after. */
  figureTestId?: string
  /** One line. Never two. */
  context?: ReactNode
  actions?: ReactNode
  className?: string
}

/**
 * The head of a sheet: a caps label, one figure, one line of context.
 *
 * It replaces `CardHeader` + `CardTitle` + `CardDescription`, which spent the most valuable space
 * on the screen on a title repeating the tab you just pressed and a sentence explaining what the
 * page was for. The figure that used to sit below the header in smaller type comes up into it —
 * on a money app the answer belongs above the evidence.
 *
 * The figure and context boxes hold their height whether or not they have content, so the empty,
 * loading and populated states of a screen are the same layout with less in it. That is what makes
 * a skeleton honest: nothing below it moves when the data lands.
 */
export function SheetHeader({
  label,
  figure,
  figureTestId,
  context,
  actions,
  className,
}: Props) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 px-4 sm:px-6 pt-5 pb-3',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-subtle-foreground">
          {label}
        </h2>
        {/* Arbitrary values because 38px and 21px are not scale steps, not because numeric ones
            fail: `tailwind.config.js` now points `minHeight` at the spacing scale, so `min-h-11`
            does mean 2.75rem. These two are the measured line boxes of a one-line figure and a
            one-line context in this face — both a little over their nominal line-heights, because
            the mono metrics exceed them. `min-` rather than a fixed height so a longer locale can
            wrap. */}
        {figure !== undefined && (
          <div
            data-testid={figureTestId}
            className="mt-1.5 min-h-[38px] text-3xl font-semibold leading-9 tracking-tight"
          >
            {figure}
          </div>
        )}
        <div className="mt-1 min-h-[21px] text-sm leading-5 text-muted-foreground">
          {context}
        </div>
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  )
}
