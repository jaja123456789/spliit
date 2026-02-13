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
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group"
// Import your existing calculator
import { AmountCalculator } from "@/app/groups/[groupId]/expenses/amount-calculator"

interface CalculatorInputProps 
  extends Omit<React.ComponentProps<typeof InputGroupInput>, "onChange" | "value"> {
  value: string | number
  onValueChange: (value: string) => void
  className?: string      
  inputClassName?: string
  disallowEmpty?: boolean
}

export function CalculatorInput({
  value,
  onValueChange,
  className,
  inputClassName,
  placeholder = "0.00",
  disabled,
  disallowEmpty = false,
  onBlur,
  ...props
}: CalculatorInputProps) {
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false)

  // 1. Handle "Apply" from the Popover Calculator
  const handleCalculatorApply = (newValue: string) => {
    onValueChange(newValue)
    setIsPopoverOpen(false)
  }

  // 2. Handle standard typing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    // Allow empty string to pass through so the user can clear and retype
    onValueChange(val)
  }

  // 3. Handle Blur (Focus Loss)
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // If enabled, reset to "0" if the field is left empty
    if (disallowEmpty) {
      const val = e.target.value.trim()
      if (val === "") {
        onValueChange("0")
      }
    }
    // Forward the original onBlur event if provided
    onBlur?.(e)
  }

  // 4. Safari/Mobile selection hack
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const target = e.currentTarget
    setTimeout(() => target.select(), 1)
    props.onFocus?.(e)
  }

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
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
            >
              <Calculator/>
            </Button>
          </PopoverTrigger>
          <PopoverContent side="right" className="w-auto p-3">
            <AmountCalculator
              initialValue={String(value || "")}
              onApply={handleCalculatorApply}
            />
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  )
}