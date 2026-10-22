'use client'

import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import { CategorySelector } from '@/components/category-selector'
import { extractCategoryFromTitle } from '@/components/expense-form-actions'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { ExpenseFormValues } from '@/lib/schemas'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { UseFormReturn, useWatch } from 'react-hook-form'
import { TitleTextarea } from './title-textarea'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>
type Form = UseFormReturn<ExpenseFormValues>
type Wording = 'Expense' | 'Income'

/** What the expense was: its name, and the category glyph that qualifies it. */
export function TitleField({
  form,
  categories,
  sExpense,
  enableCategoryExtract,
}: {
  form: Form
  categories: AppRouterOutput['categories']['list']['categories']
  sExpense: Wording
  enableCategoryExtract: boolean
}) {
  const t = useTranslations('ExpenseForm')
  // The category trigger is an icon; its name has to come from the Categories namespace.
  const tCategories = useTranslations('Categories')
  const [isCategoryLoading, setCategoryLoading] = useState(false)
  const lastExtractedTitleRef = useRef<string | null>(null)
  // The category's *name*, for the label row above the title field. The icon in the trigger says
  // which one is selected only to someone who already knows the icon set; on a phone it is a
  // 20px glyph in a grey square, and there was nothing anywhere on the form that spelled it out.
  const watchedCategory = useWatch({ control: form.control, name: 'category' })
  const selectedCategory = categories.find(
    (category) => category.id === Number(watchedCategory),
  )

  return (
    <FormField
      control={form.control}
      name="title"
      render={({ field }) => (
        <FormItem className="space-y-0">
          <FormLabel className="mb-1 block text-sm font-normal text-muted-foreground">
            {t(`${sExpense}.TitleField.label`)}
          </FormLabel>
          {/* The category's name used to sit at the right of the label row, which put it
                        a full row away from the glyph it names and left the two ends of that line
                        unrelated. It reads as a caption under the title now — the same relation
                        the conversion has to the amount one box down. */}
          <div className="flex items-center gap-3 rounded-xl border border-input bg-card px-3 py-3 transition-shadow focus-within:ring-2 focus-within:ring-primary">
            <FormField
              control={form.control}
              name="category"
              render={({ field: categoryField }) => (
                <CategorySelector
                  categories={categories}
                  defaultValue={categoryField.value}
                  onValueChange={categoryField.onChange}
                  isLoading={isCategoryLoading}
                  renderTrigger={(category) => (
                    <button
                      type="button"
                      data-testid="category-trigger"
                      title={tCategories(
                        `${category.grouping}.${category.name}`,
                      )}
                      aria-label={`${t('categoryField.label')}: ${tCategories(
                        `${category.grouping}.${category.name}`,
                      )}`}
                      // A glyph in a square is a picture; the chevron is what makes
                      // it a control. Tinted with the accent, as the concept draws it:
                      // it is the one control inside these two boxes, and a grey plate
                      // on a white box had nothing to separate it from the box.
                      className="flex h-12 w-14 shrink-0 items-center justify-center gap-0.5 rounded-lg bg-primary/10 px-1 text-primary transition-colors hover:bg-primary/20"
                    >
                      {isCategoryLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CategoryIcon category={category} className="h-4 w-4" />
                      )}
                      <ChevronDown className="h-4 w-4 opacity-40" />
                    </button>
                  )}
                />
              )}
            />
            <div className="min-w-0 flex-1">
              <FormControl>
                <TitleTextarea
                  placeholder={t(`${sExpense}.TitleField.placeholder`)}
                  className="block w-full border-0 bg-transparent px-1 py-0 text-2xl font-bold leading-tight shadow-none outline-none placeholder:text-xl placeholder:font-normal placeholder:text-subtle-foreground focus-visible:ring-0"
                  {...field}
                  onBlur={async () => {
                    field.onBlur()
                    // Guessing the category costs a round trip to a model, so it
                    // should happen when there is a new title to guess from and not
                    // merely whenever the field loses focus: clicking into the amount
                    // and back used to re-ask about a title nobody had touched.
                    const title = field.value?.trim() ?? ''
                    if (
                      !enableCategoryExtract ||
                      !title ||
                      title === lastExtractedTitleRef.current
                    ) {
                      return
                    }
                    lastExtractedTitleRef.current = title
                    setCategoryLoading(true)
                    try {
                      const { categoryId } =
                        await extractCategoryFromTitle(title)
                      form.setValue('category', categoryId)
                    } finally {
                      setCategoryLoading(false)
                    }
                  }}
                />
              </FormControl>
              {selectedCategory && (
                <p
                  data-testid="category-name"
                  className="truncate px-1 pt-1 text-xs text-muted-foreground"
                >
                  {tCategories(
                    `${selectedCategory.grouping}.${selectedCategory.name}`,
                  )}
                </p>
              )}
            </div>
          </div>
          <FormMessage className="mt-1" />
        </FormItem>
      )}
    />
  )
}
