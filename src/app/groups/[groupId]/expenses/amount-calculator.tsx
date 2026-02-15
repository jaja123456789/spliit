'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Delete, Check, Equal } from 'lucide-react'
import { useState, useCallback, useEffect, useRef } from 'react'

interface AmountCalculatorProps {
  onApply: (value: string) => void
  initialValue?: string
  className?: string
}

type Operator = '+' | '-' | '×' | '÷'

const isOperator = (char: string): char is Operator => 
  ['+', '-', '×', '÷'].includes(char)

export function AmountCalculator({ onApply, initialValue, className }: AmountCalculatorProps) {
  const [display, setDisplay] = useState(initialValue || '0')
  const [formula, setFormula] = useState('')
  const [hasResult, setHasResult] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Haptic feedback for mobile
  const vibrate = () => {
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      window.navigator.vibrate(10)
    }
  }

  const getMathResult = (text: string): string | null => {
    try {
      // Clean display text for evaluation
      const expression = text
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/[+\-*/]$/, '')

      if (!expression) return null

      // Using Function is risky but limited here. 
      // For production financial apps, consider a library like 'mathjs' or 'big.js'
      const result = new Function(`return Number(${expression})`)()
      
      if (typeof result === 'number' && isFinite(result)) {
        // Round to 2 decimal places and remove trailing zeros
        return parseFloat(result.toFixed(2)).toString()
      }
      return null
    } catch {
      return null
    }
  }

  const appendToDisplay = useCallback((value: string) => {
    vibrate()
    setDisplay(prev => {
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
  }, [hasResult])

  const calculate = useCallback(() => {
    vibrate()
    const result = getMathResult(display)
    if (result !== null) {
      setFormula(display + ' =')
      setDisplay(result)
      setHasResult(true)
    }
  }, [display])

  const handleApply = useCallback(() => {
    vibrate()
    let finalValue = display
    if (!hasResult && /[+\-×÷]/.test(display)) {
      const calculated = getMathResult(display)
      if (calculated !== null) finalValue = calculated
    }
    onApply(finalValue)
  }, [display, hasResult, onApply])

  const backspace = useCallback(() => {
    vibrate()
    setDisplay(prev => (prev.length <= 1 || hasResult ? '0' : prev.slice(0, -1)))
    setHasResult(false)
  }, [hasResult])

  // Keybindings
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        hasResult ? handleApply() : calculate()
      } else if (e.key === 'Backspace') backspace()
      else if (e.key === 'Escape') setDisplay('0')
      else if (/[0-9]/.test(e.key)) appendToDisplay(e.key)
      else if (['+', '-', '*', '/'].includes(e.key)) {
        const map: Record<string, string> = { '*': '×', '/': '÷', '+': '+', '-': '-' }
        appendToDisplay(map[e.key])
      } else if (e.key === '.' || e.key === ',') appendToDisplay('.')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [appendToDisplay, calculate, handleApply, backspace, hasResult])

  return (
    <Card className={cn("p-4 w-full max-w-[320px] shadow-xl select-none touch-none", className)}>
      {/* Display Area */}
      <div className="bg-muted/50 rounded-lg p-4 mb-4 flex flex-col items-end justify-center min-h-[80px] overflow-hidden">
        <div className="text-xs text-muted-foreground font-mono h-4 uppercase tracking-wider">
          {formula}
        </div>
        <div className="text-3xl font-bold font-mono truncate w-full text-right leading-none">
          {display}
        </div>
      </div>

      {/* Calculator Grid */}
      <div className="grid grid-cols-4 gap-2">
        <Button variant="ghost" className="text-destructive hover:bg-destructive/10 font-bold" onClick={() => { setDisplay('0'); setFormula(''); }}>C</Button>
        <Button variant="ghost" onClick={backspace} aria-label="backspace"><Delete className="h-5 w-5" /></Button>
        <Button variant="secondary" className="text-primary font-bold text-lg" onClick={() => appendToDisplay('÷')}>÷</Button>
        <Button variant="secondary" className="text-primary font-bold text-lg" onClick={() => appendToDisplay('×')}>×</Button>

        {['7', '8', '9'].map(n => <Button key={n} variant="outline" className="text-lg h-12" onClick={() => appendToDisplay(n)}>{n}</Button>)}
        <Button variant="secondary" className="text-primary font-bold text-lg" onClick={() => appendToDisplay('-')}>-</Button>

        {['4', '5', '6'].map(n => <Button key={n} variant="outline" className="text-lg h-12" onClick={() => appendToDisplay(n)}>{n}</Button>)}
        <Button variant="secondary" className="text-primary font-bold text-lg" onClick={() => appendToDisplay('+')}>+</Button>

        <div className="grid grid-cols-3 col-span-3 gap-2">
          {['1', '2', '3', '0', '.'].map((n) => (
            <Button 
              key={n} 
              variant="outline" 
              className={cn("text-lg h-12", n === '0' && "col-span-1")} 
              onClick={() => appendToDisplay(n)}
            >
              {n}
            </Button>
          ))}
          <Button variant="default" className="bg-primary" onClick={calculate} aria-label="calculate">
            <Equal className="h-5 w-5" />
          </Button>
        </div>

        <Button 
          className="h-auto row-span-2 bg-green-600 hover:bg-green-700 text-white" 
          onClick={handleApply}
        >
          <Check className="h-6 w-6" />
        </Button>
      </div>
    </Card>
  )
}