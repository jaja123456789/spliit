'use client'

import { cn } from '@/lib/utils'
import type React from 'react'
import { forwardRef, useCallback, useLayoutEffect, useRef } from 'react'

/**
 * The expense's name, at the size a name deserves — and wrapping like one.
 *
 * An `<input>` cannot wrap. At the size this field now carries, "Monday evening restaurant" ran
 * off the right edge of its box, and reopening a saved expense showed you half its own name with
 * no indication there was more. A textarea that grows to its content is the same field with the
 * one behaviour the size demands.
 *
 * Enter is swallowed rather than inserted: this is a title, not a paragraph, and the newline
 * would be stored and then rendered as a space everywhere the title is shown.
 */
export const TitleTextarea = forwardRef<
  HTMLTextAreaElement,
  React.ComponentPropsWithoutRef<'textarea'>
>(function TitleTextarea({ className, value, onChange, ...props }, ref) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null)
  const grow = useCallback(() => {
    const el = innerRef.current
    if (!el) return
    // Collapse first: without it the box only ever grows, because `scrollHeight` on an element
    // already tall enough to hold its content is that taller height.
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])
  // Layout rather than effect, so the height is right in the frame the value lands in and a
  // restored draft does not flash at one line before settling at two.
  useLayoutEffect(grow, [value, grow])

  return (
    <textarea
      {...props}
      rows={1}
      value={value}
      ref={(el) => {
        innerRef.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
      onChange={(event) => {
        onChange?.(event)
        grow()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.preventDefault()
      }}
      className={cn('resize-none overflow-hidden', className)}
    />
  )
})
