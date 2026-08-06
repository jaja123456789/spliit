import { createMcpToken, listMcpTokens, revokeMcpToken } from '@/lib/mcp/tokens'
import { createTRPCRouter } from '@/trpc/init'
import { protectedProcedure } from '@/trpc/routers/sync/protected'
import { z } from 'zod'

export const mcpRouter = createTRPCRouter({
  listTokens: protectedProcedure.query(async ({ ctx }) =>
    listMcpTokens(ctx.user.id),
  ),

  /** The plaintext token is in this response and nowhere else — it is never readable again. */
  createToken: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(60) }))
    .mutation(async ({ ctx, input }) =>
      createMcpToken(ctx.user.id, input.name.trim()),
    ),

  revokeToken: protectedProcedure
    .input(z.object({ tokenId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => ({
      success: await revokeMcpToken(ctx.user.id, input.tokenId),
    })),
})
