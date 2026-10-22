/**
 * Turning an image shared from the OS into something the share hand-off can carry.
 *
 * `POST /api/share-target` parks the image in `sessionStorage` as a data URL until a group is
 * chosen (see `share-target.ts`). That store holds about five million characters in Chromium, and a
 * camera JPEG over ~3.7 MB does not fit once base64 has grown it by a third — sharing an ordinary
 * phone photo failed with `QuotaExceededError`. A receipt does not need twelve megapixels to be
 * read, so the image is re-encoded here at a size the store always has room for.
 *
 * The hand-off page never repeats what the request said about the file. The data URL is built
 * here: a JPEG sharp has decoded and re-encoded, or — where sharp cannot load — the original bytes,
 * typed by what their first bytes say rather than by the sender's claim.
 */

/** The types the manifest's `share_target` advertises. Nothing vector: SVG is markup, not pixels. */
const ACCEPTED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
])

/** Comfortably above any phone photo, well below anything that would strain the server. */
export const SHARE_MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/** Long edge after re-encoding. Plenty for a receipt to be read; ~0.3–0.8 MB as JPEG. */
const MAX_EDGE = 2048

/** Without sharp the bytes go through as they came, so only what the store can hold once base64'd. */
const PASSTHROUGH_MAX_BYTES = 3.5 * 1024 * 1024

export function isAcceptedShareImageType(type: string) {
  return ACCEPTED_TYPES.has(type.toLowerCase())
}

/** What the file's own first bytes say it is, among the accepted types. */
export function sniffImageType(bytes: Buffer): string | undefined {
  const ascii = (start: number, end: number) =>
    bytes.subarray(start, end).toString('latin1')
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg'
  if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') return 'image/png'
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (ascii(0, 2) === 'BM') return 'image/bmp'
  return undefined
}

/**
 * sharp is a native module and can be missing from a build — Next's output tracing on Windows
 * copies `sharp-win32-x64.node` but not the libvips DLLs beside it. Imported lazily, so its absence
 * costs this feature its re-encoding rather than costing the route its module.
 */
async function loadSharp() {
  try {
    return (await import('sharp')).default
  } catch (error) {
    console.error('sharp is unavailable; passing shared images through', error)
    return null
  }
}

export async function prepareSharedImage(input: Buffer) {
  const sharp = await loadSharp()

  if (!sharp) {
    const type = sniffImageType(input)
    if (!type) throw new Error('The shared file is not an image')
    if (input.length > PASSTHROUGH_MAX_BYTES)
      throw new Error('The shared image is too large to pass on unresized')
    return {
      dataUrl: `data:${type};base64,${input.toString('base64')}`,
      bytes: input.length,
    }
  }

  const output = await sharp(input, { limitInputPixels: 100_000_000 })
    // Phones store orientation in EXIF; once re-encoded the pixels must already be upright.
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82 })
    .toBuffer()
  return {
    dataUrl: `data:image/jpeg;base64,${output.toString('base64')}`,
    bytes: output.length,
  }
}
