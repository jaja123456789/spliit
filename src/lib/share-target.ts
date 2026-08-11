/**
 * The PWA share target: an image shared to Spliit from the OS share sheet.
 *
 * `POST /api/share-target` cannot redirect straight into a group, because the OS has no idea which
 * group the receipt belongs to. So it parks the image here, sends the browser to the group list,
 * and the next group the user opens picks it up and hands it to the receipt scanner.
 *
 * The key lives here because it previously did not: the route wrote `pending-receipt-image` while
 * every reader looked for `pending-share-receipt`, so the hand-off never happened and the shared
 * photo was silently dropped.
 */
export const PENDING_SHARE_IMAGE_KEY = 'pending-share-receipt'

/** Marks a navigation as "opened to receive the shared image". */
export const FROM_SHARE_PARAM = 'fromShare'

export function readPendingShareImage(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  return sessionStorage.getItem(PENDING_SHARE_IMAGE_KEY)
}

export function clearPendingShareImage() {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(PENDING_SHARE_IMAGE_KEY)
}

/** Data URL -> File, so a shared image can enter the same pipeline as a picked one. */
export async function dataUrlToFile(
  dataUrl: string,
  fileName = 'shared-receipt',
): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob()
  const extension = blob.type.split('/')[1]?.split('+')[0] || 'jpg'
  return new File([blob], `${fileName}.${extension}`, {
    type: blob.type || 'image/jpeg',
  })
}
