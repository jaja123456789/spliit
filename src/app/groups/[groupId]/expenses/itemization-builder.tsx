'use client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CalculatorInput } from '@/components/ui/calculator-input'
import { FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn, formatCurrency } from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { Check, Plus, Trash2, Users } from 'lucide-react'
import { useLocale } from 'next-intl'
import { useFieldArray, useFormContext } from 'react-hook-form'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>

interface Props {
  group: Group
  currency: any
  totalAmount: number
}

export function ItemizationBuilder({ group, currency, totalAmount }: Props) {
  const { control, watch, setValue, trigger } = useFormContext()
  const locale = useLocale()
  
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  })

  const items = watch('items') || []
  const currentTotal = items.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0)
  const remaining = totalAmount - currentTotal
  const isBalanced = Math.abs(remaining) < 0.01

  // Helper to build the personalized string
  const getPayerSummary = (selectedIds: string[]) => {
    if (selectedIds.length === 0) return 'No one'
    if (selectedIds.length === group.participants.length && group.participants.length > 1) return 'Everyone'

    const names = selectedIds
      .map((id) => group.participants.find((p) => p.id === id)?.name)
      .filter(Boolean)

    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]} & ${names[1]}`
    return `${names[0]}, ${names[1]} & ${names.length - 2} more`
  }

  return (
    <div className="sticky top-0 z-10 bg-card/95 backdrop-blur py-2 justify-between items-center mb-2 border-b">
        <div className="space-y-4">
        <div className="flex justify-between items-center mb-2">
            <div className="text-sm font-medium flex items-center gap-2">
            Receipt Items
            <Badge variant="outline" className="font-mono text-[10px]">
                {fields.length}
            </Badge>
            </div>
            <div className={cn(
            "text-xs font-mono px-2 py-1 rounded-full border transition-colors",
            isBalanced 
                ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800" 
                : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
            )}>
            {isBalanced ? (
                <span className="flex items-center gap-1"><Check className="w-3 h-3"/> Balanced</span>
            ) : (
                <span>Remaining: {formatCurrency(currency, remaining, locale, true)}</span>
            )}
            </div>
        </div>

        <div className="space-y-3">
            {fields.map((field, index) => {
            const itemPrice = Number(items[index]?.price) || 0
            const participantIds = items[index]?.participantIds || []
            const perPersonAmount = participantIds.length > 0 ? itemPrice / participantIds.length : 0
            const summaryText = getPayerSummary(participantIds)

            return (
                <div key={field.id} className="group relative flex flex-col gap-2 p-3 rounded-lg bg-muted/20 border hover:border-primary/40 transition-all shadow-sm">
                <div className="flex gap-2 items-start">
                    <div className="flex-1">
                    <FormField
                        control={control}
                        name={`items.${index}.name`}
                        render={({ field }) => (
                        <FormItem>
                            <FormControl>
                            <Input {...field} placeholder="Item name..." className="h-9 text-sm bg-background border-none shadow-none focus-visible:ring-1" />
                            </FormControl>
                        </FormItem>
                        )}
                    />
                    </div>
                    <div className="w-[110px]">
                    <FormField
                        control={control}
                        name={`items.${index}.price`}
                        render={({ field }) => (
                        <FormItem className='space-y-0 flex items-center'>
                            <span className="mr-2 text-sm text-muted-foreground">{group.currency}</span>
                            <FormControl>
                            <CalculatorInput 
                                {...field} 
                                placeholder="0.00" 
                                inputClassName="h-9 text-sm text-right bg-background"
                                onValueChange={(val) => {
                                    // Update the specific field
                                    field.onChange(val);
                                    // Manually trigger validation on the parent 'items' array
                                    // This forces superRefine to re-run the total check
                                    trigger('items');
                                    // Also trigger paidBy to clear any "Amount cannot be 0" errors
                                    trigger('paidBy');
                                }}
                            />
                            </FormControl>
                        </FormItem>
                        )}
                    />
                    </div>
                    
                    <Popover>
                    <PopoverTrigger asChild>
                        <Button 
                        variant={participantIds.length === 0 ? "outline" : "secondary"} 
                        size="icon" 
                        className="h-9 w-9 shrink-0 relative" 
                        type="button"
                        >
                        <Users className="h-4 w-4" />
                        {participantIds.length > 0 && participantIds.length < group.participants.length && (
                            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold border-2 border-background">
                            {participantIds.length}
                            </span>
                        )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="end">
                        <div className="space-y-1">
                        <div className="flex justify-between items-center px-2 pb-2 border-b mb-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Split among</span>
                            <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-auto p-1 text-[10px] text-primary hover:bg-primary/10"
                            onClick={() => {
                                const allIds = group.participants.map(p => p.id);
                                const isAllSelected = participantIds.length === group.participants.length;
                                setValue(`items.${index}.participantIds`, isAllSelected ? [] : allIds);
                            }}
                            >
                            {participantIds.length === group.participants.length ? 'Clear' : 'Select All'}
                            </Button>
                        </div>
                        <FormField
                            control={control}
                            name={`items.${index}.participantIds`}
                            render={({ field }) => (
                            <div className="max-h-[200px] overflow-y-auto grid grid-cols-1 gap-0.5">
                                {group.participants.map(participant => {
                                const isSelected = field.value?.includes(participant.id)
                                return (
                                    <div 
                                    key={participant.id}
                                    className={cn(
                                        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent text-sm transition-colors",
                                        isSelected && "bg-primary/5 font-medium text-primary"
                                    )}
                                    onClick={() => {
                                        const current = field.value || []
                                        const next = isSelected 
                                        ? current.filter((id: string) => id !== participant.id)
                                        : [...current, participant.id]
                                        field.onChange(next)
                                    }}
                                    >
                                    <div className={cn(
                                        "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                                        isSelected ? "bg-primary border-primary" : "border-muted-foreground/30 bg-background"
                                    )}>
                                        {isSelected && <Check className="w-3 h-3 text-primary-foreground stroke-[3]" />}
                                    </div>
                                    <span className="truncate">{participant.name}</span>
                                    </div>
                                )
                                })}
                            </div>
                            )}
                        />
                        </div>
                    </PopoverContent>
                    </Popover>

                    <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => remove(index)}
                    type="button"
                    >
                    <Trash2 className="h-4 w-4" />
                    </Button>
                </div>

                {/* Personalized Summary Row */}
                <div className="flex items-center justify-between px-1 text-[11px] leading-tight">
                    <div className="text-muted-foreground truncate max-w-[70%]">
                    <span className="font-medium text-foreground/80">{summaryText}</span>
                    {participantIds.length > 1 ? ' will each pay' : ' will pay'}
                    </div>
                    {participantIds.length > 0 && itemPrice > 0 && (
                    <div className="font-bold text-primary whitespace-nowrap">
                        {formatCurrency(currency, perPersonAmount, locale, true)}
                    </div>
                    )}
                </div>
                </div>
            )
            })}
        </div>

        {!isBalanced && Math.abs(remaining) > 0.01 && (
            <div className="flex justify-center">
            <Button 
                type="button"
                variant="outline" 
                size="sm"
                className="text-[10px] h-7 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                onClick={() => {
                append({ 
                    name: 'Adjustment', 
                    price: Number(remaining.toFixed(2)),
                    participantIds: group.participants.map(p => p.id) 
                });
                // Trigger validation after the state update
                setTimeout(() => trigger(['items', 'paidBy']), 0);
                }}
            >
                Add {formatCurrency(currency, remaining, locale, true)} as adjustment item
            </Button>
            </div>
        )}

        <Button
            type="button"
            variant="outline"
            className="w-full border-dashed py-8 bg-background hover:bg-muted/50 transition-all flex flex-col gap-1"
            onClick={() => {
                // If there is a remaining balance, default the new item to that price
                const nextAmount = remaining > 0 ? Number(remaining.toFixed(2)) : 0
                append({ 
                    name: '', // Leave name empty so user focuses there
                    price: nextAmount,
                    participantIds: group.participants.map(p => p.id) 
                })
                
                // IMPROVEMENT: After appending, we can focus the new input 
                // (requires a small ref tweak, but even without it, this is better)
            }}
        >
            <Plus className="w-5 h-5" />
            <span className="text-xs uppercase font-bold tracking-widest text-muted-foreground">Add Item</span>
        </Button>

        <FormField
            control={control}
            name="items"
            render={() => <FormMessage />}
        />
        </div>
    </div>
  )
}