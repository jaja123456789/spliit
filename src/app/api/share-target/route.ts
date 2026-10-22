import { env } from '@/lib/env'
import { PENDING_SHARE_IMAGE_KEY } from '@/lib/share-target'
import {
  SHARE_MAX_UPLOAD_BYTES,
  isAcceptedShareImageType,
  prepareSharedImage,
} from '@/lib/share-target-image'
import { NextRequest, NextResponse } from 'next/server'

// Handle GET requests (validation pings from OS)
export async function GET(req: NextRequest) {
  return NextResponse.redirect(
    new URL(`${env.NEXT_PUBLIC_BASE_PATH}/groups`, req.url),
  )
}

/**
 * Receives an image shared from the OS share sheet and hands it to the app.
 *
 * Only an allowed image type, under the size cap, that sharp can decode is accepted, and what goes
 * back is a page built entirely from values produced here — a re-encoded JPEG and the app's own
 * paths — never from anything the request said about itself.
 */
export async function POST(req: NextRequest) {
  // Refuse an oversized body before buffering it, when the client says how big it is.
  if (Number(req.headers.get('content-length')) > SHARE_MAX_UPLOAD_BYTES * 1.1)
    return page(413, failureBody())

  const formData = await req.formData().catch(() => null)
  const file = formData?.get('file')
  if (!(file instanceof File)) return page(400, failureBody())
  if (!isAcceptedShareImageType(file.type)) return page(415, failureBody())
  if (file.size > SHARE_MAX_UPLOAD_BYTES) return page(413, failureBody())

  const image = await prepareSharedImage(
    Buffer.from(await file.arrayBuffer()),
  ).catch((error) => {
    console.error('Could not read a shared image', error)
    return null
  })
  if (!image) return page(422, failureBody())

  return page(200, handOffBody(image.dataUrl))
}

const groupsPath = () => `${env.NEXT_PUBLIC_BASE_PATH}/groups`

/**
 * A value for an inline `<script>`. JSON is valid JavaScript, but it does not escape `<`, and the
 * HTML parser ends a script at the first `</script>` whatever the JavaScript around it means.
 */
const scriptValue = (value: string) =>
  JSON.stringify(value).replace(/</g, '\\u003c')

function handOffBody(dataUrl: string) {
  return `
    <div class="loader"></div>
    <p id="failed" hidden>Could not keep the shared image. <a href="${groupsPath()}">Back to your groups</a></p>
    <script>
      try {
        sessionStorage.setItem(${scriptValue(
          PENDING_SHARE_IMAGE_KEY,
        )}, ${scriptValue(dataUrl)});
        window.location.replace(${scriptValue(groupsPath())});
      } catch (e) {
        document.querySelector('.loader').remove();
        document.getElementById('failed').hidden = false;
      }
    </script>`
}

function failureBody() {
  return `<p>That could not be read as an image. <a href="${groupsPath()}">Back to your groups</a></p>`
}

function page(status: number, body: string) {
  const html = `<!DOCTYPE html>
    <html>
      <head>
        <title>Receipt</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex">
        <style>
          body { font-family: sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 0 1rem; background: #fafafa; color: #1c1917; text-align: center; }
          .loader { border: 4px solid #f3f3f3; border-top: 4px solid #047857; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          a { color: #047857; }
        </style>
      </head>
      <body>${body}</body>
    </html>`
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
