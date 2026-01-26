# syntax=docker/dockerfile:1

# ================================
# Base image with Node.js
# ================================
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

# Install dependencies based on the preferred package manager
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# ================================
# Build the application
# ================================
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build arguments for environment variables needed at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Create public directory if it doesn't exist (for COPY to work)
RUN mkdir -p public

# Build the Next.js application
RUN npm run build

# ================================
# Production image
# ================================
FROM base AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets (may be empty)
COPY --from=builder /app/public ./public

# Set correct permissions for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Configurable port (default: 3000)
ENV PORT=3000
EXPOSE ${PORT}

# Environment variables can be passed at runtime:
# - BIRDEYE_API_KEY
# - LLM_PROXY_URL
# - LLM_PROXY_TOKEN
# - TIMESNET_SERVICE_URL

# Set hostname for container
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node", "server.js"]
