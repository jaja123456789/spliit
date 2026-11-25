import { expenseFormSchema, groupFormSchema } from './schemas'

describe('expenseFormSchema', () => {
  it('validates required fields', () => {
    const result = expenseFormSchema.safeParse({
      expenseDate: new Date('2025-01-01T00:00:00.000Z'),
      title: 'Dinner',
      category: 0,
      amount: 1000,
      originalAmount: undefined,
      originalCurrency: '',
      conversionRate: undefined,
      paidBy: [{ participant: 'p0', amount: 1000 }],
      paidFor: [{ participant: 'p0', shares: 1 }],
      splitMode: 'EVENLY',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      notes: undefined,
      recurrenceRule: 'NONE',
    })

    expect(result.success).toBe(true)
  })

  it('allows valid recurring rules', () => {
    const result = expenseFormSchema.safeParse({
      expenseDate: new Date('2025-01-01T00:00:00.000Z'),
      title: 'Rent',
      category: 0,
      amount: 1000,
      originalAmount: undefined,
      originalCurrency: '',
      conversionRate: undefined,
      paidBy: [{ participant: 'p0', amount: 1000 }],
      paidFor: [{ participant: 'p0', shares: 1 }],
      splitMode: 'EVENLY',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      notes: undefined,
      recurrenceRule: 'MONTHLY',
    })

    expect(result.success).toBe(true)
  })

  it('fails when title is missing', () => {
    const result = expenseFormSchema.safeParse({
      expenseDate: new Date('2025-01-01T00:00:00.000Z'),
      category: 0,
      amount: 1000,
      originalCurrency: '',
      paidBy: [{ participant: 'p0', amount: 1000 }],
      paidFor: [{ participant: 'p0', shares: 1 }],
      splitMode: 'EVENLY',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      recurrenceRule: 'NONE',
    })

    expect(result.success).toBe(false)
  })

  it('rejects invalid split mode', () => {
    const result = expenseFormSchema.safeParse({
      expenseDate: new Date('2025-01-01T00:00:00.000Z'),
      title: 'Dinner',
      category: 0,
      amount: 1000,
      paidBy: [{ participant: 'p0', amount: 1000 }],
      paidFor: [{ participant: 'p0', shares: 1 }],
      splitMode: 'INVALID_MODE',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      recurrenceRule: 'NONE',
    })

    expect(result.success).toBe(false)
  })

  it('validates currency format', () => {
    const valid = groupFormSchema.safeParse({
      name: 'Trip',
      information: undefined,
      currency: '€',
      currencyCode: 'EUR',
      participants: [{ name: 'Alice' }],
    })

    expect(valid.success).toBe(true)

    const invalid = groupFormSchema.safeParse({
      name: 'Trip',
      information: undefined,
      currency: 'TOO_LONG',
      currencyCode: 'EUR',
      participants: [{ name: 'Alice' }],
    })

    expect(invalid.success).toBe(false)
  })

  it('validates percentage sums to 100%', () => {
    // Invalid: sum < 100% (2500 + 3000 = 5500 = 55%)
    const resultLess = expenseFormSchema.safeParse({
      expenseDate: new Date('2025-01-01T00:00:00.000Z'),
      title: 'Dinner',
      category: 0,
      amount: 1000,
      paidBy: [{ participant: 'p0', amount: 1000 }],
      paidFor: [
        { participant: 'p0', shares: 25 },
        { participant: 'p1', shares: 30 },
      ],
      splitMode: 'BY_PERCENTAGE',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      recurrenceRule: 'NONE',
    })

    expect(resultLess.success).toBe(false)

    // Invalid: sum > 100% (60% + 50% = 110%)
    const resultMore = expenseFormSchema.safeParse({
      expenseDate: new Date('2025-01-01T00:00:00.000Z'),
      title: 'Dinner',
      category: 0,
      amount: 1000,
      paidBy: [{ participant: 'p0', amount: 1000 }],
      paidFor: [
        { participant: 'p0', shares: 60 },
        { participant: 'p1', shares: 50 },
      ],
      splitMode: 'BY_PERCENTAGE',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      recurrenceRule: 'NONE',
    })

    expect(resultMore.success).toBe(false)

    // Valid: sum = 100% (70% + 30%)
    const resultValid = expenseFormSchema.safeParse({
      expenseDate: new Date('2025-01-01T00:00:00.000Z'),
      title: 'Dinner',
      category: 0,
      amount: 1000,
      paidBy: [{ participant: 'p0', amount: 1000 }],
      paidFor: [
        { participant: 'p0', shares: 70 },
        { participant: 'p1', shares: 30 },
      ],
      splitMode: 'BY_PERCENTAGE',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      recurrenceRule: 'NONE',
    })

    expect(resultValid.success).toBe(true)
  })

  it('validates amount sum equals total', () => {
    // Invalid: sum < total (300 + 400 = 700 < 1000)
    const resultLess = expenseFormSchema.safeParse({
      expenseDate: new Date('2025-01-01T00:00:00.000Z'),
      title: 'Dinner',
      category: 0,
      amount: 1000,
      paidBy: [{ participant: 'p0', amount: 1000 }],
      paidFor: [
        { participant: 'p0', shares: 300 },
        { participant: 'p1', shares: 400 },
      ],
      splitMode: 'BY_AMOUNT',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      recurrenceRule: 'NONE',
    })

    expect(resultLess.success).toBe(false)

    // Invalid: sum > total (600 + 700 = 1300 > 1000)
    const resultMore = expenseFormSchema.safeParse({
      expenseDate: new Date('2025-01-01T00:00:00.000Z'),
      title: 'Dinner',
      category: 0,
      amount: 1000,
      paidBy: [{ participant: 'p0', amount: 1000 }],
      paidFor: [
        { participant: 'p0', shares: 600 },
        { participant: 'p1', shares: 700 },
      ],
      splitMode: 'BY_AMOUNT',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      recurrenceRule: 'NONE',
    })

    expect(resultMore.success).toBe(false)

    // Valid: sum = total (600 + 400 = 1000)
    const resultValid = expenseFormSchema.safeParse({
      expenseDate: new Date('2025-01-01T00:00:00.000Z'),
      title: 'Dinner',
      category: 0,
      amount: 1000,
      paidBy: [{ participant: 'p0', amount: 1000 }],
      paidFor: [
        { participant: 'p0', shares: 600 },
        { participant: 'p1', shares: 400 },
      ],
      splitMode: 'BY_AMOUNT',
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      recurrenceRule: 'NONE',
    })

    expect(resultValid.success).toBe(true)
  })
})

