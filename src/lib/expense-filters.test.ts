import {
  hasActiveFilters,
  monthRange,
  parseAmountSearch,
} from './expense-filters'

describe('parseAmountSearch', () => {
  it.each([
    // A whole number is everything up to the next one.
    ['45', 2, { min: 4500, max: 4599 }],
    ['0', 2, { min: 0, max: 99 }],
    // Decimals are exact, with either separator.
    ['45.20', 2, { min: 4520, max: 4520 }],
    ['45,2', 2, { min: 4520, max: 4520 }],
    ['45.5', 2, { min: 4550, max: 4550 }],
    // Three digits after a separator group thousands.
    ['1,250', 2, { min: 125000, max: 125099 }],
    ['1.250', 2, { min: 125000, max: 125099 }],
    ['1.250,00', 2, { min: 125000, max: 125000 }],
    ['1,250.75', 2, { min: 125075, max: 125075 }],
    // A currency sign or a trailing separator around the digits is ignored.
    ['€45.20', 2, { min: 4520, max: 4520 }],
    ['45€', 2, { min: 4500, max: 4599 }],
    ['$12', 2, { min: 1200, max: 1299 }],
    ['45.', 2, { min: 4500, max: 4599 }],
    // The currency's decimals decide.
    ['1250', 0, { min: 1250, max: 1250 }],
    ['1,250', 0, { min: 1250, max: 1250 }],
    ['4.125', 3, { min: 4125, max: 4125 }],
  ])('reads %s with %d decimals', (word, decimals, expected) => {
    expect(parseAmountSearch(word, decimals)).toEqual(expected)
  })

  it.each([
    ['pizza', 2],
    ['abc1', 2],
    ['2x', 2],
    ['12:30', 2],
    ['1/2', 2],
    ['45.1234', 2],
    ['45.5', 0], // there is no half yen
    ['1234567890123', 2],
  ])('does not read %s with %d decimals as an amount', (word, decimals) => {
    expect(parseAmountSearch(word, decimals)).toBeNull()
  })
})

describe('monthRange', () => {
  it('spans the month in UTC, which is how dates are kept', () => {
    expect(monthRange('2026-09')).toEqual({
      start: new Date('2026-09-01T00:00:00.000Z'),
      end: new Date('2026-10-01T00:00:00.000Z'),
    })
  })

  it('rolls December over into the next year', () => {
    expect(monthRange('2025-12')?.end).toEqual(
      new Date('2026-01-01T00:00:00.000Z'),
    )
  })

  it.each(['2026-13', '2026-9', '26-09', 'september'])(
    'rejects %s',
    (month) => {
      expect(monthRange(month)).toBeNull()
    },
  )
})

describe('hasActiveFilters', () => {
  it('ignores blank search text', () => {
    expect(hasActiveFilters({ search: '   ' })).toBe(false)
    expect(hasActiveFilters({})).toBe(false)
  })

  it('counts category 0, which is a real category', () => {
    expect(hasActiveFilters({ categoryId: 0 })).toBe(true)
  })
})
