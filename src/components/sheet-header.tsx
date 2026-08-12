import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

type Props = {
  /** Caps label. Names what the figure is, and doubles as the sheet's heading. */
  label: ReactNode
  /** The one number this screen is about. Omit while it is still loading — the box is reserved. */
  figure?: ReactNode
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
        {/* Arbitrary values, not `min-h-9`/`min-h-5`: this project is on Tailwind 3.3, whose
            minHeight scale is only 0/full/screen/min/max/fit, so the numeric classes compile to
            nothing at all and the boxes collapse to whatever the skeleton happens to be. The two
            heights are the measured line boxes of a one-line figure and a one-line context in this
            face — 38px and 21px, both a little over their nominal line-heights because the mono
            metrics exceed them. `min-` rather than a fixed height so a longer locale can wrap. */}
        <div className="mt-1.5 min-h-[38px] text-3xl font-semibold leading-9 tracking-tight">
          {figure}
        </div>
        <div className="mt-1 min-h-[21px] text-sm leading-5 text-muted-foreground">
          {context}
        </div>
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  )
}
