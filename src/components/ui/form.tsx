import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { Slot } from "@radix-ui/react-slot"
import {
  Controller,
  ControllerProps,
  FieldPath,
  FieldValues,
  FormProvider,
  useFormContext,
} from "react-hook-form"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { useMessages } from "next-intl"

const Form = FormProvider

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> = {
  name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
)

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState, formState } = useFormContext()

  const fieldState = getFieldState(fieldContext.name, formState)

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>")
  }

  const { id } = itemContext

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

type FormItemContextValue = {
  id: string
}

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
)

const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const id = React.useId()

  return (
    <FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={cn("col-span-2 md:col-span-1 space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  )
})
FormItem.displayName = "FormItem"

const FormLabel = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField()

  return (
    <Label
      ref={ref}
      className={cn(error && "text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  )
})
FormLabel.displayName = "FormLabel"

const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  )
})
FormControl.displayName = "FormControl"

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField()

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
})
FormDescription.displayName = "FormDescription"

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const messages = useMessages()
  const { error, formMessageId } = useFormField()
  // `String(undefined)` is `"undefined"`, and that is what this used to render — in destructive
  // red, under the field — whenever a message was missing. A missing message is nothing to say.
  const translate = (key: unknown) => {
    if (typeof key !== 'string' || key.length === 0) return null
    return (messages.SchemaErrors as any)?.[key] ?? key
  }

  // A field array can carry an error about *itself* — "the lines do not add up to the total" —
  // as opposed to one per row. React Hook Form keeps that message at the top of the error while
  // live validation is running and moves it under `root` once the resolver runs on submit, so
  // reading only one of the two shapes means the message vanishes at exactly the moment someone
  // presses the button.
  const ownMessage =
    (error as { root?: { message?: unknown } } | undefined)?.root?.message ??
    (error as { message?: unknown } | undefined)?.message

  let body
  if (error) {
    if (typeof ownMessage === 'string' && ownMessage.length > 0) {
      body = translate(ownMessage)
    } else if (Array.isArray(error)) {
      // A field array's error is one entry per row, most of them empty. This used to render the
      // string "Please check all inputs" — hardcoded, untranslated, and true of nothing in
      // particular: it named neither the row nor the problem, so the only way to find what was
      // wrong was to re-read every line. Surface the first real message instead; the callers that
      // own rows are responsible for marking which ones.
      const firstMessage = error
        .flatMap((entry) =>
          entry && typeof entry === 'object'
            ? Object.values(entry as Record<string, { message?: unknown }>)
            : [],
        )
        .map((field) => field?.message)
        .find((message) => typeof message === 'string' && message.length > 0)
      body = firstMessage ? translate(firstMessage) : translate('checkInputs')
    } else {
      body = translate(error?.message)
    }
  } else {
    body = children
  }

  if (!body) {
    return null
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  )
})
FormMessage.displayName = "FormMessage"

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
}
