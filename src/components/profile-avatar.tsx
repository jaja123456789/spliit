'use client'

import { AVATAR_HUE_COUNT, preferredAvatarHue } from '@/lib/avatar-hue'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'

interface Props {
  name: string
  /** Marks the active user — a ring, not a different plate. */
  isActiveUser?: boolean
  /**
   * Which of the seven plates to wear, 0-6. Pass the value `assignAvatarHues` gave this name so
   * that nobody in the group shares a colour; omitted, the name picks its own and may clash.
   */
  hue?: number
  size?: number
  className?: string
}

/**
 * Two mono letters on a coloured plate, with a ring for you.
 *
 * This once hashed the name into one of seventeen Tailwind 500-weight hues — borrowed colour,
 * arbitrarily assigned, louder than the money — and then went the other way, to one neutral plate
 * for everyone with the accent reserved for you. Seven designed hues is the settlement: a group is
 * legible at a glance, and no hue is one of the two the app spends on money.
 *
 * You are still marked, but by a ring rather than by being the only person with a colour. That is
 * what lets a hue mean one person everywhere: under the old rule you wore the accent in your own
 * rows and your real colour in everyone else's, so the same person had two plates on one screen.
 *
 * The plates are solid colour, so they hold their shape on every surface without a hairline; the
 * pale plates before them needed one on the tinted rows of the expense form. The mark is
 * decorative: every call site renders the participant's name beside it, so it is hidden from
 * assistive technology rather than read out twice.
 */
export function ProfileAvatar({
  name,
  isActiveUser = false,
  hue,
  size = 32,
  className,
}: Props) {
  // Seven tokens, not seven Tailwind colours: the plate is the only thing in the app that wears
  // them, and `bg-avatar-${n}` cannot be written as a class anyway — Tailwind reads source text,
  // so a computed name never reaches the stylesheet. The variable does the switching, which means
  // dark mode comes for free from `.dark` redefining it.
  const plate = ((hue ?? preferredAvatarHue(name)) % AVATAR_HUE_COUNT) + 1
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
        'flex items-center justify-center shrink-0 font-sans font-bold',
        // Inset both ways, so marking you costs no layout: an offset ring would need clear space
        // the 26px chips in a two-column grid do not have. Ink, not the accent: green is kept for
        // the filled action and for money, and an ink ring reads on every plate in both themes.
        isActiveUser && 'ring-2 ring-inset ring-foreground',
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: `hsl(var(--avatar-${plate}))`,
        color: `hsl(var(--avatar-${plate}-foreground))`,
        // Round, at every size and on every screen. It used to be a rounded square scaled to the
        // plate — which meant the one place that needed circles (marks overlapping in a stack,
        // where a square overlapping a square reads as a mis-rendered box) had to override it,
        // and the app showed the same people as two different shapes depending on the page.
        // One shape is worth more than the argument for either of them.
        borderRadius: '50%',
        // Floored, not purely proportional: a 26px chip mark computed to 8px, smaller than
        // anything else on the screen. Marks sit outside the type scale, but not that far.
        fontSize: Math.max(10, Math.round(size * 0.38)),
      }}
    >
      {initials}
    </div>
  )
}
