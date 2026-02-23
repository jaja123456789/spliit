import { RecurrenceRule, SplitMode } from '@prisma/client'
import Decimal from 'decimal.js'
import * as z from 'zod'

const paymentProfileSchema = z
  .object({
    venmo: z.string().nullish(),
    paypal: z.string().nullish(),
    cashapp: z.string().nullish(),
    revolut: z.string().nullish(),
    phone: z.string().nullish(),
  })
  .nullish()

export const groupFormSchema = z
  .object({
    name: z.string().min(2, 'min2').max(50, 'max50'),
    information: z.string().optional(),
    currency: z.string().min(1, 'min1').max(5, 'max5'),
    currencyCode: z.union([z.string().length(3).nullish(), z.literal('')]), // ISO-4217 currency code
    simplifyDebts: z.boolean().default(true),
    participants: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string().min(2, 'min2').max(50, 'max50'),
          paymentProfile: paymentProfileSchema,
        }),
      )
      .min(1),
  })
  .superRefine(({ participants }, ctx) => {
    participants.forEach((participant, i) => {
      participants.slice(0, i).forEach((otherParticipant) => {
        if (otherParticipant.name === participant.name) {
          ctx.addIssue({
            code: 'custom',
            message: 'duplicateParticipantName',
            path: ['participants', i, 'name'],
          })
        }
      })
    })
  })

export type GroupFormValues = z.infer<typeof groupFormSchema>

const inputCoercedToNumber = z.union([
  z.number(),
  z.string().transform((value, ctx) => {
    const valueAsNumber = Number(value)
    if (Number.isNaN(valueAsNumber))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'invalidNumber',
      })
    return valueAsNumber
  }),
])

const expenseItemSchema = z.object({
  id: z.string().optional(), // Optional for new items
  name: z.string().min(1, 'Item name required'),
  price: z.union([
    z.number(),
    z.string().transform((val) => {
      const num = Number(val.replace(/,/g, '.'))
      return isNaN(num) ? 0 : num
    }),
  ]),
  participantIds: z.array(z.string()),
})

