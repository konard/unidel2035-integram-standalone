#!/bin/bash
###############################################################################
# DronDoc Monolithic Backend - PM2 Deployment Script
# Issue #1917 Fix: Proper PM2 deployment with correct paths and configuration
#
# This script:
# 1. Checks prerequisites (Node.js, PM2)
# 2. Sets up log directories
# 3. Validates environment configuration
# 4. Deploys the backend using PM2 with correct working directory
#
# Usage:
#   ./scripts/deploy-pm2.sh [production|development]
#
# Example:
#   ./scripts/deploy-pm2.sh production
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default environment
ENV=${1:-production}

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     DronDoc Monolithic Backend - PM2 Deployment Script        ║${NC}"
echo -e "${GREEN}║                    Issue #1917 Fix                             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${YELLOW}[INFO]${NC} Backend directory: $BACKEND_DIR"
echo -e "${YELLOW}[INFO]${NC} Environment: $ENV"
echo ""

###############################################################################
# 1. Check Prerequisites
###############################################################################

echo -e "${YELLOW}[STEP 1/7]${NC} Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} Node.js is not installed. Please install Node.js >= 18.0.0"
    echo "Installation: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}[OK]${NC} Node.js found: $NODE_VERSION"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} npm is not installed"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo -e "${GREEN}[OK]${NC} npm found: $NPM_VERSION"

# Check PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}[WARN]${NC} PM2 is not installed. Installing PM2..."
    npm install -g pm2
    if [ $? -ne 0 ]; then
        echo -e "${RED}[ERROR]${NC} Failed to install PM2"
        exit 1
    fi
fi

PM2_VERSION=$(pm2 -v)
echo -e "${GREEN}[OK]${NC} PM2 found: $PM2_VERSION"

echo ""

###############################################################################
# 2. Validate Directory Structure
###############################################################################

echo -e "${YELLOW}[STEP 2/7]${NC} Validating directory structure..."

cd "$BACKEND_DIR"

if [ ! -f "package.json" ]; then
    echo -e "${RED}[ERROR]${NC} package.json not found in $BACKEND_DIR"
    echo "Please ensure you are running this script from backend/monolith directory"
    exit 1
fi

if [ ! -f "src/index.js" ]; then
    echo -e "${RED}[ERROR]${NC} src/index.js not found"
    exit 1
fi

if [ ! -f "ecosystem.config.cjs" ]; then
    echo -e "${RED}[ERROR]${NC} ecosystem.config.cjs not found"
    echo "Please ensure ecosystem.config.cjs exists in backend/monolith directory"
    exit 1
fi

echo -e "${GREEN}[OK]${NC} Directory structure validated"
echo ""

###############################################################################
# 3. Create Log Directories
###############################################################################

echo -e "${YELLOW}[STEP 3/7]${NC} Setting up log directories..."

# Create log directory if it doesn't exist
if [ ! -d "/var/log/dronedoc" ]; then
    echo -e "${YELLOW}[INFO]${NC} Creating /var/log/dronedoc directory..."
    sudo mkdir -p /var/log/dronedoc
    sudo chown $USER:$USER /var/log/dronedoc
fi

# Create PM2 home directory if needed
mkdir -p ~/.pm2/logs

echo -e "${GREEN}[OK]${NC} Log directories ready"
echo ""

###############################################################################
# 4. Install Dependencies
###############################################################################

echo -e "${YELLOW}[STEP 4/7]${NC} Installing dependencies..."

if [ "$ENV" = "production" ]; then
    npm ci --production
else
    npm install
fi

if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR]${NC} Failed to install dependencies"
    exit 1
fi

echo -e "${GREEN}[OK]${NC} Dependencies installed"
echo ""

###############################################################################
# 5. Validate Environment Configuration
###############################################################################

echo -e "${YELLOW}[STEP 5/7]${NC} Checking environment configuration..."

# Run environment validation script
if [ -f "scripts/verify-env.js" ]; then
    node scripts/verify-env.js
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}[WARN]${NC} Environment validation warnings detected"
        echo -e "${YELLOW}[WARN]${NC} Some features may not work without proper configuration"
        echo ""
    fi
else
    echo -e "${YELLOW}[WARN]${NC} Environment validation script not found, skipping..."
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}[WARN]${NC} .env file not found"
    echo -e "${YELLOW}[INFO]${NC} Creating .env from .env.example..."

    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${YELLOW}[IMPORTANT]${NC} Please edit .env file and add your API keys and secrets"
    else
        echo -e "${RED}[ERROR]${NC} .env.example not found"
        exit 1
    fi
fi

echo ""

###############################################################################
# 6. Validate PM2 Ecosystem Config
###############################################################################

echo -e "${YELLOW}[STEP 6/7]${NC} Validating PM2 configuration..."

# Verify ecosystem.config.cjs is valid
if node -e "require('./ecosystem.config.cjs');" 2>/dev/null; then
    echo -e "${GREEN}[OK]${NC} ecosystem.config.cjs is valid"
else
    echo -e "${RED}[ERROR]${NC} ecosystem.config.cjs has syntax errors"
    exit 1
fi

echo ""

###############################################################################
# 7. Deploy with PM2
###############################################################################

echo -e "${YELLOW}[STEP 7/7]${NC} Deploying with PM2..."

# Stop existing instance if running
pm2 stop dronedoc-monolith 2>/dev/null || true
pm2 delete dronedoc-monolith 2>/dev/null || true

# Start with PM2
pm2 start ecosystem.config.cjs --env $ENV

if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR]${NC} Failed to start backend with PM2"
    echo ""
    echo "Troubleshooting steps:"
    echo "1. Check logs: pm2 logs dronedoc-monolith"
    echo "2. Check PM2 status: pm2 status"
    echo "3. Try running manually: node src/index.js"
    exit 1
fi

# Save PM2 process list
pm2 save

echo -e "${GREEN}[OK]${NC} Backend deployed successfully"
echo ""

###############################################################################
# Deployment Summary
###############################################################################

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                   Deployment Successful!                       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Application Status:${NC}"
pm2 status
echo ""
echo -e "${YELLOW}Useful PM2 Commands:${NC}"
echo "  pm2 logs dronedoc-monolith        - View logs"
echo "  pm2 status                        - Check status"
echo "  pm2 restart dronedoc-monolith     - Restart app"
echo "  pm2 stop dronedoc-monolith        - Stop app"
echo "  pm2 monit                         - Monitor resources"
echo "  pm2 startup                       - Enable auto-start on boot"
echo ""
echo -e "${YELLOW}Log Files:${NC}"
echo "  PM2 logs: ~/.pm2/logs/"
echo "  App logs: /var/log/dronedoc/"
echo ""
echo -e "${YELLOW}Health Check:${NC}"
echo "  curl http://localhost:8081/api/health"
echo ""
echo -e "${GREEN}[DONE]${NC} Deployment complete!"
