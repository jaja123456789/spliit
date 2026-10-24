'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { lastEmoji } from '@/lib/emoji'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { GROUP_ICONS, GroupMark } from './group-mark'

/**
 * The group's plate, which opens a choice of emoji for it: a few quick picks, and a field that
 * takes any other from the device's own emoji keyboard, with its search, recents and skin tones.
 *
 * The field keeps only an emoji. Typing one after another replaces it, and text that holds none
 * says so and leaves the icon as it was.
 */
export function GroupIconPicker({
  group,
  value,
  onChange,
}: {
  group: { id: string; name: string }
  value: string | null | undefined
  onChange: (icon: string | null) => void
}) {
  const t = useTranslations('GroupForm.IconField')
  const isQuickPick = (icon: string | null | undefined) =>
    !!icon && (GROUP_ICONS as readonly string[]).includes(icon)
  const [draft, setDraft] = useState(value && !isQuickPick(value) ? value : '')
  const [notEmoji, setNotEmoji] = useState(false)

  const choose = (icon: string | null) => {
    onChange(icon)
    setDraft(icon && !isQuickPick(icon) ? icon : '')
    setNotEmoji(false)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('choose')}
          data-testid="group-icon-trigger"
        >
          <GroupMark group={{ ...group, icon: value }} size={44} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <p className="section-label mb-2">{t('label')}</p>
        <div className="grid grid-cols-8 gap-1">
          {GROUP_ICONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-pressed={value === emoji}
              onClick={() => choose(value === emoji ? null : emoji)}
              className={cn(
                'grid h-8 w-8 place-items-center rounded-md text-lg hover:bg-accent',
                value === emoji &&
                  'bg-accent ring-2 ring-inset ring-foreground',
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
        <label className="mt-3 block">
          <span className="text-xs text-muted-foreground">{t('custom')}</span>
          <Input
            value={draft}
            onChange={(event) => {
              const typed = event.target.value
              const emoji = lastEmoji(typed)
              if (emoji) {
                choose(emoji)
              } else {
                setDraft(typed)
                setNotEmoji(typed.trim() !== '')
              }
            }}
            placeholder={t('customPlaceholder')}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            aria-invalid={notEmoji}
            className={cn(
              'mt-1 text-base sm:text-base',
              value && !isQuickPick(value) && 'ring-2 ring-foreground',
            )}
            data-testid="group-icon-custom"
          />
        </label>
        {notEmoji && (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {t('notEmoji')}
          </p>
        )}
        {value && (
          <Button
            type="button"
            variant="link"
            className="mt-2 h-auto p-0"
            onClick={() => choose(null)}
          >
            {t('none')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
