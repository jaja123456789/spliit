/**
 * Telling one emoji from anything else a keyboard can type, for a group's icon.
 *
 * An emoji is often several code points drawn as one: a skin tone, a family joined with zero-width
 * joiners, a flag made of two regional letters, a keycap. Counting characters gets all of those
 * wrong, so this counts what the reader sees, with `Intl.Segmenter`.
 */

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

/** The characters a reader sees. Without a segmenter, the whole text counts as one. */
function graphemes(text: string): string[] {
  return segmenter
    ? Array.from(segmenter.segment(text), ({ segment }) => segment)
    : [text]
}

const KEYCAP = /^[0-9#*]️?⃣$/u
const FLAG = /^\p{Regional_Indicator}{2}$/u
const PICTOGRAPH = /\p{Extended_Pictographic}/u
// Letters, digits and spaces never belong to an emoji, keycaps aside. This also keeps "🏠 x" out
// when there is no segmenter to split it.
const NOT_EMOJI = /[\p{L}\p{N}\s]/u

function isEmojiGrapheme(grapheme: string) {
  return (
    KEYCAP.test(grapheme) ||
    FLAG.test(grapheme) ||
    (PICTOGRAPH.test(grapheme) && !NOT_EMOJI.test(grapheme))
  )
}

/** Whether the text is exactly one emoji, with nothing around it. */
export function isSingleEmoji(text: string): boolean {
  const all = graphemes(text)
  return all.length === 1 && isEmojiGrapheme(all[0]!)
}

/**
 * The last emoji in what was typed, or null. A field holding one emoji gets the next one typed after
 * it, so the newest is the one meant.
 */
export function lastEmoji(text: string): string | null {
  return graphemes(text).reverse().find(isEmojiGrapheme) ?? null
}
