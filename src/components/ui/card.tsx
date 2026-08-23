import * as React from "react"

import { cn } from "@/lib/utils"

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /**
   * Run the card to the screen edges on a phone, and make it a card again from `sm` up.
   *
   * On a 430px screen the inset costs 32px of width and draws a second frame inside the one the
   * device already provides. So below `sm` the side borders and the radius go and the card is
   * pulled out over the page's own `px-4` — which is what the expenses list has always done, and
   * why that page looked like a different app from the rest.
   *
   * The top and bottom rules stay. They are what separates one sheet from the next on a page that
   * stacks several (Stats has three, the expense form four), and nothing else can do it: the page
   * ground is `#FBFAF9` against a `#FFFFFF` card, a measured 1.04:1, so a gap of ground is not a
   * visible boundary. Dropping every border would merge those pages into one continuous field.
   *
   * Only for a card that is a direct child of a page container with `px-4` — the negative margin
   * assumes it. Not for a card inside a dialog, a popover or a narrower column.
   */
  bleed?: boolean
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, bleed = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "border bg-card text-card-foreground shadow-sm",
        bleed
          ? "-mx-4 rounded-none border-x-0 sm:mx-0 sm:rounded-lg sm:border-x"
          : "rounded-lg",
        className
      )}
      {...props}
    />
  )
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
