import { csvSafeText } from './csv-safe'

describe('csvSafeText', () => {
  it.each([
    [
      '=HYPERLINK("https://example.com","x")',
      `'=HYPERLINK("https://example.com","x")`,
    ],
    ['+1+2', "'+1+2"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['-cmd', "'-cmd"],
    ['\t=1', "'\t=1"],
  ])('neutralises %p', (input, expected) => {
    expect(csvSafeText(input)).toBe(expected)
  })

  it.each(['Dinner', '-12.50', '-3', '12.50', '', 'Café = good'])(
    'leaves %p alone',
    (input) => {
      expect(csvSafeText(input)).toBe(input)
    },
  )
})
