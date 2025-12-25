# Multi-stage build for Integram Standalone

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy frontend package files
COPY package*.json ./
RUN npm ci

# Copy frontend source
COPY src/ ./src/
COPY public/ ./public/
COPY index.html ./
COPY vite.config.mjs ./

# Build frontend
RUN npm run build

# Stage 2: Setup backend
FROM node:20-alpine AS backend-setup

WORKDIR /app/backend/monolith

# Copy backend package files
COPY backend/monolith/package*.json ./
RUN npm ci --only=production

# Stage 3: Final image
FROM node:20-alpine

WORKDIR /app

# Install dependencies
RUN apk add --no-cache curl

# Copy backend from setup stage
COPY --from=backend-setup /app/backend/monolith/node_modules ./backend/monolith/node_modules
COPY backend/monolith/ ./backend/monolith/

# Copy frontend build from builder stage
COPY --from=frontend-builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "backend/monolith/src/index.js"]
