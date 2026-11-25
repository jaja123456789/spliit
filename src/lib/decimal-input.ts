/**
 * What someone typed into a number field, with the decimal separator made a point.
 *
 * A phone's decimal keypad in most of Europe has a comma and no point, and every amount, share and
 * percentage field passed "12,50" through untouched. The form read it with `Number()` — NaN, so 0 —
 * and the schema threw, refused, or said the percentages did not add up. One rule here, at the
 * field, means nothing downstream has to know.
 *
 * - One kind of separator, once: it is the decimal separator ("12,50", "12.50").
 * - Both kinds: the last one is the decimal separator, the others group thousands ("1.234,56",
 *   "1,234.56").
 * - The same kind more than once: thousands ("1,234,567", "1.234.567").
 *
 * Anything else — letters, a minus, operators — is left alone for validation to judge.
 */
export function normalizeDecimalInput(text: string): string {
  const commas = (text.match(/,/g) ?? []).length
  const points = (text.match(/\./g) ?? []).length
  if (commas === 0 && points <= 1) return text
  if (commas > 0 && points > 0) {
    const decimal = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.'
    const grouping = decimal === ',' ? /\./g : /,/g
    return text.replace(grouping, '').replace(',', '.')
  }
  if (commas === 1) return text.replace(',', '.')
  // Several of one kind and none of the other: grouping only.
  return text.replace(commas > 1 ? /,/g : /\./g, '')
}
