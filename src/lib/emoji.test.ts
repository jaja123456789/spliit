import { isSingleEmoji, lastEmoji } from './emoji'

describe('isSingleEmoji', () => {
  it.each([
    ['a plain pictograph', '🏠'],
    ['one with a variation selector', '✈️'],
    ['a skin tone', '👍🏽'],
    ['a family joined with zero-width joiners', '👨‍👩‍👧‍👦'],
    ['a flag', '🇲🇹'],
    ['a subdivision flag made of tags', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'],
    ['a keycap', '7️⃣'],
    ['a recent one', '🫎'],
  ])('accepts %s', (_, text) => {
    expect(isSingleEmoji(text)).toBe(true)
  })

  it.each([
    ['nothing', ''],
    ['a letter', 'A'],
    ['a word', 'hello'],
    ['a digit', '7'],
    ['two emoji', '🏠🏡'],
    ['an emoji and a letter', '🏠x'],
    ['an emoji with a space', '🏠 '],
    ['a lone regional letter', '🇲'],
  ])('refuses %s', (_, text) => {
    expect(isSingleEmoji(text)).toBe(false)
  })
})

describe('lastEmoji', () => {
  it('takes the newest emoji typed after the one already there', () => {
    expect(lastEmoji('🏠🎉')).toBe('🎉')
  })

  it('keeps a joined sequence whole', () => {
    expect(lastEmoji('x👨‍👩‍👧')).toBe('👨‍👩‍👧')
  })

  it('finds none in plain text', () => {
    expect(lastEmoji('flat')).toBeNull()
  })
})
