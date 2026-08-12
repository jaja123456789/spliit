'use client'

import { cn } from '@/lib/utils'
import { useMemo } from 'react'

interface Props {
  name: string
  /** Marks the active user. The only participant who gets colour. */
  isActiveUser?: boolean
  size?: number
  className?: string
}

/**
 * Two mono letters on a neutral plate — accent only for you.
 *
 * This used to hash the name into one of seventeen Tailwind 500-weight hues, which made the
 * loudest thing on any screen a decoration that encoded nothing: the colour was stable per name
 * but carried no meaning, competed with the money for attention, and gave the one participant who
 * actually matters — you — no distinction at all.
 *
 * The plate keeps a hairline so it holds its shape on the sunken and tinted surfaces it lands on
 * (the selected rows in the expense form are `bg-primary/5`, within about 1.05:1 of the plate).
 * It is decorative: every call site renders the participant's name beside it, so it is hidden from
 * assistive technology rather than read out twice.
 */
export function ProfileAvatar({
  name,
  isActiveUser = false,
  size = 32,
  className,
}: Props) {
  const initials = useMemo(() => {
    const words = (name || '?').trim().split(/\s+/)
    // Two letters either way: initials when there are several words, the first two characters of a
    // single name. `Array.from` so an astral-plane first character is not split down the middle.
    const letters =
      words.length > 1
        ? words.slice(0, 2).map((word) => Array.from(word)[0] ?? '')
        : Array.from(words[0]).slice(0, 2)
    return letters.join('').toUpperCase()
  }, [name])

  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex items-center justify-center shrink-0 font-mono font-semibold ring-1 ring-inset ring-border',
        isActiveUser
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground',
        className,
      )}
      style={{
        width: size,
        height: size,
        // Proportional rather than a fixed --radius step: a 10px corner reads as a rounded square
        // on a 40px plate and as a blob on a 24px one. Mark type sits outside the type scale for
        // the same reason — it is a two-letter label, not text in the reading hierarchy.
        borderRadius: Math.round(size * 0.24),
        fontSize: Math.round(size * 0.38),
      }}
    >
      {initials}
    </div>
  )
}
