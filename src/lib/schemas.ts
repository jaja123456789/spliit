import { RecurrenceRule, SplitMode } from '@prisma/client'
import Decimal from 'decimal.js'
import * as z from 'zod'

export const groupFormSchema = z
  .object({
    name: z.string().min(2, 'min2').max(50, 'max50'),
    information: z.string().optional(),
    currency: z.string().min(1, 'min1').max(5, 'max5'),
    currencyCode: z.union([z.string().length(3).nullish(), z.literal('')]), // ISO-4217 currency code
    participants: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string().min(2, 'min2').max(50, 'max50'),
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
    
    paidBy: z.array(
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
      })
    ).min(1, 'paidByMin1')
    .superRefine((items, ctx) => {
       const participants = new Set();
       items.forEach((item, index) => {
         if (participants.has(item.participant)) {
           ctx.addIssue({
             code: z.ZodIssueCode.custom,
             message: "duplicateParticipant",
             path: [index, "participant"]
           })
         }
         participants.add(item.participant);
       });
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
    const totalAmount = expense.paidBy.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

    if (totalAmount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'amountNotZero',
        path: ['paidBy'] // This attaches the error to the paidBy field
      })
    }

    switch (expense.splitMode) {
      case 'EVENLY':
        break 
      case 'BY_SHARES':
        break 
      case 'BY_AMOUNT': {
        const sum = expense.paidFor.reduce(
          (sum, { shares }) => new Decimal(shares || 0).add(sum),
          new Decimal(0),
        )
        // Compare calculated sum against calculated total
        if (!sum.equals(new Decimal(totalAmount))) {
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
    // Recalculate total for the output object
    const totalAmount = expense.paidBy.reduce((sum, p) => sum + Number(p.amount), 0)
    
    const paidFor = expense.paidFor.map((paidFor) => {
        const shares = paidFor.shares
        if (typeof shares === 'string' && expense.splitMode !== 'BY_AMOUNT') {
          return {
            ...paidFor,
            shares: Math.round(Number(shares) * 100),
          }
        }
        return {
          ...paidFor,
          shares: Number(shares),
        }
      })

    const paidBy = expense.paidBy.map(pb => ({
      ...pb,
      amount: Number(pb.amount)
    }))

    return {
      ...expense,
      amount: totalAmount,
      paidBy,
      paidFor,
    }
  })

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>

export type SplittingOptions = {
  // Used for saving default splitting options in localStorage
  splitMode: SplitMode
  paidFor: ExpenseFormValues['paidFor'] | null
}