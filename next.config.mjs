import createNextIntlPlugin from 'next-intl/plugin'
import os from 'node:os'

const withNextIntl = createNextIntlPlugin()

/**
 * Every non-loopback IPv4 this machine answers on.
 *
 * Computed rather than written down: the address is a DHCP lease, so a hard-coded one goes stale
 * the next time the router hands out a different number, and the failure looks like a firewall
 * problem rather than a config one.
 */
function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface?.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address)
}

/**
 * Binding the dev server to 0.0.0.0 is not enough on its own — reaching it by IP makes the browser
 * origin something Next does not expect, and two separate guards reject it:
 *
 *   - `allowedDevOrigins` gates cross-origin requests for `/_next/*` in development, so without it
 *     the page loads and none of its chunks or styles do.
 *   - `serverActions.allowedOrigins` is CSRF protection, so without it every Server Action posted
 *     from the phone fails while the same page works from localhost.
 *
 * Development only. In a production build this list is empty, so the deployed app keeps its
 * original single allowed origin.
 */
const devOrigins = process.env.NODE_ENV === 'production' ? [] : localAddresses()
const devPort = process.env.PORT ?? '3000'

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
      allowedOrigins: [
        'localhost:3000',
        ...devOrigins.map((address) => `${address}:${devPort}`),
      ],
      bodySizeLimit: '10mb',
    },
  },
  allowedDevOrigins: devOrigins,
  // `??` rather than `||` so an explicitly empty NEXT_PUBLIC_BASE_PATH means "serve at the root".
  // With `||` an empty value collapsed back to the placeholder, so the app could only ever be
  // reached under a sub-path unless the container entrypoint rewrote it — which left the e2e tests
  // with nothing to connect to. Unset still yields the placeholder, so Docker builds are unchanged.
  basePath:
    process.env.NEXT_PUBLIC_BASE_PATH ?? '/___SPLIIT_BASE_PATH_PLACEHOLDER___',
}

export default withNextIntl(nextConfig)