describe('groupFormSchema', () => {
  it('validates group creation', () => {
    const result = groupFormSchema.safeParse({
      name: 'Weekend Trip',
      information: 'Beach vacation',
      currency: '$',
      currencyCode: 'USD',
      participants: [{ name: 'Alice' }, { name: 'Bob' }],
    })

    expect(result.success).toBe(true)
  })

  it('requires at least 1 participant (business logic requires 2)', () => {
    // Single participant passes schema validation
    const resultOne = groupFormSchema.safeParse({
      name: 'Solo Trip',
      currency: '$',
      currencyCode: 'USD',
      participants: [{ name: 'Alice' }],
    })

    expect(resultOne.success).toBe(true) // Current behavior

    // Zero participants fails
    const resultZero = groupFormSchema.safeParse({
      name: 'Trip',
      currency: '$',
      currencyCode: 'USD',
      participants: [],
    })

    expect(resultZero.success).toBe(false)

    // Note: Business logic should enforce 2+ participants
    // This test documents current schema behavior
  })

  it('takes any single emoji as the icon, and nothing else', () => {
    const withIcon = (icon: string | null) =>
      groupFormSchema.safeParse({
        name: 'Flat',
        currency: '€',
        currencyCode: 'EUR',
        participants: [{ name: 'Alice' }],
        icon,
      })

    expect(withIcon('🦩').success).toBe(true) // not one of the quick picks
    expect(withIcon('🇲🇹').success).toBe(true)
    expect(withIcon(null).success).toBe(true)
    expect(withIcon('').success).toBe(true)

    const text = withIcon('hello')
    expect(text.success).toBe(false)
    expect(text.error?.issues[0]?.message).toBe('iconNotEmoji')
    expect(withIcon('🏠🏡').success).toBe(false)
  })
})

describe('share signs', () => {
  const income = (shares: string[], splitMode = 'BY_AMOUNT') =>
    expenseFormSchema.safeParse({
      expenseDate: new Date('2026-11-26'),
      title: 'Refund',
      category: 0,
      paidBy: [{ participant: 'a', amount: '-10' }],
      paidFor: shares.map((s, i) => ({ participant: `p${i}`, shares: s })),
      splitMode,
      saveDefaultSplittingOptions: false,
      isReimbursement: false,
      documents: [],
      notes: '',
      recurrenceRule: 'NONE',
      items: [],
    })
  const messages = (result: ReturnType<typeof income>) =>
    result.success ? [] : result.error.issues.map((issue) => issue.message)

  it('splits an income by exact amounts', () => {
    expect(income(['-4', '-6']).success).toBe(true)
  })

  it('says why when part of an income is not negative', () => {
    expect(messages(income(['4', '-14']))).toContain('incomeSharesNegative')
    expect(messages(income(['0', '-10']))).toContain('incomeSharesNegative')
  })

  it('still wants shares and percentages positive', () => {
    expect(messages(income(['0', '1'], 'BY_SHARES'))).toContain('noZeroShares')
  })
})
