import { getRecentGroups } from '@/app/groups/recent-groups-helpers'
import { SubmitButton } from '@/components/submit-button'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Locale } from '@/i18n/request'
import {
  NEW_GROUP_ACTIVE_USER_KEY,
  NO_ACTIVE_USER,
  readActiveUser,
  writeActiveUser,
} from '@/lib/active-user'
import { getGroup } from '@/lib/api'
import { defaultCurrencyList, getCurrency } from '@/lib/currency'
import { GroupFormValues, groupFormSchema } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreditCard, Save, Smartphone, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { CurrencySelector } from './currency-selector'
import { GROUP_ICONS, GroupMark } from './group-mark'
import { Switch } from './ui/switch'
import { Textarea } from './ui/textarea'

export type Props = {
  group?: NonNullable<Awaited<ReturnType<typeof getGroup>>>
  onSubmit: (
    groupFormValues: GroupFormValues,
    participantId?: string,
  ) => Promise<void>
  protectedParticipantIds?: string[]
}

export function GroupForm({
  group,
  onSubmit,
  protectedParticipantIds = [],
}: Props) {
  const locale = useLocale()
  const t = useTranslations('GroupForm')
  const defaultCurrencyCode =
    process.env.NEXT_PUBLIC_DEFAULT_CURRENCY_CODE || 'USD'
  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: group
      ? {
          name: group.name,
          information: group.information ?? '',
          currency: group.currency ?? '',
          currencyCode: group.currencyCode ?? '',
          icon: group.icon ?? null,
          participants: group.participants.map((p) => ({
            id: p.id,
            name: p.name,
            paymentProfile: (p.paymentProfile as any) ?? {},
          })),
          simplifyDebts: group.simplifyDebts ?? true,
        }
      : {
          name: '',
          icon: null,
          information: '',
          currency: getCurrency(defaultCurrencyCode, locale as Locale).symbol,
          currencyCode: defaultCurrencyCode,
          // Two empty rows, the first one yours. These used to be three filled-in names, John,
          // Jane and Jack, which every new group began by deleting or overwriting.
          participants: [{ name: '' }, { name: '' }],
          simplifyDebts: true,
        },
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'participants',
    keyName: 'key',
  })

  // Which row is you, keyed by the row rather than the name: two participants may share a name,
  // and a row added a moment ago has no participant id yet. A participant's id when it has one,
  // the form's own key for the row otherwise. In a new group the first row is you until you say
  // otherwise; in an existing one it is whatever this device remembers.
  const rowKey = (item: (typeof fields)[number]) => item.id || item.key
  const [activeUser, setActiveUser] = useState<string | null>(null)
  useEffect(() => {
    if (activeUser !== null) return
    if (group?.id) setActiveUser(readActiveUser(group.id) ?? NO_ACTIVE_USER)
    else if (fields[0]) setActiveUser(rowKey(fields[0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUser, group, fields])

  const activeParticipantId = () =>
    group &&
    activeUser &&
    activeUser !== NO_ACTIVE_USER &&
    group.participants.some((p) => p.id === activeUser)
      ? activeUser
      : undefined

  const updateActiveUser = () => {
    if (!activeUser) return
    const index = fields.findIndex((f) => rowKey(f) === activeUser)
    const name =
      index >= 0 ? form.getValues(`participants.${index}.name`) : undefined
    if (group?.id) {
      const id = activeParticipantId()
      writeActiveUser(group.id, id ?? null)
      // A row added in this edit has no id until the save comes back, so it is handed over by
      // name, the same way a new group's is.
      if (!id && name) localStorage.setItem(`${group.id}-newUser`, name)
    } else {
      // A group being created has no participant ids yet, so the choice travels as a name and is
      // exchanged for an id on the first visit to the group.
      localStorage.setItem(NEW_GROUP_ACTIVE_USER_KEY, name || NO_ACTIVE_USER)
    }
  }

  // A new group most likely uses the currency of the last group you opened, not the instance's
  // default (USD unless NEXT_PUBLIC_DEFAULT_CURRENCY_CODE says otherwise).
  const [lastGroupId] = useState(() =>
    group || typeof window === 'undefined'
      ? undefined
      : getRecentGroups()[0]?.id,
  )
  const lastGroup = trpc.groups.get.useQuery(
    { groupId: lastGroupId ?? '' },
    { enabled: !!lastGroupId },
  )
  useEffect(() => {
    const code = lastGroup.data?.group?.currencyCode
    if (group || !code || form.getFieldState('currencyCode').isDirty) return
    form.setValue('currencyCode', code)
    form.setValue('currency', getCurrency(code, locale as Locale).symbol)
  }, [lastGroup.data, group, form, locale])

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          await onSubmit(values, activeParticipantId())
        })}
      >
        <Card bleed className="mb-4">
          <CardHeader>
            <CardTitle>{t('title')}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('NameField.label')}</FormLabel>
                  {/* The group's plate sits beside its name, and choosing an emoji for it is a tap
                      on the plate. */}
                  <div className="flex items-center gap-2">
                    <FormField
                      control={form.control}
                      name="icon"
                      render={({ field: icon }) => (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={t('IconField.choose')}
                              data-testid="group-icon-trigger"
                            >
                              <GroupMark
                                group={{
                                  id: group?.id ?? 'new',
                                  name: form.watch('name') || '?',
                                  icon: icon.value,
                                }}
                                size={44}
                              />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-72">
                            <p className="section-label mb-2">
                              {t('IconField.label')}
                            </p>
                            <div className="grid grid-cols-8 gap-1">
                              {GROUP_ICONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  aria-pressed={icon.value === emoji}
                                  onClick={() =>
                                    icon.onChange(
                                      icon.value === emoji ? null : emoji,
                                    )
                                  }
                                  className={cn(
                                    'grid h-8 w-8 place-items-center rounded-md text-lg hover:bg-accent',
                                    icon.value === emoji &&
                                      'bg-accent ring-2 ring-inset ring-foreground',
                                  )}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                            {icon.value && (
                              <Button
                                type="button"
                                variant="link"
                                className="mt-2 h-auto p-0"
                                onClick={() => icon.onChange(null)}
                              >
                                {t('IconField.none')}
                              </Button>
                            )}
                          </PopoverContent>
                        </Popover>
                      )}
                    />
                    <FormControl>
                      <Input
                        className="text-base sm:text-base"
                        placeholder={t('NameField.placeholder')}
                        {...field}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="currencyCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('CurrencyCodeField.label')}</FormLabel>
                  <FormControl>
                    <CurrencySelector
                      currencies={defaultCurrencyList(
                        locale as Locale,
                        t('CurrencyCodeField.customOption'),
                      )}
                      defaultValue={form.watch(field.name) ?? ''}
                      onValueChange={(newCurrency) => {
                        field.onChange(newCurrency)
                        const currency = getCurrency(newCurrency)
                        if (
                          currency.code.length ||
                          form.getFieldState('currency').isTouched
                        )
                          form.setValue('currency', currency.symbol, {
                            shouldValidate: true,
                            shouldTouch: true,
                            shouldDirty: true,
                          })
                      }}
                      isLoading={false}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      group
                        ? 'CurrencyCodeField.editDescription'
                        : 'CurrencyCodeField.createDescription',
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem hidden={!!form.watch('currencyCode')?.length}>
                  <FormLabel>{t('CurrencyField.label')}</FormLabel>
                  <FormControl>
                    <Input
                      className="text-base sm:text-base"
                      placeholder={t('CurrencyField.placeholder')}
                      max={5}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('CurrencyField.description')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="col-span-2">
              <FormField
                control={form.control}
                name="information"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('InformationField.label')}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        className="text-base sm:text-base"
                        {...field}
                        placeholder={t('InformationField.placeholder')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="col-span-2">
              <FormField
                control={form.control}
                name="simplifyDebts"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 col-span-2">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        {t('Settings.SimplifyDebts.label')}
                      </FormLabel>
                      <FormDescription>
                        {t('Settings.SimplifyDebts.description')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value ?? true}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card bleed className="mb-4">
          <CardHeader>
            <CardTitle>{t('Participants.title')}</CardTitle>
            <CardDescription>{t('Participants.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul
              className="flex flex-col gap-2"
              aria-label={t('Participants.whoIsYou')}
            >
              {fields.map((item, index) => (
                <li key={item.key}>
                  <FormField
                    control={form.control}
                    name={`participants.${index}.name`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">
                          {t('Participants.label', { number: index + 1 })}
                        </FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              className="text-base sm:text-base"
                              {...field}
                              placeholder={
                                !group && index === 0
                                  ? t('Participants.yourName')
                                  : t('Participants.new')
                              }
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            aria-pressed={activeUser === rowKey(item)}
                            aria-label={t('Participants.thisIsMe', {
                              name: field.value || t('Participants.new'),
                            })}
                            onClick={() =>
                              setActiveUser(
                                activeUser === rowKey(item)
                                  ? NO_ACTIVE_USER
                                  : rowKey(item),
                              )
                            }
                            className={cn(
                              'h-11 shrink-0 px-3 text-sm sm:h-10',
                              activeUser === rowKey(item)
                                ? 'border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background'
                                : 'text-muted-foreground',
                            )}
                          >
                            {t('Participants.me')}
                          </Button>
                          {item.id &&
                          protectedParticipantIds.includes(item.id) ? (
                            // A hover card was unreachable by touch, so on a phone this button
                            // was simply dead with no explanation. A popover opens on tap, which
                            // also means the button must stay enabled to receive the tap.
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  type="button"
                                  size="icon"
                                  aria-label={t(
                                    'Participants.protectedParticipant',
                                  )}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                align="end"
                                className="w-64 text-sm"
                              >
                                {t('Participants.protectedParticipant')}
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <Button
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => remove(index)}
                              type="button"
                              size="icon"
                              aria-label={t('Participants.remove', {
                                name: field.value || t('Participants.new'),
                              })}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Payment Methods"
                                className={
                                  form.watch(
                                    `participants.${index}.paymentProfile`,
                                  )
                                    ? 'text-foreground bg-accent'
                                    : 'text-muted-foreground'
                                }
                              >
                                <CreditCard className="w-4 h-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80" align="end">
                              <div className="grid gap-4">
                                <div className="space-y-1">
                                  <h4 className="font-medium leading-none">
                                    Payment Methods
                                  </h4>
                                  <p className="text-xs text-muted-foreground">
                                    Add details to enable direct repayment
                                    links.
                                  </p>
                                </div>

                                <div className="grid gap-4">
                                  {/* Payment Apps Section */}
                                  <div className="space-y-2">
                                    <h5 className="section-label">
                                      Payment Apps
                                    </h5>
                                    {[
                                      'venmo',
                                      'paypal',
                                      'cashapp',
                                      'revolut',
                                    ].map((provider) => (
                                      <FormField
                                        key={provider}
                                        control={form.control}
                                        name={
                                          `participants.${index}.paymentProfile.${provider}` as any
                                        }
                                        render={({ field }) => (
                                          <FormItem className="grid grid-cols-3 items-center gap-3 space-y-0">
                                            <FormLabel className="capitalize text-xs cursor-pointer">
                                              {provider}
                                            </FormLabel>
                                            <div className="col-span-2">
                                              <FormControl>
                                                <Input
                                                  className="h-11 sm:h-8 text-base sm:text-sm"
                                                  placeholder="username"
                                                  {...field}
                                                  value={
                                                    (field.value as string) ??
                                                    ''
                                                  }
                                                />
                                              </FormControl>
                                            </div>
                                          </FormItem>
                                        )}
                                      />
                                    ))}
                                  </div>

                                  {/* Manual Section */}
                                  <div className="space-y-2 pt-2 border-t">
                                    <h5 className="section-label">
                                      Manual Details
                                    </h5>

                                    <FormField
                                      control={form.control}
                                      name={
                                        `participants.${index}.paymentProfile.phone` as any
                                      }
                                      render={({ field }) => (
                                        <FormItem className="grid grid-cols-3 items-center gap-3 space-y-0">
                                          <FormLabel className="text-xs cursor-pointer flex items-center gap-1">
                                            <Smartphone className="w-3 h-3" />{' '}
                                            Phone
                                          </FormLabel>
                                          <div className="col-span-2">
                                            <FormControl>
                                              <Input
                                                className="h-11 sm:h-8 text-base sm:text-sm"
                                                placeholder="+1 234..."
                                                {...field}
                                                value={
                                                  (field.value as string) ?? ''
                                                }
                                              />
                                            </FormControl>
                                          </div>
                                        </FormItem>
                                      )}
                                    />
                                  </div>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter className="flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              {t('Participants.meHint')}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                append({
                  name: '',
                  id: '',
                  paymentProfile: {
                    venmo: '',
                    paypal: '',
                    cashapp: '',
                    revolut: '',
                    phone: '',
                  },
                })
              }}
              type="button"
            >
              {t('Participants.add')}
            </Button>
          </CardFooter>
        </Card>

        {/* Sticky, as on the expense form: Save sat some 1,400px down a 2,000px page, below three
            cards of settings that are mostly changed one at a time. In a group the bar rides above
            the phone's tab bar; creating a group has no tab bar. */}
        <div
          className={cn(
            'sticky z-30 -mx-4 mt-4 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-lg sm:border sm:px-3',
            group
              ? 'bottom-[calc(3.5rem+env(safe-area-inset-bottom))] sm:bottom-2'
              : 'bottom-0 sm:bottom-2',
          )}
        >
          <SubmitButton
            className="h-11 flex-1 sm:h-10 sm:flex-none"
            loadingContent={t(group ? 'Settings.saving' : 'Settings.creating')}
            onClick={updateActiveUser}
          >
            <Save className="w-4 h-4 mr-2" />{' '}
            {t(group ? 'Settings.save' : 'Settings.create')}
          </SubmitButton>
          {!group && (
            <Button variant="ghost" asChild>
              <Link href="/groups">{t('Settings.cancel')}</Link>
            </Button>
          )}
        </div>
      </form>
    </Form>
  )
}
