# Perfect Catch ST Automation Server
# Dockerfile for production deployment

# Use Node.js LTS slim for better compatibility
FROM node:20-slim AS base

# Install OpenSSL for Prisma compatibility
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install dependencies only (cached layer)
FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production && \
    npx prisma generate && \
    npm cache clean --force

# Build stage (if we had TypeScript or build step)
FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .
# RUN npm run build (if needed)

# Production image
FROM base AS production

# Set production environment
ENV NODE_ENV=production

# Create non-root user (Debian syntax)
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/bash nodejs

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the server
CMD ["node", "src/server.js"]
