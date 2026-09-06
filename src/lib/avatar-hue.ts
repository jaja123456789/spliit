/**
 * Which of the eight participant plates a person gets.
 *
 * Keyed by name, so the same person is the same colour on every screen they appear on — the split
 * rows, Paid by, balances, the reimbursement list — rather than one colour per component.
 *
 * A hash alone is not enough. Eight buckets and four people is a 59% chance that two of them come
 * out the same colour, which is worse than no colour at all: it says "these two are related" about
 * a pair picked at random. So the hash only chooses a *preference*, and `assignAvatarHues` settles
 * the argument for a whole group at once.
 *
 * The hues themselves, and the contrast measurements behind them, are in `globals.css` under
 * `--avatar-1..8` and reproducible with `scripts/avatar-hues.js`.
 */

export const AVATAR_HUE_COUNT = 8

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

/**
 * The hue this name would like, before anyone else in the group has a say. Used directly when
 * there is no participant list to compare against — the payment list titles a row after the
 * payment itself when it does not read as a direction between two people.
 */
export function preferredAvatarHue(name: string): number {
  return hash(name.trim().toLowerCase()) % AVATAR_HUE_COUNT
}

/**
 * The hue each name in a group gets, with collisions resolved.
 *
 * Walk the names in the order the group stores them: each takes the hue it prefers if that hue is
 * still free, otherwise the next free one going up. Order matters and stored order is the one that
 * does not churn — a participant appended to the group cannot recolour anyone already in it,
 * because everyone before them has already chosen.
 *
 * Past eight people the pigeonhole wins and hues repeat; the ninth person onward falls back to the
 * plain preference, so at least the repeat is spread rather than piling onto hue 0.
 *
 * Duplicate names collapse to one entry, which is the honest answer: two participants with the
 * same name are not distinguishable by their plate either way.
 */
export function assignAvatarHues(names: string[]): Map<string, number> {
  const assigned = new Map<string, number>()
  const taken = new Set<number>()

  for (const name of names) {
    if (assigned.has(name)) continue
    const preferred = preferredAvatarHue(name)
    let hue = preferred
    if (taken.size < AVATAR_HUE_COUNT) {
      for (let step = 0; step < AVATAR_HUE_COUNT; step++) {
        const candidate = (preferred + step) % AVATAR_HUE_COUNT
        if (!taken.has(candidate)) {
          hue = candidate
          break
        }
      }
    }
    taken.add(hue)
    assigned.set(name, hue)
  }

  return assigned
}
