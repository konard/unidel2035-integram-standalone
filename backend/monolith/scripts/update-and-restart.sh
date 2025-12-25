#!/bin/bash
###############################################################################
# DronDoc Backend - Update and Restart Script
# Issue #4538: Auto-restart backend after git pull/merge
#
# This script:
# 1. Pulls latest changes from git
# 2. Installs/updates dependencies if package.json changed
# 3. Restarts PM2 process automatically
# 4. Verifies backend is running
#
# Usage:
#   ./scripts/update-and-restart.sh [branch]
#
# Example:
#   ./scripts/update-and-restart.sh dev
#   ./scripts/update-and-restart.sh  # defaults to current branch
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory and backend directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     DronDoc Backend - Update and Restart Script                ║${NC}"
echo -e "${GREEN}║                    Issue #4538                                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Change to backend directory
cd "$BACKEND_DIR"
echo -e "${BLUE}[INFO]${NC} Working directory: $BACKEND_DIR"
echo ""

###############################################################################
# 1. Check git repository
###############################################################################

echo -e "${YELLOW}[STEP 1/6]${NC} Checking git repository..."

if [ ! -d ".git" ]; then
    # We might be in backend/monolith, go up to find .git
    if [ -d "../../.git" ]; then
        cd ../..
        REPO_DIR=$(pwd)
        echo -e "${BLUE}[INFO]${NC} Git repository found at: $REPO_DIR"
    else
        echo -e "${RED}[ERROR]${NC} Not a git repository"
        echo "This script must be run from a git repository"
        exit 1
    fi
fi

CURRENT_BRANCH=$(git branch --show-current)
TARGET_BRANCH="${1:-$CURRENT_BRANCH}"

echo -e "${GREEN}[OK]${NC} Current branch: $CURRENT_BRANCH"
echo -e "${BLUE}[INFO]${NC} Target branch: $TARGET_BRANCH"
echo ""

###############################################################################
# 2. Save package.json hash for comparison
###############################################################################

echo -e "${YELLOW}[STEP 2/6]${NC} Checking for dependency changes..."

PACKAGE_JSON="$BACKEND_DIR/package.json"
if [ -f "$PACKAGE_JSON" ]; then
    PACKAGE_JSON_BEFORE=$(md5sum "$PACKAGE_JSON" 2>/dev/null | cut -d' ' -f1 || echo "")
    echo -e "${BLUE}[INFO]${NC} Saved package.json checksum for comparison"
else
    PACKAGE_JSON_BEFORE=""
    echo -e "${YELLOW}[WARN]${NC} package.json not found"
fi

echo ""

###############################################################################
# 3. Pull latest changes
###############################################################################

echo -e "${YELLOW}[STEP 3/6]${NC} Pulling latest changes..."

# Stash any local changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}[WARN]${NC} Local changes detected, stashing..."
    git stash save "Auto-stash before update $(date +%Y-%m-%d_%H:%M:%S)"
fi

# Fetch and pull
git fetch origin

if [ "$TARGET_BRANCH" != "$CURRENT_BRANCH" ]; then
    echo -e "${BLUE}[INFO]${NC} Switching to branch: $TARGET_BRANCH"
    git checkout "$TARGET_BRANCH"
fi

BEFORE_COMMIT=$(git rev-parse HEAD)
git pull origin "$TARGET_BRANCH"
AFTER_COMMIT=$(git rev-parse HEAD)

if [ "$BEFORE_COMMIT" = "$AFTER_COMMIT" ]; then
    echo -e "${BLUE}[INFO]${NC} Already up to date (commit: ${AFTER_COMMIT:0:8})"
else
    echo -e "${GREEN}[OK]${NC} Updated from ${BEFORE_COMMIT:0:8} to ${AFTER_COMMIT:0:8}"
    # Show what changed
    echo -e "${BLUE}[INFO]${NC} Recent changes:"
    git log --oneline "$BEFORE_COMMIT..$AFTER_COMMIT" | head -5
fi

echo ""

###############################################################################
# 4. Check if dependencies need updating
###############################################################################

echo -e "${YELLOW}[STEP 4/6]${NC} Checking dependencies..."

NEEDS_NPM_INSTALL=false

