import {
  AVATAR_HUE_COUNT,
  assignAvatarHues,
  preferredAvatarHue,
} from './avatar-hue'

describe('preferredAvatarHue', () => {
  it('always lands in range', () => {
    for (const name of ['', 'A', 'Alice', 'Bob', '  Carol  ', '日本語', '🙂']) {
      const hue = preferredAvatarHue(name)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(AVATAR_HUE_COUNT)
    }
  })

  it('ignores case and surrounding space, so a re-typed name keeps its colour', () => {
    expect(preferredAvatarHue('  alice ')).toBe(preferredAvatarHue('Alice'))
  })

  it('separates names that differ by one character', () => {
    // The reason for a real hash rather than summing char codes: "Bob" and "Boc" sum to adjacent
    // numbers and would sit in adjacent buckets on every group they appear in together.
    const hues = ['Bob', 'Boc', 'Bod', 'Boe'].map(preferredAvatarHue)
    expect(new Set(hues).size).toBeGreaterThan(1)
  })
})

describe('assignAvatarHues', () => {
  it('gives everyone in a group a different plate, up to the number of plates', () => {
    const names = ['Alice', 'Bob', 'Carol', 'Dan', 'Emma', 'Grace', 'Jason']
    const hues = [...assignAvatarHues(names).values()]
    expect(hues).toHaveLength(names.length)
    expect(new Set(hues).size).toBe(names.length)
  })

  it('honours the preferred hue when it is free', () => {
    // Alice goes first, so nothing can have taken her preference.
    const preferred = preferredAvatarHue('Alice')
    expect(assignAvatarHues(['Alice', 'Bob']).get('Alice')).toBe(preferred)
  })

  it('never recolours anyone when a participant is appended', () => {
    const before = assignAvatarHues(['Alice', 'Bob', 'Carol'])
    const after = assignAvatarHues(['Alice', 'Bob', 'Carol', 'Dan'])
    for (const [name, hue] of before) {
      expect(after.get(name)).toBe(hue)
    }
  })

  it('is stable across calls', () => {
    const names = ['Alice', 'Bob', 'Carol', 'Dan']
    expect([...assignAvatarHues(names)]).toEqual([...assignAvatarHues(names)])
  })

  it('keeps going past the number of plates instead of crowding hue 0', () => {
    const names = Array.from({ length: 20 }, (_, i) => `Person ${i}`)
    const hues = [...assignAvatarHues(names).values()]
    expect(hues).toHaveLength(20)
    for (const hue of hues) {
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(AVATAR_HUE_COUNT)
    }
    // The first eight take one plate each; the overflow falls back to its own preference, which
    // spreads. If it piled onto a single bucket this would be far more lopsided.
    const counts = new Map<number, number>()
    for (const hue of hues) counts.set(hue, (counts.get(hue) ?? 0) + 1)
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(6)
  })

  it('collapses duplicate names to one plate', () => {
    const hues = assignAvatarHues(['Alice', 'Alice', 'Bob'])
    expect(hues.size).toBe(2)
  })

  it('handles an empty group', () => {
    expect(assignAvatarHues([]).size).toBe(0)
  })
})
