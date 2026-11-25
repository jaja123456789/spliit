/**
 * The request itself is wrong — an id that is not in the group, a payment to oneself — so sending
 * it again will fail the same way. The tRPC layer answers these with 400 rather than 500: the
 * offline outbox retries 5xx, and a plain `Error` here used to come back as one, which would have
 * kept a doomed expense in the outbox forever.
 */
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidInputError'
  }
}
