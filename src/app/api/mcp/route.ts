import {
  McpUser,
  bearerTokenFromRequest,
  resolveMcpToken,
} from '@/lib/mcp/tokens'
import {
  McpToolError,
  addExpense,
  getGroupBalances,
  listExpenses,
  listGroups,
} from '@/lib/mcp/tools'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'

// Prisma and the token lookup both need Node APIs, and every response depends on the caller's
// token, so nothing here can be prerendered or cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ToolResult = {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

function ok(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

/**
 * Tool errors are returned to the model as content rather than thrown, so it can read what went
 * wrong and correct itself (pick a different group, supply a rate) instead of the call failing at
 * the protocol level. Anything unexpected is logged server-side and reported without detail.
 */
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn())
  } catch (error) {
    if (error instanceof McpToolError) {
      return { content: [{ type: 'text', text: error.message }], isError: true }
    }
    console.error('MCP tool failed:', error)
    return {
      content: [
        { type: 'text', text: 'The request failed. Please try again later.' },
      ],
      isError: true,
    }
  }
}

function buildServer(user: McpUser) {
  const server = new McpServer(
    { name: 'spliit', version: '1.0.0' },
    {
      instructions:
        'Read and record shared expenses in Spliit. Every tool acts as the signed-in user and ' +
        'can only reach groups that user has synced. Call list_groups first to find the group id ' +
        'and the participant names to use.',
    },
  )

  server.registerTool(
    'list_groups',
    {
      title: 'List groups',
      description:
        'List the expense groups available to you, with their currency, their participants, and ' +
        'which participant you are in each. Use this to find the group id for the other tools.',
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => run(() => listGroups(user)),
  )

  server.registerTool(
    'list_expenses',
    {
      title: 'List expenses',
      description: 'List the most recent expenses in a group, newest first.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        group_id: z.string().describe('Group id, from list_groups'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('How many expenses to return (default 20)'),
      },
    },
    async ({ group_id, limit }) =>
      run(() => listExpenses(user, { groupId: group_id, limit })),
  )

  server.registerTool(
    'get_balances',
    {
      title: 'Get balances',
      description:
        'Show who is owed what in a group, plus the suggested reimbursements to settle up. ' +
        'A positive balance means the group owes that person.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        group_id: z.string().describe('Group id, from list_groups'),
      },
    },
    async ({ group_id }) =>
      run(() => getGroupBalances(user, { groupId: group_id })),
  )

  server.registerTool(
    'add_expense',
    {
      title: 'Add an expense',
      description:
        'Record a new expense in a group. This writes to shared data that other people see, so ' +
        'confirm the group, amount and participants with the user before calling it. ' +
        'Amounts are in the group currency unless you pass `currency`, in which case the total is ' +
        'converted using the rate for the expense date.',
      annotations: { readOnlyHint: false, destructiveHint: false },
      inputSchema: {
        group_id: z.string().describe('Group id, from list_groups'),
        title: z.string().min(1).describe('What the expense was for'),
        amount: z
          .number()
          .describe(
            'Total amount, in major units (12.34, not 1234). Negative records income.',
          ),
        currency: z
          .string()
          .optional()
          .describe(
            'ISO 4217 code the amount is in, e.g. EUR. Defaults to the group currency. Only pass ' +
              'this when the amount really is in another currency.',
          ),
        date: z
          .string()
          .optional()
          .describe('Expense date as YYYY-MM-DD. Defaults to today.'),
        paid_by: z
          .string()
          .optional()
          .describe(
            'Participant name or id who paid. Defaults to you in this group.',
          ),
        paid_for: z
          .array(z.string())
          .optional()
          .describe(
            'Participant names or ids the expense is split between. Defaults to everyone.',
          ),
        amounts_per_participant: z
          .array(
            z.object({
              participant: z.string(),
              amount: z.number(),
            }),
          )
          .optional()
          .describe(
            'Split by exact amounts instead of evenly. Must add up to the total.',
          ),
        notes: z.string().optional(),
        conversion_rate: z
          .number()
          .optional()
          .describe(
            'Override the looked-up exchange rate. Only needed when the rate cannot be fetched.',
          ),
        is_reimbursement: z
          .boolean()
          .optional()
          .describe('Whether this is a repayment between participants'),
        allow_duplicate: z
          .boolean()
          .optional()
          .describe(
            'Add the expense even if an identical one was just created. Only set this when the ' +
              'user has confirmed they really want two.',
          ),
      },
    },
    async (args) =>
      run(() =>
        addExpense(user, {
          groupId: args.group_id,
          title: args.title,
          amount: args.amount,
          currency: args.currency,
          date: args.date,
          paidBy: args.paid_by,
          paidFor: args.paid_for,
          amountsPerParticipant: args.amounts_per_participant,
          notes: args.notes,
          conversionRate: args.conversion_rate,
          isReimbursement: args.is_reimbursement,
          allowDuplicate: args.allow_duplicate,
        }),
      ),
  )

  return server
}

function unauthorized() {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized' },
      id: null,
    }),
    {
      status: 401,
      headers: {
        'content-type': 'application/json',
        // Tells a spec-compliant MCP client that a bearer token is expected.
        'www-authenticate': 'Bearer realm="spliit"',
      },
    },
  )
}

async function handle(request: Request) {
  const user = await resolveMcpToken(bearerTokenFromRequest(request))
  if (!user) return unauthorized()

  // Stateless: no sessionIdGenerator, so each request stands alone. That suits a tools-only server
  // and means nothing has to be held in memory between requests or shared between instances.
  const transport = new WebStandardStreamableHTTPServerTransport()
  const server = buildServer(user)
  await server.connect(transport)

  try {
    return await transport.handleRequest(request)
  } finally {
    await server.close().catch(() => {})
  }
}

export const GET = handle
export const POST = handle
export const DELETE = handle
