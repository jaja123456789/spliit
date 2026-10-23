/**
 * Which of the seven participant plates a person gets.
 *
 * Keyed by name, so the same person is the same colour on every screen they appear on — the split
 * rows, Paid by, balances, the reimbursement list — rather than one colour per component.
 *
 * A hash alone is not enough. Seven buckets and four people is a 65% chance that two of them come
 * out the same colour, which is worse than no colour at all: it says "these two are related" about
 * a pair picked at random. So the hash only chooses a *preference*, and `assignAvatarHues` settles
 * the argument for a whole group at once.
 *
 * The plates themselves, and the contrast measurements behind them, are in `globals.css` under
 * `--avatar-1..7` and reproducible with `scripts/avatar-hues.js`.
 */

/**
 * Where each plate sits on the hue circle, in OKLCH degrees: the space the plates were picked in,
 * and the one in which a distance means what it looks like. Only used to measure how far apart two
 * plates look; the colours are the tokens. Index n is `--avatar-(n+1)`. Keep in step with
 * `scripts/avatar-hues.js`.
 */
export const AVATAR_HUES = [85, 230, 258, 286, 314, 342, 10] as const

export const AVATAR_HUE_COUNT = AVATAR_HUES.length

/**
 * Two plates closer than this read as the same colour at a glance. The old rule handed a clashing
 * name the next plate on the list, which is by construction the nearest one: in the groups this
 * fork is used for, 9 of 15 ended up olive beside lime.
 */
const MIN_SEPARATION = 60

/**
 * FNV-1a, 32-bit. Any stable hash would do; this one is short, has no dependencies and spreads
 * short strings — which is what names are — better than summing char codes, where "Bob" and "Boc"
 * land next to each other.
 */
function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    // The FNV prime, as shifts: `h * 16777619` overflows past 32 bits in a double and loses the
    // low bits that carry the entropy.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h >>> 0
}

/** How far apart two plates look, in degrees of OKLCH hue. */
export function avatarHueDistance(a: number, b: number): number {
  const d = Math.abs(AVATAR_HUES[a] - AVATAR_HUES[b]) % 360
  return Math.min(d, 360 - d)
}

/**
 * The plate this name would like, before anyone else in the group has a say. Used directly when
 * there is no participant list to compare against — the payment list titles a row after the
 * payment itself when it does not read as a direction between two people.
 */
export function preferredAvatarHue(name: string): number {
  return hash(name.trim().toLowerCase()) % AVATAR_HUE_COUNT
}

/**
 * The plate each name in a group gets, with look-alikes resolved.
 *
 * Walk the names in the order the group stores them. Each takes the plate it prefers, unless that
 * plate is taken or within `MIN_SEPARATION` of one that is; then it takes the free plate that is
 * furthest from every plate already given out, and of equally good ones the closest to what it
 * wanted. So two people in a group never look alike while a better plate is free.
 *
 * Order matters, and stored order is the one that does not churn: a participant appended to the
 * group cannot recolour anyone already in it, because everyone before them has already chosen.
 *
 * Past seven people the pigeonhole wins and plates repeat; from the eighth person on, everyone
 * falls back to their own preference, so at least the repeats are spread rather than piled on one
 * plate.
 *
 * Duplicate names collapse to one entry, which is the honest answer: two participants with the
 * same name are not distinguishable by their plate either way.
 */
export function assignAvatarHues(names: string[]): Map<string, number> {
  const assigned = new Map<string, number>()
  const taken: number[] = []
  const room = (plate: number) =>
    Math.min(...taken.map((other) => avatarHueDistance(plate, other)))

  for (const name of names) {
    if (assigned.has(name)) continue
    const preferred = preferredAvatarHue(name)
    let hue = preferred
    if (
      taken.length > 0 &&
      taken.length < AVATAR_HUE_COUNT &&
      room(preferred) < MIN_SEPARATION
    ) {
      let bestRoom = -1
      let bestDetour = Infinity
      for (let plate = 0; plate < AVATAR_HUE_COUNT; plate++) {
        if (taken.includes(plate)) continue
        const candidateRoom = room(plate)
        const detour = avatarHueDistance(plate, preferred)
        if (
          candidateRoom > bestRoom ||
          (candidateRoom === bestRoom && detour < bestDetour)
        ) {
          bestRoom = candidateRoom
          bestDetour = detour
          hue = plate
        }
      }
    }
    taken.push(hue)
    assigned.set(name, hue)
  }

  return assigned
}
