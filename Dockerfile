# syntax=docker/dockerfile:1

# ================================
# Smart Money Analysis Docker Image
# Next.js app only; TimesNet runs as an external service.
# ================================

FROM node:20-slim AS node-deps

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production=false

FROM node:20-slim AS nextjs-builder

WORKDIR /app
COPY --from=node-deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY next.config.mjs tsconfig.json tailwind.config.ts postcss.config.mjs ./
COPY src ./src

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN mkdir -p public
RUN npm run build

FROM node:20-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 appgroup \
    && useradd --system --uid 1001 --gid appgroup appuser

WORKDIR /app
COPY --from=nextjs-builder /app/public ./public
COPY --from=nextjs-builder /app/.next/standalone ./
COPY --from=nextjs-builder /app/.next/static ./.next/static

RUN chown -R appuser:appgroup /app
USER appuser

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV TIMESNET_SERVICE_URL=http://host.docker.internal:8000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

CMD ["node", "/app/server.js"]
