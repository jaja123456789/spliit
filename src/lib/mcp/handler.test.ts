import { handleMcpRequest } from './handler'

// The tools are exercised in tools.test.ts; here we only need the protocol layer, so the database
// and the token lookup are stubbed out.
jest.mock('@/lib/prisma', () => ({ prisma: {} }))
jest.mock('@/lib/api', () => ({
  createExpense: jest.fn(),
  getGroup: jest.fn(),
  getGroupExpenses: jest.fn(),
}))
jest.mock('./tokens', () => ({
  resolveMcpToken: jest.fn(),
  bearerTokenFromRequest: jest.fn(),
}))

const { resolveMcpToken } = jest.requireMock('./tokens')

const VALID = 'spliit_mcp_valid'

beforeEach(() => {
  jest.clearAllMocks()
  resolveMcpToken.mockImplementation(async (token: string) =>
    token === VALID
      ? { id: 'u1', email: 'a@b.c', name: null, syncProfileId: 'p1' }
      : null,
  )
})

function rpc(body: unknown) {
  return new Request('https://example.test/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  })
}

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  },
}

describe('handleMcpRequest', () => {
  it('rejects an unknown token', async () => {
    const response = await handleMcpRequest(rpc(INITIALIZE), 'nope')
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('Bearer')
  })

  it('reports a token lookup failure as unavailable, not as a rejection', async () => {
    resolveMcpToken.mockRejectedValue(new Error('db down'))
    jest.spyOn(console, 'error').mockImplementation(() => {})

    const response = await handleMcpRequest(rpc(INITIALIZE), VALID)
    expect(response.status).toBe(503)
  })

  // The regression this file exists for: the response used to resolve with its body still being
  // written while the server was already closed, so the client waited forever for a body that
  // never arrived. Reading the body to completion is the assertion that matters.
  it('completes an initialize handshake', async () => {
    const response = await handleMcpRequest(rpc(INITIALIZE), VALID)

    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body.length).toBeGreaterThan(0)

    const payload = JSON.parse(body)
    expect(payload.result.serverInfo.name).toBe('spliit')
    expect(payload.result.capabilities.tools).toBeDefined()
  })

  it('answers with JSON rather than an event stream', async () => {
    const response = await handleMcpRequest(rpc(INITIALIZE), VALID)
    expect(response.headers.get('content-type')).toContain('application/json')
  })

  it('lists every tool, with add_expense marked as a write', async () => {
    const response = await handleMcpRequest(
      rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      VALID,
    )

    expect(response.status).toBe(200)
    const payload = JSON.parse(await response.text())
    const tools = payload.result.tools as {
      name: string
      annotations?: { readOnlyHint?: boolean }
    }[]

    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_expense',
      'get_balances',
      'list_expenses',
      'list_groups',
    ])
    expect(
      tools.find((t) => t.name === 'add_expense')?.annotations?.readOnlyHint,
    ).toBe(false)
    expect(
      tools.find((t) => t.name === 'list_groups')?.annotations?.readOnlyHint,
    ).toBe(true)
  })
})
