/**
 * The colour of a category group, as a CSS colour: the badge on an expense row and the bars in
 * Stats use the same one, so "blue is home" holds across the app. The hues are tokens in
 * `globals.css` (`--cat-*`), with lighter twins in dark mode.
 */
const TOKENS: Record<string, string> = {
  'Food and Drink': '--cat-food',
  Home: '--cat-home',
  Utilities: '--cat-utilities',
  Transportation: '--cat-transport',
  Entertainment: '--cat-entertainment',
  Life: '--cat-life',
}

export function categoryColor(grouping: string | null | undefined): string {
  return `hsl(var(${TOKENS[grouping ?? ''] ?? '--cat-general'}))`
}

/** "General" and "Payment" say nothing a badge could add. */
export function isUncategorized(grouping: string | null | undefined): boolean {
  return !grouping || grouping === 'Uncategorized'
}
