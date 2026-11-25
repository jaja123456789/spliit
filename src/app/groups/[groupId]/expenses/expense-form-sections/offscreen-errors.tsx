'use client'
import { useMessages } from 'next-intl'
import { FieldErrors } from 'react-hook-form'

/** An array field's message about itself, wherever React Hook Form put it this time. */
function ownMessage(error: unknown): string | undefined {
  const e = error as
    | { message?: unknown; root?: { message?: unknown } }
    | undefined
  const message = e?.root?.message ?? e?.message
  return typeof message === 'string' && message.length > 0 ? message : undefined
}

/**
 * Validation messages for fields that are not on screen, so a save they block still says why.
 *
 * The split's message is shown beside the custom rows and nowhere else; the lines' beside the
 * items, which only By item shows; the attached documents have no message of their own at all. Any
 * of them failing used to leave Create doing nothing, with nothing on screen to explain it.
 */
export function OffscreenErrors({
  errors,
  showPaidFor,
  showItems,
}: {
  errors: FieldErrors
  showPaidFor: boolean
  showItems: boolean
}) {
  const messages = useMessages()
  const schemaErrors = (messages.SchemaErrors ?? {}) as Record<string, string>
  const translate = (key: string) =>
    schemaErrors[key] ?? schemaErrors.checkInputs

  const keys: string[] = []
  if (showPaidFor && errors.paidFor) {
    keys.push(ownMessage(errors.paidFor) ?? 'checkInputs')
  }
  if (showItems && errors.items) {
    keys.push(ownMessage(errors.items) ?? 'checkInputs')
  }
  if (errors.documents) keys.push('documentsInvalid')

  const lines = Array.from(new Set(keys.map(translate)))
  if (lines.length === 0) return null
  return (
    <div
      role="alert"
      data-testid="offscreen-errors"
      className="mt-4 space-y-1 text-sm font-medium text-destructive"
    >
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  )
}
