# syntax=docker/dockerfile:1

# ================================
# Smart Money Analysis - Unified Docker Image
# Contains: Next.js App + TimesNet ML Service
# ================================

# ================================
# Stage 1: Node.js dependencies
# ================================
FROM node:20-slim AS node-deps

WORKDIR /app

# Install dependencies only when needed
COPY package.json package-lock.json* ./

RUN npm ci --only=production=false

# ================================
# Stage 2: Build Next.js application
# ================================
FROM node:20-slim AS nextjs-builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=node-deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY next.config.mjs tsconfig.json tailwind.config.ts postcss.config.mjs ./
COPY src ./src

# Build arguments for environment variables needed at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Create public directory if it doesn't exist
RUN mkdir -p public

# Build the Next.js application
RUN npm run build

# ================================
# Stage 3: Python/TimesNet setup
# ================================
FROM python:3.11-slim AS python-builder

WORKDIR /timesnet

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY timesnet-service/requirements.txt ./

# Install PyTorch CPU version (smaller image) and other deps
# For GPU support, change to: torch --index-url https://download.pytorch.org/whl/cu118
RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

# ================================
# Stage 4: Final production image
# ================================
FROM python:3.11-slim AS runner

# Install Node.js runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    supervisor \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --system --gid 1001 appgroup \
    && useradd --system --uid 1001 --gid appgroup appuser

WORKDIR /app

# ================================
# Copy Next.js build artifacts
# ================================
COPY --from=nextjs-builder /app/public ./public
COPY --from=nextjs-builder /app/.next/standalone ./
COPY --from=nextjs-builder /app/.next/static ./.next/static

# ================================
# Copy Python environment and TimesNet service
# ================================
COPY --from=python-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python-builder /usr/local/bin /usr/local/bin

# Copy TimesNet service code and models
WORKDIR /timesnet
COPY timesnet-service/main.py ./
COPY timesnet-service/data_pipeline.py ./
COPY timesnet-service/models ./models
COPY timesnet-service/timesnet_lib ./timesnet_lib
COPY timesnet-service/checkpoints ./checkpoints

# ================================
# Setup supervisor to run both services
# ================================
COPY <<EOF /etc/supervisor/conf.d/supervisord.conf
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid

[program:nextjs]
command=node /app/server.js
directory=/app
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=NODE_ENV="production",PORT="3000",HOSTNAME="0.0.0.0",TIMESNET_SERVICE_URL="http://localhost:8001"

[program:timesnet]
command=python -m uvicorn main:app --host 0.0.0.0 --port 8001
directory=/timesnet
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=PYTHONUNBUFFERED="1",CHECKPOINT_PATH="/timesnet/checkpoints"
EOF

# Create log directory
RUN mkdir -p /var/log/supervisor

# Set ownership
RUN chown -R appuser:appgroup /app /timesnet /var/log/supervisor

# ================================
# Environment variables (can be overridden at runtime)
# ================================
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV TIMESNET_PORT=8001
ENV TIMESNET_SERVICE_URL=http://localhost:8001
ENV CHECKPOINT_PATH=/timesnet/checkpoints
ENV PYTHONUNBUFFERED=1

# Expose ports
EXPOSE 3000 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/ && curl -f http://localhost:8001/health || exit 1

# Start supervisor (runs both services)
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
