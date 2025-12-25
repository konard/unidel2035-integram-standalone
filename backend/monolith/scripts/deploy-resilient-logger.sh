#!/bin/bash

###############################################################################
# Resilient Logger PM2 Deployment Script (Issue #3002)
###############################################################################
#
# This script deploys the resilient logger service using PM2.
# The resilient logger runs independently from the main application and
# remains operational even when the main app has errors.
#
# Usage:
#   ./scripts/deploy-resilient-logger.sh [environment]
#
# Arguments:
#   environment - Optional: 'production' or 'development' (default: production)
#
# Environment Variables (optional):
#   RESILIENT_LOG_DIR - Custom log directory path (e.g., /var/log/dronedoc/resilient)
#   RESILIENT_LOG_PORT - Custom port (default: 8082)
#
# Examples:
#   # Deploy with default settings
#   ./scripts/deploy-resilient-logger.sh
#
#   # Deploy with custom log directory
#   RESILIENT_LOG_DIR=/var/log/dronedoc/resilient ./scripts/deploy-resilient-logger.sh
#
#   # Deploy in development mode
#   ./scripts/deploy-resilient-logger.sh development
#
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOLITH_DIR="$(dirname "$SCRIPT_DIR")"

# Environment
ENVIRONMENT="${1:-production}"

# Log function
log() {
    echo -e "${BLUE}[DEPLOY-RESILIENT-LOGGER]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[DEPLOY-RESILIENT-LOGGER]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[DEPLOY-RESILIENT-LOGGER]${NC} $1"
}

log_error() {
    echo -e "${RED}[DEPLOY-RESILIENT-LOGGER]${NC} $1"
}

# Header
echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║     RESILIENT LOGGER PM2 DEPLOYMENT                   ║"
echo "╠═══════════════════════════════════════════════════════╣"
echo "║  Environment: ${ENVIRONMENT}"
echo "║  Working Dir: ${MONOLITH_DIR}"
if [ -n "$RESILIENT_LOG_DIR" ]; then
echo "║  Log Dir:     ${RESILIENT_LOG_DIR}"
fi
if [ -n "$RESILIENT_LOG_PORT" ]; then
echo "║  Port:        ${RESILIENT_LOG_PORT}"
fi
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# Check if PM2 is installed
log "Checking PM2 installation..."
if ! command -v pm2 &> /dev/null; then
    log_error "PM2 is not installed. Please install it first:"
    log_error "  npm install -g pm2"
    exit 1
fi
log_success "PM2 is installed"

# Check if we're in the correct directory
if [ ! -f "${MONOLITH_DIR}/package.json" ]; then
    log_error "package.json not found in ${MONOLITH_DIR}"
    log_error "Please run this script from the backend/monolith directory"
    exit 1
fi

# Check if resilient-logger.js exists
if [ ! -f "${MONOLITH_DIR}/src/resilient-logger.js" ]; then
    log_error "resilient-logger.js not found in ${MONOLITH_DIR}/src/"
    exit 1
fi
log_success "Resilient logger script found"

# Check if PM2 config exists
PM2_CONFIG="${MONOLITH_DIR}/ecosystem-resilient-logger.config.cjs"
if [ ! -f "$PM2_CONFIG" ]; then
    log_error "PM2 config not found: $PM2_CONFIG"
    exit 1
fi
log_success "PM2 configuration found"

# Change to monolith directory
cd "$MONOLITH_DIR"

# Check if resilient-logger is already running
log "Checking if resilient-logger is already running..."
if pm2 list | grep -q "resilient-logger"; then
    log_warning "Resilient logger is already running. Reloading..."
    pm2 reload ecosystem-resilient-logger.config.cjs
    log_success "Resilient logger reloaded"
else
    log "Starting resilient logger..."
    pm2 start ecosystem-resilient-logger.config.cjs
    log_success "Resilient logger started"
fi

# Save PM2 process list
log "Saving PM2 process list..."
pm2 save

# Show status
echo ""
log "PM2 Process Status:"
pm2 list | grep -E "(resilient-logger|App name)"

# Show logs location
echo ""
log "Log Files:"
if [ -n "$RESILIENT_LOG_DIR" ]; then
    log "  Application logs: ${RESILIENT_LOG_DIR}/"
else
    log "  Application logs: ${MONOLITH_DIR}/logs/resilient-logs/"
fi
log "  PM2 process logs: ${MONOLITH_DIR}/logs/pm2-resilient-logger-*.log"

# Health check
echo ""
log "Performing health check..."
sleep 2

HEALTH_PORT="${RESILIENT_LOG_PORT:-8082}"
if curl -s "http://localhost:${HEALTH_PORT}/health" > /dev/null; then
    log_success "Health check passed! Resilient logger is operational"
    echo ""
    log "You can access the resilient logger at:"
    log "  http://localhost:${HEALTH_PORT}/health"
    log "  http://localhost:${HEALTH_PORT}/logs"
else
    log_warning "Health check failed. Check PM2 logs:"
    log "  pm2 logs resilient-logger"
fi

# Show useful commands
echo ""
log "Useful commands:"
log "  pm2 logs resilient-logger     - View logs"
log "  pm2 restart resilient-logger  - Restart service"
log "  pm2 stop resilient-logger     - Stop service"
log "  pm2 delete resilient-logger   - Remove service"
log "  pm2 monit                     - Monitor all processes"

echo ""
log_success "Deployment complete!"
echo ""
