'use client'

import { cn } from '@/lib/utils'

/**
 * The quick picks for a group's emoji, offered first in its settings: enough to tell a flat from a
 * trip from a team at a glance. Any other emoji can be typed from the device's own keyboard.
 */
export const GROUP_ICONS = [
  '🏠',
  '🏡',
  '✈️',
  '🏖️',
  '⛷️',
  '🏕️',
  '🚗',
  '🚲',
  '🍕',
  '🍻',
  '☕',
  '🛒',
  '🎉',
  '🎂',
  '🎓',
  '💼',
  '⚽',
  '🎮',
  '🎵',
  '📚',
  '🐶',
  '👪',
  '💡',
  '🌍',
] as const

/**
 * A group's mark: its emoji on its own, or the first letter of its name on a neutral tile.
 *
 * The home screen was a column of identical white cards told apart only by reading them. The mark
 * once sat on one of the participant plates, picked by the group's id; but those colours mean
 * people, and a group wearing one said it belonged with whoever shared it. An emoji brings its own
 * colour, so it stands bare, in the same square, so the names beside it still line up.
 */
export function GroupMark({
  group,
  size = 40,
  className,
}: {
  group: { id: string; name: string; icon?: string | null }
  size?: number
  className?: string
}) {
  const letter = Array.from(group.name.trim())[0]?.toUpperCase() ?? '?'
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-xl font-semibold leading-none',
        !group.icon && 'bg-muted text-muted-foreground',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: group.icon
          ? Math.round(size * 0.7)
          : Math.max(12, Math.round(size * 0.42)),
      }}
    >
      {group.icon || letter}
    </span>
  )
}
