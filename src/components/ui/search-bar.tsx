import * as React from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { Search, XCircle } from 'lucide-react'

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'defaultValue'> {
  onValueChange?: (value: string) => void
  /** What the box starts with — a search carried in the address, say. */
  defaultValue?: string
}

const SearchBar = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onValueChange, defaultValue = '', ...props }, ref) => {
    const t = useTranslations('Expenses')
    const [value, _setValue] = React.useState(defaultValue)

    const setValue = (v: string) => {
      _setValue(v)
      onValueChange && onValueChange(v)
    }

    return (
      <div className="mx-4 sm:mx-6 flex relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type={type}
          className={cn(
            // Was `text-sm focus:text-base` — a hand-rolled dodge for iOS zooming a field under
            // 16px on focus. `Input` carries that now, for every field.
            'pl-10 pr-10 bg-muted border-none text-muted-foreground',
            className,
          )}
          ref={ref}
          placeholder={t("searchPlaceholder")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          {...props}
        />
        {/* A button, not a bare icon with a click handler: it was out of reach of the keyboard
            and had no name for a screen reader. */}
        <button
          type="button"
          aria-label={t('searchClear')}
          className={cn(
            'absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            !value && 'hidden',
          )}
          onClick={() => setValue('')}
        >
          <XCircle className="w-4 h-4" />
        </button>
      </div>
    )
  },
)
SearchBar.displayName = 'SearchBar'

export { SearchBar }
