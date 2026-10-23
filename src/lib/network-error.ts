import { TRPCClientError } from '@trpc/client'

/**
 * Whether a request failed for want of a network — it never reached the server — as opposed to the
 * server answering with an error. The first is worth waiting out (the outbox retries it); the
 * second will fail the same way every time.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (error instanceof TRPCClientError) {
    const clientError = error as TRPCClientError<any>
    return !clientError.data && !clientError.shape
  }
  return false
}
