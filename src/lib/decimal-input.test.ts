import { normalizeDecimalInput } from './decimal-input'

describe('normalizeDecimalInput', () => {
  it.each([
    ['12,50', '12.50'],
    ['12.50', '12.50'],
    ['12,', '12.'],
    [',5', '.5'],
    ['1.234,56', '1234.56'],
    ['1,234.56', '1234.56'],
    ['1,234,567', '1234567'],
    ['1.234.567', '1234567'],
    ['-3,75', '-3.75'],
    ['', ''],
    ['42', '42'],
    ['abc', 'abc'],
  ])('%p → %p', (typed, expected) => {
    expect(normalizeDecimalInput(typed)).toBe(expected)
  })
})
