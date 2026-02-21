FROM node:22-alpine AS base

RUN apk add --no-cache libc6-compat openssl

WORKDIR /usr/app

COPY ./package.json \
     ./next.config.mjs \
     ./tsconfig.json \
     ./reset.d.ts \
     ./tailwind.config.js \
     ./postcss.config.js ./
COPY ./scripts ./scripts
COPY ./prisma ./prisma

RUN npm install --ignore-scripts && \
    npx prisma generate

COPY ./public ./public
COPY ./src ./src
COPY ./messages ./messages

ENV NEXT_TELEMETRY_DISABLED=1

COPY scripts/build.env .env
RUN npm run build

RUN rm -r .next/cache

# --- Stage 2: Runtime Deps ---
FROM base AS runtime-deps

WORKDIR /usr/app
COPY --from=base /usr/app/package.json /usr/app/package-lock.json /usr/app/next.config.mjs ./
COPY --from=base /usr/app/prisma ./prisma

RUN npm ci --omit=dev --ignore-scripts && \
    npx prisma generate

# --- Stage 3: Runner ---
FROM base AS runner

WORKDIR /usr/app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=base /usr/app/public ./public
COPY --from=base /usr/app/scripts ./scripts

# Copy necessary files
COPY --from=base --chown=nextjs:nodejs /usr/app/.next/standalone ./
COPY --from=base --chown=nextjs:nodejs /usr/app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/bin/sh", "/usr/app/scripts/container-entrypoint.sh"]