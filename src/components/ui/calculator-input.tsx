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
}

export function CalculatorInput({
  value,
  onValueChange,
  className,
  inputClassName,
  placeholder = "0.00",
  disabled,
  ...props
}: CalculatorInputProps) {
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false)

  // 1. Handle "Apply" from the Popover Calculator
  const handleCalculatorApply = (newValue: string) => {
    onValueChange(newValue)
    setIsPopoverOpen(false) // Close popover after applying
  }

  // 2. Handle standard typing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange(e.target.value)
  }

  // 3. Safari/Mobile selection hack (preserved from your original code)
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
        onFocus={handleFocus}
      />
      
      <InputGroupAddon className="pr-0" align="inline-end">
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
            //   disabled={disabled}
            //   className="h-full rounded-l-none text-muted-foreground hover:text-foreground"
            >
              <Calculator/>
            </Button>
          </PopoverTrigger>
          <PopoverContent side="right" className="w-auto p-3">
            {/* Pass the current input value to the calculator as a starting point */}
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