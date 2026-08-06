import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin()

/**
 * Undefined entries are not supported. Push optional patterns to this array only if defined.
 * @type {import('next/dist/shared/lib/image-config').RemotePattern}
 */
const remotePatterns = []

// S3 Storage
if (process.env.S3_UPLOAD_ENDPOINT) {
  // custom endpoint for providers other than AWS
  const url = new URL(process.env.S3_UPLOAD_ENDPOINT)
  remotePatterns.push({
    hostname: url.hostname,
  })
} else if (process.env.S3_UPLOAD_BUCKET && process.env.S3_UPLOAD_REGION) {
  // default provider
  remotePatterns.push({
    hostname: `${process.env.S3_UPLOAD_BUCKET}.s3.${process.env.S3_UPLOAD_REGION}.amazonaws.com`,
  })
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns,
  },
  // Required to run in a codespace (see https://github.com/vercel/next.js/issues/58019)
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
      bodySizeLimit: '10mb',
    },
  },
  // `??` rather than `||` so an explicitly empty NEXT_PUBLIC_BASE_PATH means "serve at the root".
  // With `||` an empty value collapsed back to the placeholder, so the app could only ever be
  // reached under a sub-path unless the container entrypoint rewrote it — which left the e2e tests
  // with nothing to connect to. Unset still yields the placeholder, so Docker builds are unchanged.
  basePath:
    process.env.NEXT_PUBLIC_BASE_PATH ?? '/___SPLIIT_BASE_PATH_PLACEHOLDER___',
}

export default withNextIntl(nextConfig)
