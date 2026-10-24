'use client'

import { AVATAR_HUE_COUNT, preferredAvatarHue } from '@/lib/avatar-hue'
import { cn } from '@/lib/utils'

/**
 * The emoji a group can wear, offered in its settings. A short list rather than the whole keyboard:
 * enough to tell a flat from a trip from a team at a glance, and every one of them renders the same
 * on every platform the app runs on.
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
 * A group's plate: its emoji, or the first letter of its name, on one of the participant plates.
 *
 * The home screen was a column of identical white cards told apart only by reading them. The colour
 * comes from the group's id, so a group keeps it on every device and through a rename; the plates
 * are the people's plates, which are already measured for contrast in both themes and hold no green.
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
  const plate = (preferredAvatarHue(group.id) % AVATAR_HUE_COUNT) + 1
  const letter = Array.from(group.name.trim())[0]?.toUpperCase() ?? '?'
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-xl font-semibold leading-none',
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: `hsl(var(--avatar-${plate}))`,
        color: `hsl(var(--avatar-${plate}-foreground))`,
        fontSize: group.icon
          ? Math.round(size * 0.55)
          : Math.max(12, Math.round(size * 0.42)),
      }}
    >
      {group.icon || letter}
    </span>
  )
}
