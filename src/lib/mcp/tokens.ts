import { prisma } from '@/lib/prisma'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const TOKEN_PREFIX = 'spliit_mcp_'
const TOKEN_BYTES = 32

/**
 * Tokens are only ever stored hashed, so a database leak does not hand out access to anyone's
 * groups. SHA-256 without a salt is deliberate: the token is 32 random bytes, so it has nothing to
 * brute-force, and a single unsalted hash is what lets us look it up by value.
 */
function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function isMcpToken(value: string) {
  return value.startsWith(TOKEN_PREFIX)
}

/**
 * Creates a token for a user. The plaintext is returned once here and never stored — the caller is
 * responsible for showing it to the user.
 */
export async function createMcpToken(userId: string, name: string) {
  const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString(
    'base64url',
  )}`
  const record = await prisma.mcpToken.create({
    data: { name, tokenHash: hashToken(token), userId },
    select: { id: true, name: true, createdAt: true },
  })
  return { ...record, token }
}

export async function listMcpTokens(userId: string) {
  return prisma.mcpToken.findMany({
    where: { userId },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function revokeMcpToken(userId: string, tokenId: string) {
  // Scoped by userId so one user cannot revoke another's token by guessing an id.
  const { count } = await prisma.mcpToken.deleteMany({
    where: { id: tokenId, userId },
  })
  return count > 0
}

export type McpUser = {
  id: string
  email: string
  name: string | null
  syncProfileId: string
}

/**
 * Resolves a bearer token to the user it belongs to, or null if it is unknown.
 *
 * A user without a sync profile has no groups to act on, so they are rejected as well — every tool
 * is scoped to the groups on that profile.
 */
export async function resolveMcpToken(
  token: string | undefined | null,
): Promise<McpUser | null> {
  if (!token) return null

  const record = await prisma.mcpToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      tokenHash: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          syncProfile: { select: { id: true } },
        },
      },
    },
  })
  if (!record?.user.syncProfile) return null

  // The lookup above already matched on the hash; comparing again in constant time keeps the
  // decision itself free of a length-dependent early exit.
  const expected = Buffer.from(record.tokenHash, 'utf8')
  const actual = Buffer.from(hashToken(token), 'utf8')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null
  }

  // Best-effort: a failure to record usage must not fail the request.
  prisma.mcpToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})

  return {
    id: record.user.id,
    email: record.user.email,
    name: record.user.name,
    syncProfileId: record.user.syncProfile.id,
  }
}

/** Extracts the token from an `Authorization: Bearer <token>` header. */
export function bearerTokenFromRequest(request: Request) {
  const header = request.headers.get('authorization')
  if (!header) return null
  const [scheme, ...rest] = header.split(' ')
  if (scheme.toLowerCase() !== 'bearer') return null
  return rest.join(' ').trim() || null
}
