FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl

WORKDIR /usr/app

# --- Stage 1: Builder ---
FROM base AS builder

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci

COPY . .

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
COPY scripts/build.env .env

RUN npx prisma generate
RUN npm run build

# --- Stage 2: Runner (Production) ---
FROM base AS runner

WORKDIR /usr/app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /usr/app/public ./public

COPY --from=builder --chown=nextjs:nodejs /usr/app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /usr/app/.next/static ./.next/static

COPY --from=builder --chown=nextjs:nodejs /usr/app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /usr/app/prisma ./prisma

RUN chown -R nextjs:nodejs /usr/app

RUN npm install -g prisma@6 && \
    npm cache clean --force

USER nextjs

EXPOSE 3000

ENTRYPOINT ["/bin/sh", "/usr/app/scripts/container-entrypoint.sh"]