import {
  AVATAR_HUE_COUNT,
  assignAvatarHues,
  avatarHueDistance,
  preferredAvatarHue,
} from './avatar-hue'

/** The first pair of generated names whose preferences satisfy `test`. */
function findPair(test: (a: number, b: number) => boolean): [string, string] {
  const names = Array.from({ length: 400 }, (_, i) => `Person ${i}`)
  for (const a of names)
    for (const b of names)
      if (a !== b && test(preferredAvatarHue(a), preferredAvatarHue(b)))
        return [a, b]
  throw new Error('no such pair')
}

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
    // The first seven take one plate each; the overflow falls back to its own preference, which
    // spreads. If it piled onto a single bucket this would be far more lopsided.
    const counts = new Map<number, number>()
    for (const hue of hues) counts.set(hue, (counts.get(hue) ?? 0) + 1)
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(6)
  })

  it('moves the second of two look-alike preferences to a plate that looks different', () => {
    // What every clash used to produce: the next plate on the list, which is the nearest one. In
    // the groups this fork is used for, that put 9 of 15 groups on olive beside lime.
    const [first, second] = findPair(
      (a, b) => a !== b && avatarHueDistance(a, b) < 60,
    )
    const hues = assignAvatarHues([first, second])
    expect(hues.get(first)).toBe(preferredAvatarHue(first))
    expect(
      avatarHueDistance(hues.get(first)!, hues.get(second)!),
    ).toBeGreaterThanOrEqual(60)
  })

  it('gives the second of two identical preferences the plate furthest from the first', () => {
    const [first, second] = findPair((a, b) => a === b)
    const hues = assignAvatarHues([first, second])
    const taken = hues.get(first)!
    const furthest = Math.max(
      ...Array.from({ length: AVATAR_HUE_COUNT }, (_, plate) =>
        plate === taken ? 0 : avatarHueDistance(plate, taken),
      ),
    )
    expect(avatarHueDistance(taken, hues.get(second)!)).toBe(furthest)
  })

  it('leaves a preference alone when it already looks different from everyone', () => {
    const [first, second] = findPair((a, b) => avatarHueDistance(a, b) >= 60)
    const hues = assignAvatarHues([first, second])
    expect(hues.get(second)).toBe(preferredAvatarHue(second))
  })

  it('keeps two people at least 80° apart and three at least 55°, whatever their names', () => {
    // Exhaustively true over every combination of preferences (checked when the plates were
    // chosen: 84° and 56° at worst); from four people on, seven plates on a 170° arc cannot
    // promise more than their own spacing.
    for (const [size, apart] of [
      [2, 80],
      [3, 55],
    ]) {
      for (let start = 0; start < 200; start++) {
        const names = Array.from(
          { length: size },
          (_, i) => `Member ${start}-${i}`,
        )
        const hues = [...assignAvatarHues(names).values()]
        for (let i = 0; i < hues.length; i++)
          for (let j = i + 1; j < hues.length; j++)
            expect(avatarHueDistance(hues[i], hues[j])).toBeGreaterThanOrEqual(
              apart,
            )
      }
    }
  })

  it('collapses duplicate names to one plate', () => {
    const hues = assignAvatarHues(['Alice', 'Alice', 'Bob'])
    expect(hues.size).toBe(2)
  })

  it('handles an empty group', () => {
    expect(assignAvatarHues([]).size).toBe(0)
  })
})
