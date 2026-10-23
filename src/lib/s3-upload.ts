'use client'

import { addBasePath } from 'next/dist/client/add-base-path'

/**
 * Uploading a file to S3 through the presigned-URL route, without `next-s3-upload`'s client.
 *
 * Importing anything from that package's root pulls in its AWS SDK hooks too, so two small helpers
 * cost every phone that opened the Expenses tab ~100 KB gzipped of S3 client — on deployments with
 * no S3 at all. This speaks to the same `/api/s3-upload` route (still `next-s3-upload` on the
 * server) in the two requests the presigned strategy needs. It also asks at the app's base path,
 * which the package's client did not: it posted to `/api/s3-upload` from the root.
 */
export async function uploadToS3(file: File) {
  const response = await fetch(addBasePath('/api/s3-upload'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      filetype: file.type,
      _nextS3: { strategy: 'presigned' },
    }),
  })
  const params = (await response.json().catch(() => null)) as {
    url: string
    key: string
    bucket: string
    region: string
    endpoint?: string
    error?: unknown
  } | null
  if (!response.ok || !params || params.error)
    throw new Error('Could not get an upload URL')

  const upload = await fetch(params.url, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
      'Cache-Control': 'max-age=630720000',
    },
    body: file,
  })
  if (!upload.ok) throw new Error(`Upload failed: ${upload.status}`)

  return {
    url: params.endpoint
      ? `${params.endpoint}/${params.bucket}/${params.key}`
      : `https://${params.bucket}.s3.${params.region}.amazonaws.com/${params.key}`,
    bucket: params.bucket,
    key: params.key,
  }
}

/** The pixel size of an image file, read by the browser. */
export function getImageData(
  file: Blob,
): Promise<{ width: number | undefined; height: number | undefined }> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve({ width: undefined, height: undefined })
      return
    }
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve({ width: image.width, height: image.height })
      URL.revokeObjectURL(objectUrl)
    }
    image.onerror = () => {
      resolve({ width: undefined, height: undefined })
      URL.revokeObjectURL(objectUrl)
    }
    image.src = objectUrl
  })
}