if [ -f "$PACKAGE_JSON" ]; then
    PACKAGE_JSON_AFTER=$(md5sum "$PACKAGE_JSON" 2>/dev/null | cut -d' ' -f1 || echo "")

    if [ "$PACKAGE_JSON_BEFORE" != "$PACKAGE_JSON_AFTER" ] || [ ! -d "$BACKEND_DIR/node_modules" ]; then
        NEEDS_NPM_INSTALL=true
        echo -e "${YELLOW}[INFO]${NC} package.json changed or node_modules missing, will install dependencies"
    else
        echo -e "${GREEN}[OK]${NC} No dependency changes detected"
    fi
else
    echo -e "${YELLOW}[WARN]${NC} package.json not found, skipping dependency check"
fi

if [ "$NEEDS_NPM_INSTALL" = true ]; then
    cd "$BACKEND_DIR"
    echo -e "${BLUE}[INFO]${NC} Installing dependencies..."

    if npm ci --production 2>&1; then
        echo -e "${GREEN}[OK]${NC} Dependencies installed successfully"
    else
        echo -e "${YELLOW}[WARN]${NC} npm ci failed, trying npm install..."
        npm install
        echo -e "${GREEN}[OK]${NC} Dependencies installed with npm install"
    fi
fi

echo ""

###############################################################################
# 5. Restart PM2 process
###############################################################################

echo -e "${YELLOW}[STEP 5/6]${NC} Restarting backend with PM2..."

cd "$BACKEND_DIR"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} PM2 is not installed"
    echo "Install PM2: npm install -g pm2"
    exit 1
fi

# Check if process is running
PM2_PROCESS_NAME="dronedoc-monolith"
if pm2 describe "$PM2_PROCESS_NAME" &> /dev/null; then
    echo -e "${BLUE}[INFO]${NC} Restarting PM2 process: $PM2_PROCESS_NAME"
    pm2 restart "$PM2_PROCESS_NAME"

    # Wait a bit for the process to start
    sleep 3

    # Check if process is online
    if pm2 describe "$PM2_PROCESS_NAME" | grep -q "online"; then
        echo -e "${GREEN}[OK]${NC} PM2 process restarted successfully"
    else
        echo -e "${RED}[ERROR]${NC} PM2 process failed to start"
        echo -e "${YELLOW}[INFO]${NC} Check logs: pm2 logs $PM2_PROCESS_NAME"
        exit 1
    fi
else
    echo -e "${YELLOW}[WARN]${NC} PM2 process '$PM2_PROCESS_NAME' not found"
    echo -e "${BLUE}[INFO]${NC} Starting new PM2 process..."

    if [ -f "ecosystem.config.cjs" ]; then
        pm2 start ecosystem.config.cjs --env production
        pm2 save
        echo -e "${GREEN}[OK]${NC} PM2 process started"
    else
        echo -e "${RED}[ERROR]${NC} ecosystem.config.cjs not found"
        echo "Cannot start PM2 process without configuration"
        exit 1
    fi
fi

echo ""

###############################################################################
# 6. Verify backend is running
###############################################################################

echo -e "${YELLOW}[STEP 6/6]${NC} Verifying backend health..."

# Wait a moment for the server to be ready
sleep 2

# Check health endpoint
HEALTH_URL="http://localhost:8081/api/health"
echo -e "${BLUE}[INFO]${NC} Checking health endpoint: $HEALTH_URL"

if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    echo -e "${GREEN}[OK]${NC} Backend is healthy and responding"
else
    echo -e "${YELLOW}[WARN]${NC} Health check failed (backend might still be starting)"
    echo -e "${BLUE}[INFO]${NC} You can check status with: pm2 logs $PM2_PROCESS_NAME"
fi

echo ""

###############################################################################
# Summary
###############################################################################

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                   Update Complete!                             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Summary:${NC}"
echo "  Branch: $TARGET_BRANCH"
echo "  Commit: ${AFTER_COMMIT:0:8}"
echo "  Dependencies updated: $NEEDS_NPM_INSTALL"
echo ""
echo -e "${YELLOW}Useful Commands:${NC}"
echo "  pm2 logs $PM2_PROCESS_NAME      - View logs"
echo "  pm2 status                        - Check status"
echo "  pm2 restart $PM2_PROCESS_NAME   - Restart again"
echo "  pm2 monit                         - Monitor resources"
echo ""
echo -e "${YELLOW}Test the workspace-ai-agent endpoint:${NC}"
echo "  curl http://localhost:8081/api/health"
echo "  # For workspace-ai-agent, use POST with proper authentication"
echo ""
echo -e "${GREEN}[DONE]${NC} Backend updated and restarted successfully!"
