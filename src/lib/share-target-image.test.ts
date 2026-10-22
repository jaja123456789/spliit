import sharp from 'sharp'
import {
  isAcceptedShareImageType,
  prepareSharedImage,
  sniffImageType,
} from './share-target-image'

/** A photo-like JPEG: noise does not compress, so this is as heavy as a real camera shot. */
async function noisyJpeg(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
      noise: { type: 'gaussian', mean: 128, sigma: 40 },
    },
  })
    .jpeg({ quality: 95 })
    .toBuffer()
}

const dimensionsOf = async (dataUrl: string) => {
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64')
  const { width, height, format } = await sharp(buffer).metadata()
  return { width, height, format }
}

describe('isAcceptedShareImageType', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'IMAGE/JPEG'])(
    'accepts %s',
    (type) => expect(isAcceptedShareImageType(type)).toBe(true),
  )

  it.each(['', 'text/plain', 'text/html', 'image/svg+xml', 'application/pdf'])(
    'refuses %p',
    (type) => expect(isAcceptedShareImageType(type)).toBe(false),
  )
})

describe('prepareSharedImage', () => {
  it('shrinks a camera-sized photo to fit the hand-off', async () => {
    const photo = await noisyJpeg(4000, 3000)
    // Base64 of this would not fit: the store holds about five million characters.
    expect(photo.length * (4 / 3)).toBeGreaterThan(5_000_000)

    const { dataUrl } = await prepareSharedImage(photo)

    expect(dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(dataUrl.length).toBeLessThan(2_500_000)
    expect(await dimensionsOf(dataUrl)).toEqual({
      width: 2048,
      height: 1536,
      format: 'jpeg',
    })
  }, 30_000)

  it('never enlarges a small image', async () => {
    const { dataUrl } = await prepareSharedImage(await noisyJpeg(800, 600))
    expect(await dimensionsOf(dataUrl)).toEqual({
      width: 800,
      height: 600,
      format: 'jpeg',
    })
  })

  it('re-encodes whatever image type arrived as JPEG', async () => {
    const png = await sharp({
      create: { width: 40, height: 20, channels: 4, background: '#047857' },
    })
      .png()
      .toBuffer()
    const { dataUrl } = await prepareSharedImage(png)
    expect((await dimensionsOf(dataUrl)).format).toBe('jpeg')
  })

  it('rejects bytes that are not an image', async () => {
    await expect(
      prepareSharedImage(Buffer.from('not an image at all')),
    ).rejects.toThrow()
  })
})

describe('sniffImageType', () => {
  it('reads the type from the bytes, not from a name or a claim', async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer()
    expect(sniffImageType(png)).toBe('image/png')
    expect(sniffImageType(await noisyJpeg(8, 8))).toBe('image/jpeg')
    expect(sniffImageType(Buffer.from('<svg xmlns="…"/>'))).toBeUndefined()
  })
})

describe('prepareSharedImage without sharp', () => {
  // A build whose output tracing left libvips behind — the case on Windows standalone builds.
  // The module imports sharp lazily, inside the call, so the mock has to outlive the whole await
  // rather than just the `require`.
  const withoutSharp = async <T>(
    run: (mod: typeof import('./share-target-image')) => Promise<T>,
  ) => {
    jest.resetModules()
    jest.doMock('sharp', () => {
      throw new Error('Could not load the "sharp" module')
    })
    try {
      return await run(require('./share-target-image'))
    } finally {
      jest.dontMock('sharp')
      jest.resetModules()
    }
  }

  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => jest.restoreAllMocks())

  it('passes a small image through, typed by its bytes', async () => {
    const jpeg = await noisyJpeg(64, 64)
    const { dataUrl } = await withoutSharp((mod) =>
      mod.prepareSharedImage(jpeg),
    )
    expect(dataUrl).toBe(`data:image/jpeg;base64,${jpeg.toString('base64')}`)
  })

  it('refuses what it cannot shrink and the store cannot hold', async () => {
    const photo = await noisyJpeg(4000, 3000)
    await expect(
      withoutSharp((mod) => mod.prepareSharedImage(photo)),
    ).rejects.toThrow(/too large/)
  })

  it('refuses bytes that are not an image', async () => {
    await expect(
      withoutSharp((mod) => mod.prepareSharedImage(Buffer.from('<html>'))),
    ).rejects.toThrow(/not an image/)
  })
})