export const expenseFormSchema = z
  .object({
    expenseDate: z.coerce.date(),
    title: z.string({ required_error: 'titleRequired' }).min(2, 'min2'),
    category: z.coerce.number().default(0),
    // amount is purely optional/derived. We ignore input.
    amount: z.number().optional(),

    originalAmount: z
      .union([
        z.literal('').transform(() => undefined),
        inputCoercedToNumber
          .refine((amount) => amount != 0, 'amountNotZero')
          .refine((amount) => amount <= 10_000_000_00, 'amountTenMillion'),
      ])
      .optional(),
    originalCurrency: z.union([z.string().length(3).nullish(), z.literal('')]),
    conversionRate: z
      .union([
        z.literal('').transform(() => undefined),
        inputCoercedToNumber.refine((amount) => amount > 0, 'ratePositive'),
      ])
      .optional(),

    paidBy: z
      .array(
        z.object({
          participant: z.string(),
          // The inner transform handles string->number conversion immediately
          // so 'amount' is a number by the time we reach superRefine
          amount: z.union([
            z.number(),
            z.string().transform((value, ctx) => {
              const normalizedValue = value.replace(/,/g, '.')
              const valueAsNumber = Number(normalizedValue)
              if (Number.isNaN(valueAsNumber))
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: 'invalidNumber',
                })
              return valueAsNumber
            }),
          ]),
          originalAmount: z.string().optional(),
        }),
      )
      .min(1, 'paidByMin1')
      .superRefine((items, ctx) => {
        const participants = new Set()
        items.forEach((item, index) => {
          if (participants.has(item.participant)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'duplicateParticipant',
              path: [index, 'participant'],
            })
          }
          participants.add(item.participant)
        })
      }),

    paidFor: z
      .array(
        z.object({
          participant: z.string(),
          originalAmount: z.string().optional(),
          shares: z.union([
            z.number(),
            z.string().transform((value, ctx) => {
              const normalizedValue = value.replace(/,/g, '.')
              const valueAsNumber = Number(normalizedValue)
              if (Number.isNaN(valueAsNumber))
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: 'invalidNumber',
                })
              return value
            }),
          ]),
        }),
      )
      .min(1, 'paidForMin1')
      .superRefine((paidFor, ctx) => {
        for (const { shares } of paidFor) {
          const shareNumber = Number(shares)
          if (shareNumber <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'noZeroShares',
            })
          }
        }
      }),
    items: z.array(expenseItemSchema).default([]),
    splitMode: z
      .enum<SplitMode, [SplitMode, ...SplitMode[]]>(
        Object.values(SplitMode) as any,
      )
      .default('EVENLY'),
    saveDefaultSplittingOptions: z.boolean(),
    isReimbursement: z.boolean(),
    documents: z
      .array(
        z.object({
          id: z.string(),
          url: z.string().url(),
          width: z.number().int().min(1),
          height: z.number().int().min(1),
        }),
      )
      .default([]),
    notes: z.string().optional(),
    recurrenceRule: z
      .enum<RecurrenceRule, [RecurrenceRule, ...RecurrenceRule[]]>(
        Object.values(RecurrenceRule) as any,
      )
      .default('NONE'),
  })
  // 1. Validation Logic: Run this on the object state *before* transforming the shape
  .superRefine((expense, ctx) => {
    // Calculate total locally for validation
    // Note: p.amount is already a number here due to the inner Zod schema on paidBy
    const totalAmount = expense.paidBy.reduce(
      (sum, p) => sum.add(new Decimal(p.amount || 0)),
      new Decimal(0),
    )

    if (expense.items && expense.items.length > 0) {
      const itemsTotal = expense.items.reduce(
        (sum, item) => sum.add(new Decimal(item.price || 0)),
        new Decimal(0),
      )
      if (!itemsTotal.minus(totalAmount).abs().lt(0.01)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'itemTotalMismatch',
          path: ['items'],
        })
      }
      // If we have items, we skip the manual paidFor sum check because
      // the transform will overwrite paidFor anyway.
      return
    }

    if (totalAmount.isZero()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'amountNotZero',
        path: ['paidBy'],
      })
    }

    switch (expense.splitMode) {
      case 'BY_AMOUNT': {
        const sum = expense.paidFor.reduce(
          (sum, { shares }) => new Decimal(shares || 0).add(sum),
          new Decimal(0),
        )
        // BETTER FIX: Use epsilon comparison (1 cent) instead of string toFixed
        if (!sum.minus(totalAmount).abs().lt(0.01)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'amountSum',
            path: ['paidFor'],
          })
        }
        break
      }
      case 'BY_PERCENTAGE': {
        const sum = expense.paidFor.reduce(
          (sum, { shares }) =>
            sum +
            (typeof shares === 'string'
              ? Math.round(Number(shares) * 100)
              : Number(shares)),
          0,
        )
        if (sum !== 10000) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'percentageSum',
            path: ['paidFor'],
          })
        }
        break
      }
    }
  })
  // 2. Output Transformation: Prepare final data structure for API/DB
  .transform((expense) => {
    const inputTotal = expense.paidBy
      .reduce((sum, p) => sum.add(new Decimal(p.amount || 0)), new Decimal(0))
      .toNumber()

    let finalAmount = inputTotal
    let paidBy = expense.paidBy
    let paidFor = expense.paidFor
    let items = expense.items

    if (expense.items && expense.items.length > 0) {
      // 1. Separate included vs excluded items
      const includedItems = expense.items.filter(
        (i) => i.participantIds.length > 0,
      )

      // 2. Calculate the "Split Total" (the real expense)
      const splitTotal = includedItems
        .reduce(
          (sum, item) => sum.add(new Decimal(item.price || 0)),
          new Decimal(0),
        )
        .toNumber()

      // 3. Determine the scaling ratio
      // (If receipt was $100 and we split $80, we scale "paidBy" amounts by 0.8)
      const ratio = inputTotal > 0 ? splitTotal / inputTotal : 0

      finalAmount = splitTotal
      items = includedItems

      // 4. Adjust PaidBy amounts so (Sum PaidBy === Sum Included Items)
      paidBy = expense.paidBy.map((pb) => ({
        ...pb,
        amount: new Decimal(pb.amount).mul(ratio).toNumber(),
      }))

      // 5. Generate distribution from items
      const distribution: Record<string, number> = {}
      includedItems.forEach((item) => {
        const itemPrice = Number(item.price)
        const partCount = item.participantIds.length
        const share = itemPrice / partCount
        item.participantIds.forEach((pid) => {
          distribution[pid] = (distribution[pid] || 0) + share
        })
      })

      paidFor = Object.entries(distribution).map(([participantId, amount]) => ({
        participant: participantId,
        shares: amount,
        originalAmount: undefined,
      }))

      expense.splitMode = 'BY_AMOUNT'
    } else {
      // ... existing paidFor map logic ...
      paidBy = expense.paidBy.map((pb) => ({
        ...pb,
        amount: Number(pb.amount),
      }))
      paidFor = expense.paidFor.map((pf) => ({
        ...pf,
        shares: Number(pf.shares),
      }))
    }

    return {
      ...expense,
      amount: finalAmount,
      paidBy,
      paidFor,
      items: items.map((i) => ({ ...i, price: Number(i.price) })),
    }
  })

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>

export type SplittingOptions = {
  // Used for saving default splitting options in localStorage
  splitMode: SplitMode
  paidFor: ExpenseFormValues['paidFor'] | null
}
