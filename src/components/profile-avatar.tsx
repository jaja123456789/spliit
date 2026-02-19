'use client'

import { cn } from '@/lib/utils'
import { useMemo } from 'react'

const COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500',
]

interface Props {
  name: string
  size?: number
  className?: string
  fontSize?: string
}

export function ProfileAvatar({
  name,
  size = 32,
  className,
  fontSize = 'text-xs',
}: Props) {
  const colorClass = useMemo(() => {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    const index = Math.abs(hash) % COLORS.length
    return COLORS[index]
  }, [name])

  const initials = useMemo(() => {
    return (name || '?')
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }, [name])

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full text-white font-bold shrink-0',
        colorClass,
        className,
      )}
      style={{ width: size, height: size }}
    >
      <span className={fontSize}>{initials}</span>
    </div>
  )
}
