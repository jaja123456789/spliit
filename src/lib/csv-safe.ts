/**
 * Text bound for a CSV file, made safe to open in a spreadsheet.
 *
 * A cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is read as a formula by
 * Excel, LibreOffice and Google Sheets. Anyone with a group's link can name an expense, so a title
 * like `=HYPERLINK("https://…","Click")` exported in the statement would run as one on whoever
 * opened it. A leading apostrophe makes the spreadsheet show the text as text.
 *
 * Numbers are left alone, negative ones included: they are what the columns are for.
 */
export function csvSafeText(value: string): string {
  if (!/^[=+\-@\t\r]/.test(value)) return value
  if (/^-?\d+([.,]\d+)?$/.test(value)) return value
  return `'${value}`
}
