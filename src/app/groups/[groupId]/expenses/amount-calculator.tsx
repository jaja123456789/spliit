'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Check, Delete, Equal } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface AmountCalculatorProps {
  onApply: (value: string) => void
  initialValue?: string
  className?: string
  decimalPlaces?: number
}

type Operator = '+' | '-' | '×' | '÷'

const isOperator = (char: string): char is Operator =>
  ['+', '-', '×', '÷'].includes(char)

const getMathResult = (text: string, decimalPlaces: number): string | null => {
  try {
    const expression = text
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/[+\-*/]$/, '')

    if (!expression) return null

    const result = new Function(`return Number(${expression})`)()

    if (typeof result === 'number' && isFinite(result)) {
      return parseFloat(result.toFixed(decimalPlaces)).toString()
    }
    return null
  } catch {
    return null
  }
}

// FIX: Moved ButtonKey outside of the main component
interface ButtonKeyProps {
  children: React.ReactNode
  onClick: () => void
  variant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link'
  className?: string
}

const ButtonKey = ({
  children,
  onClick,
  variant = 'outline',
  className,
}: ButtonKeyProps) => (
  <Button
    variant={variant}
    className={cn(
      'h-14 text-xl font-normal shadow-sm active:scale-95 transition-transform',
      className,
    )}
    onClick={onClick}
    type="button"
  >
    {children}
  </Button>
)

export function AmountCalculator({
  onApply,
  initialValue,
  className,
  decimalPlaces = 2,
}: AmountCalculatorProps) {
  const [display, setDisplay] = useState(initialValue || '0')
  const [formula, setFormula] = useState('')
  const [hasResult, setHasResult] = useState(false)

  // Haptic feedback for mobile
  const vibrate = () => {
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      window.navigator.vibrate(5)
    }
  }

  const appendToDisplay = useCallback(
    (value: string) => {
      vibrate()
      setDisplay((prev) => {
        if (hasResult && !isOperator(value)) {
          setHasResult(false)
          return value === '.' ? '0.' : value
        }

        const lastChar = prev.slice(-1)

        if (isOperator(value) && isOperator(lastChar)) {
          return prev.slice(0, -1) + value
        }

        if (prev === '0' && value !== '.' && !isOperator(value)) return value

        if (value === '.') {
          const parts = prev.split(/[+\-×÷]/)
          if (parts[parts.length - 1].includes('.')) return prev
        }

        setHasResult(false)
        return prev + value
      })
    },
    [hasResult],
  )

  const calculate = useCallback(() => {
    vibrate()
    const result = getMathResult(display, decimalPlaces)
    if (result !== null) {
      setFormula(display + ' =')
      setDisplay(result)
      setHasResult(true)
    }
  }, [display, decimalPlaces])

  const handleApply = useCallback(
    (e?: { preventDefault: () => void }) => {
      vibrate()
      e?.preventDefault()

      let finalValue = display
      if (!hasResult && /[+\-×÷]/.test(display)) {
        const calculated = getMathResult(display, decimalPlaces)
        if (calculated !== null) finalValue = calculated
      }
      onApply(finalValue)
    },
    [display, hasResult, onApply, decimalPlaces],
  )

  const backspace = useCallback(() => {
    vibrate()
    setDisplay((prev) =>
      prev.length <= 1 || hasResult ? '0' : prev.slice(0, -1),
    )
    setHasResult(false)
  }, [hasResult])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        hasResult ? handleApply() : calculate()
      } else if (e.key === 'Backspace') backspace()
      else if (e.key === 'Escape') setDisplay('0')
      else if (/[0-9]/.test(e.key)) appendToDisplay(e.key)
      else if (['+', '-', '*', '/'].includes(e.key)) {
        const map: Record<string, string> = {
          '*': '×',
          '/': '÷',
          '+': '+',
          '-': '-',
        }
        appendToDisplay(map[e.key])
      } else if (e.key === '.' || e.key === ',') appendToDisplay('.')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [appendToDisplay, calculate, handleApply, backspace, hasResult])

  return (
    <Card
      className={cn(
        'p-4 w-full max-w-[340px] shadow-lg select-none touch-none bg-background',
        className,
      )}
    >
      {/* Display Area */}
      <div className="bg-muted/30 border rounded-xl p-4 mb-4 flex flex-col items-end justify-center h-24 overflow-hidden">
        <div className="text-sm text-muted-foreground font-mono h-5 uppercase tracking-wider mb-1">
          {formula}
        </div>
        <div className="text-4xl font-bold font-mono tracking-tight w-full text-right">
          {display}
        </div>
      </div>

      {/* Calculator Grid */}
      <div className="grid grid-cols-4 gap-3">
        <ButtonKey
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 font-bold"
          onClick={() => {
            setDisplay('0')
            setFormula('')
          }}
        >
          C
        </ButtonKey>
        <ButtonKey variant="ghost" onClick={backspace}>
          <Delete className="h-6 w-6" />
        </ButtonKey>
        <ButtonKey
          variant="secondary"
          className="text-primary text-2xl"
          onClick={() => appendToDisplay('÷')}
        >
          ÷
        </ButtonKey>
        <ButtonKey
          variant="secondary"
          className="text-primary text-2xl"
          onClick={() => appendToDisplay('×')}
        >
          ×
        </ButtonKey>

        {['7', '8', '9'].map((n) => (
          <ButtonKey key={n} onClick={() => appendToDisplay(n)}>
            {n}
          </ButtonKey>
        ))}
        <ButtonKey
          variant="secondary"
          className="text-primary text-2xl"
          onClick={() => appendToDisplay('-')}
        >
          -
        </ButtonKey>

        {['4', '5', '6'].map((n) => (
          <ButtonKey key={n} onClick={() => appendToDisplay(n)}>
            {n}
          </ButtonKey>
        ))}
        <ButtonKey
          variant="secondary"
          className="text-primary text-2xl"
          onClick={() => appendToDisplay('+')}
        >
          +
        </ButtonKey>

        <div className="grid grid-cols-3 col-span-3 gap-3">
          {['1', '2', '3'].map((n) => (
            <ButtonKey key={n} onClick={() => appendToDisplay(n)}>
              {n}
            </ButtonKey>
          ))}

          <ButtonKey
            className="col-span-2"
            onClick={() => appendToDisplay('0')}
          >
            0
          </ButtonKey>
          <ButtonKey onClick={() => appendToDisplay('.')}>.</ButtonKey>
        </div>

        <Button
          variant="default"
          className="h-[auto] row-span-2 bg-primary hover:bg-primary/90 text-primary-foreground text-2xl rounded-lg shadow-md"
          onClick={calculate}
        >
          <Equal className="h-8 w-8" />
        </Button>
      </div>

      <Button
        className="w-full mt-4 h-12 text-lg font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
        onClick={handleApply}
      >
        <Check className="h-5 w-5 mr-2" /> Apply Amount
      </Button>
    </Card>
  )
}
