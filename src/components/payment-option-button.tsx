'use client'

import { Button } from '@/components/ui/button'
import { PaymentOption } from '@/lib/payment-links'
import { cn } from '@/lib/utils'
import { Check, Copy, ExternalLink, Landmark, Smartphone } from 'lucide-react'
import { useState } from 'react'

// Direct returns rather than a lookup table: the "static-components" lint rule rejects a component
// assigned from a variable.
function PaymentOptionIcon({
  option,
  copied,
  className,
}: {
  option: PaymentOption
  copied: boolean
  className?: string
}) {
  if (option.type === 'link') return <ExternalLink className={className} />
  if (copied) return <Check className={className} />
  if (option.icon === 'phone') return <Smartphone className={className} />
  if (option.icon === 'landmark') return <Landmark className={className} />
  return <Copy className={className} />
}

/**
 * "Pay with Venmo ↗" — one handle the recipient has actually filled in.
 *
 * A full-width row rather than the chip this used to be, because of where it now lives. Squeezed
 * onto a balance row it was one of four things competing for the same line and read as a label; on
 * the settle sheet it is one of the two things the screen is for, and paying is the one that leaves
 * the app. The brand plate carries the colour so the row itself stays neutral — five of these in a
 * stack of solid brand fills is a paint chart, not a list of choices.
 */
export function PaymentOptionButton({
  option,
  className,
}: {
  option: PaymentOption
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(option.value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const classes = cn(
    'w-full justify-start gap-2.5 h-auto py-3 px-3 font-medium',
    className,
  )

  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'grid h-5.5 w-5.5 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white',
          option.bgColor,
          option.textColor,
        )}
        style={{ width: 22, height: 22 }}
      >
        {/* A brand's initial stands for the brand. A copy option's label is the handle itself, so
            its first character would be a digit or a "+" — the plate stays empty and the icon at
            the end of the row says what the row does. */}
        {option.type === 'link' ? option.label.slice(0, 1).toUpperCase() : null}
      </span>
      {option.label}
      <PaymentOptionIcon
        option={option}
        copied={copied}
        className="ml-auto h-3.5 w-3.5 text-subtle-foreground"
      />
    </>
  )

  if (option.type === 'link') {
    return (
      <Button variant="outline" className={classes} asChild>
        <a href={option.value} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      </Button>
    )
  }

  // `type="button"` because the settle sheet is a form, and a button inside one submits it unless
  // told otherwise: copying the number used to record the payment as well.
  return (
    <Button
      type="button"
      variant="outline"
      className={classes}
      onClick={handleCopy}
    >
      {content}
    </Button>
  )
}
