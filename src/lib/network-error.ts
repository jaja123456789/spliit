import { TRPCClientError } from '@trpc/client'

/**
 * Whether a request failed for want of a network — it never reached the server — as opposed to the
 * server answering with an error.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (error instanceof TRPCClientError) {
    const clientError = error as TRPCClientError<any>
    return !clientError.data && !clientError.shape
  }
  return false
}

/**
 * Whether sending the same request again later can succeed: no network, or a server that is down,
 * restarting or overloaded (5xx, 408, 429). What is left is a refusal — the request itself is
 * wrong — which fails the same way every time.
 */
export function isRetryableError(error: unknown): boolean {
  if (isNetworkError(error)) return true
  if (error instanceof TRPCClientError) {
    const status = (error as TRPCClientError<any>).data?.httpStatus
    return (
      typeof status === 'number' &&
      (status >= 500 || status === 408 || status === 429)
    )
  }
  return false
}
