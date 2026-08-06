import { handleMcpRequest } from '@/lib/mcp/handler'

// Prisma and the token lookup both need Node APIs, and every response depends on the caller's
// token, so nothing here can be prerendered or cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ token: string }> }

/**
 * MCP endpoint carrying the token in the URL.
 *
 * ChatGPT's connector settings only offer OAuth, no-auth or mixed — there is no field for a static
 * header — so this is the form that works there: register the URL and choose "No authentication".
 *
 * The URL is therefore the credential, and unlike a header it can end up in reverse-proxy access
 * logs, browser history and screenshots. It is still revocable from Settings, scoped to the
 * owner's synced groups, and no broader than a Spliit group link, which is already a URL that
 * grants access. Prefer /api/mcp with an Authorization header wherever the client supports it.
 */
const handle = async (request: Request, { params }: Params) => {
  const { token } = await params
  return handleMcpRequest(request, decodeURIComponent(token))
}

export const GET = handle
export const POST = handle
export const DELETE = handle
