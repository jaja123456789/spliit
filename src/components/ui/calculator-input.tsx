"use client"

import * as React from "react"
import { Calculator } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DrawerTitle,
  DrawerDescription,
  DrawerHeader
} from "@/components/ui/drawer"
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group"
import { AmountCalculator } from "@/app/groups/[groupId]/expenses/amount-calculator"
import { useMediaQuery } from '@/lib/hooks'

interface CalculatorInputProps 
  extends Omit<React.ComponentProps<typeof InputGroupInput>, "onChange" | "value"> {
  value: string | number
  onValueChange: (value: string) => void
  className?: string      
  inputClassName?: string
  disallowEmpty?: boolean
  decimalPlaces?: number
}

export function CalculatorInput({
  value,
  onValueChange,
  className,
  inputClassName,
  placeholder = "0.00",
  disabled,
  disallowEmpty = false,
  decimalPlaces = 2,
  onBlur,
  ...props
}: CalculatorInputProps) {
  const [open, setOpen] = React.useState(false)
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const handleCalculatorApply = (newValue: string) => {
    onValueChange(newValue)
    setOpen(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    onValueChange(val)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (disallowEmpty) {
      const val = e.target.value.trim()
      if (val === "") {
        onValueChange("0")
      }
    }
    onBlur?.(e)
  }

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const target = e.currentTarget
    setTimeout(() => target.select(), 1)
    props.onFocus?.(e)
  }

  // Common Calculator Component to reuse in Drawer and Popover
  const CalculatorComponent = (
    <AmountCalculator
      initialValue={String(value || "")}
      onApply={handleCalculatorApply}
      className={isDesktop ? "border-none shadow-none" : "w-full max-w-none shadow-none border-none"}
      decimalPlaces={decimalPlaces}
    />
  )

  return (
    <InputGroup className={className}>
      <InputGroupInput
        className={inputClassName}
        {...props}
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        onChange={handleInputChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
      />
      <InputGroupAddon className="pr-0" align="inline-end">
        {isDesktop ? (
          /* DESKTOP: POPOVER */
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Calculator className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            {/* align="end" keeps it aligned to the right edge of input, avoiding off-screen to the right */}
            <PopoverContent align="end" className="w-auto p-0">
               {CalculatorComponent}
            </PopoverContent>
          </Popover>
        ) : (
          /* MOBILE: DRAWER */
          <Drawer open={open} onOpenChange={setOpen}>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Calculator className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
                <div className="mx-auto w-full max-w-sm">
                  {/* Visually hidden header for accessibility/screen readers */}
                  <DrawerHeader className="sr-only">
                    <DrawerTitle>Calculator</DrawerTitle>
                    <DrawerDescription>Calculate amount</DrawerDescription>
                  </DrawerHeader>
                  <div className="p-4 pb-8 flex justify-center">
                    {CalculatorComponent}
                  </div>
                </div>
            </DrawerContent>
          </Drawer>
        )}
      </InputGroupAddon>
    </InputGroup>
  )
}