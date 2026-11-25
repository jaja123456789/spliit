'use client'
import { ProfileAvatar } from '@/components/profile-avatar'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { assignAvatarHues } from '@/lib/avatar-hue'
import { ExpenseFormValues } from '@/lib/schemas'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { useTranslations } from 'next-intl'
import { UseFormReturn } from 'react-hook-form'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>

/**
 * Who a payment went to. A payment has no split — it is one person paying back another — so in
 * place of the split section it has this: the other half of "Bob → Alice". It used to have nothing,
 * which left the recipient of a payment impossible to see or change once it was saved.
 */
export function RecipientField({
  form,
  group,
  activeUserId,
}: {
  form: UseFormReturn<ExpenseFormValues>
  group: Group
  activeUserId: string | null
}) {
  const t = useTranslations('ExpenseForm')
  const avatarHues = assignAvatarHues(group.participants.map((p) => p.name))

  return (
    <FormField
      control={form.control}
      name="paidFor"
      render={({ field }) => (
        <FormItem className="flex flex-col gap-1 space-y-0 px-6 py-3">
          <FormLabel className="text-sm font-normal text-muted-foreground">
            {t('recipientField.label')}
          </FormLabel>
          <Select
            value={
              field.value.length === 1 ? field.value[0].participant : undefined
            }
            onValueChange={(participant) => {
              // Radix's hidden native select reports "" when it syncs; that is not a choice.
              if (!participant) return
              field.onChange([{ participant, shares: '1' }])
            }}
          >
            <FormControl>
              <SelectTrigger
                data-testid="payment-recipient-select"
                className="h-11 w-full justify-between gap-1 rounded-md border bg-card px-3 font-medium shadow-none focus:ring-0 [&>svg]:opacity-40"
              >
                <SelectValue
                  placeholder={
                    // An older payment can have several recipients; name them rather than
                    // pretending nobody was chosen.
                    field.value.length > 1
                      ? field.value
                          .map(
                            ({ participant }) =>
                              group.participants.find(
                                (p) => p.id === participant,
                              )?.name,
                          )
                          .filter(Boolean)
                          .join(', ')
                      : t('recipientField.placeholder')
                  }
                />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {group.participants.map(({ id, name }) => (
                <SelectItem key={id} value={id}>
                  <span className="flex items-center gap-2">
                    <ProfileAvatar
                      name={name}
                      hue={avatarHues.get(name)}
                      isActiveUser={!!activeUserId && activeUserId === id}
                      size={24}
                    />
                    {name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
