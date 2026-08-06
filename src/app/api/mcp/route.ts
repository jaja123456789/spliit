import { handleMcpRequest } from '@/lib/mcp/handler'
import { bearerTokenFromRequest } from '@/lib/mcp/tokens'

// Prisma and the token lookup both need Node APIs, and every response depends on the caller's
// token, so nothing here can be prerendered or cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * MCP endpoint for clients that can set request headers (Claude Desktop, curl, scripts). Prefer
 * this over the /api/mcp/<token> form: the credential stays out of the URL.
 */
const handle = (request: Request) =>
  handleMcpRequest(request, bearerTokenFromRequest(request))

export const GET = handle
export const POST = handle
export const DELETE = handle
