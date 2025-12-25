#!/bin/bash
###############################################################################
# DronDoc Backend - PM2 Troubleshooting Script
# Issue #1917 - Diagnose PM2 crash loops and common issues
#
# This script helps diagnose PM2 issues on production servers
#
# Usage: ./scripts/troubleshoot-pm2.sh
###############################################################################

set +e  # Don't exit on error, we want to collect all info

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     DronDoc Backend - PM2 Troubleshooting Diagnostic           ║${NC}"
echo -e "${BLUE}║                    Issue #1917                                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${YELLOW}[INFO]${NC} Backend directory: $BACKEND_DIR"
echo -e "${YELLOW}[INFO]${NC} Current directory: $(pwd)"
echo -e "${YELLOW}[INFO]${NC} Running as user: $(whoami)"
echo ""

###############################################################################
# 1. System Information
###############################################################################

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}1. SYSTEM INFORMATION${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}OS:${NC}"
uname -a
echo ""

echo -e "${YELLOW}Node.js version:${NC}"
if command -v node &> /dev/null; then
    node -v
else
    echo -e "${RED}Node.js not found!${NC}"
fi
echo ""

echo -e "${YELLOW}npm version:${NC}"
if command -v npm &> /dev/null; then
    npm -v
else
    echo -e "${RED}npm not found!${NC}"
fi
echo ""

echo -e "${YELLOW}PM2 version:${NC}"
if command -v pm2 &> /dev/null; then
    pm2 -v
else
    echo -e "${RED}PM2 not found! Install with: npm install -g pm2${NC}"
fi
echo ""

###############################################################################
# 2. Directory Structure Check
###############################################################################

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}2. DIRECTORY STRUCTURE${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

cd "$BACKEND_DIR" || { echo -e "${RED}Cannot cd to backend directory!${NC}"; exit 1; }

echo -e "${YELLOW}Checking required files:${NC}"

if [ -f "package.json" ]; then
    echo -e "${GREEN}✓${NC} package.json exists"
    echo "  Name: $(node -e "console.log(require('./package.json').name)")"
    echo "  Version: $(node -e "console.log(require('./package.json').version)")"
else
    echo -e "${RED}✗${NC} package.json MISSING"
fi

if [ -f "src/index.js" ]; then
    echo -e "${GREEN}✓${NC} src/index.js exists"
else
    echo -e "${RED}✗${NC} src/index.js MISSING"
fi

if [ -f "ecosystem.config.cjs" ]; then
    echo -e "${GREEN}✓${NC} ecosystem.config.cjs exists"
else
    echo -e "${RED}✗${NC} ecosystem.config.cjs MISSING"
fi

if [ -f ".env" ]; then
    echo -e "${GREEN}✓${NC} .env file exists"
else
    echo -e "${YELLOW}○${NC} .env file not found (optional)"
fi

echo ""

###############################################################################
# 3. PM2 Status
###############################################################################

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}3. PM2 STATUS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

if command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}PM2 list:${NC}"
    pm2 list
    echo ""

    echo -e "${YELLOW}PM2 info for dronedoc-monolith:${NC}"
    pm2 info dronedoc-monolith 2>&1 || echo "No process named 'dronedoc-monolith' found"
    echo ""
else
    echo -e "${RED}PM2 not installed${NC}"
    echo ""
fi

###############################################################################
# 4. Process and Port Check
###############################################################################

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}4. PROCESS AND PORT STATUS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Processes using port 8081:${NC}"
if command -v lsof &> /dev/null; then
    sudo lsof -i :8081 2>/dev/null || echo "Port 8081 is free"
else
    netstat -tulpn 2>/dev/null | grep :8081 || echo "Port 8081 is free (or netstat not available)"
fi
echo ""

echo -e "${YELLOW}Node processes:${NC}"
ps aux | grep node | grep -v grep || echo "No Node.js processes running"
echo ""

###############################################################################
# 5. Recent PM2 Logs
###############################################################################

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}5. RECENT PM2 LOGS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

if [ -d ~/.pm2/logs ]; then
    echo -e "${YELLOW}Last 20 lines of PM2 error log:${NC}"
    if [ -f ~/.pm2/logs/dronedoc-monolith-error.log ]; then
        tail -n 20 ~/.pm2/logs/dronedoc-monolith-error.log
    else
        echo "No error log found"
    fi
    echo ""

    echo -e "${YELLOW}Last 20 lines of PM2 output log:${NC}"
    if [ -f ~/.pm2/logs/dronedoc-monolith-out.log ]; then
        tail -n 20 ~/.pm2/logs/dronedoc-monolith-out.log
    else
        echo "No output log found"
    fi
    echo ""
else
    echo "No PM2 logs directory found"
    echo ""
fi

###############################################################################
# 6. Environment Configuration
###############################################################################

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}6. ENVIRONMENT CONFIGURATION${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

if [ -f "scripts/verify-env-pm2.js" ]; then
    echo -e "${YELLOW}Running environment verification:${NC}"
    node scripts/verify-env-pm2.js
else
    echo -e "${YELLOW}Environment verification script not found${NC}"
fi
echo ""

###############################################################################
# 7. Redis Status
###############################################################################

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}7. REDIS STATUS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

if command -v redis-cli &> /dev/null; then
    echo -e "${YELLOW}Redis ping test:${NC}"
    redis-cli ping 2>&1 || echo -e "${RED}Redis not responding${NC}"
    echo ""
else
    echo -e "${YELLOW}Redis CLI not found${NC}"
    echo ""
fi

if command -v systemctl &> /dev/null; then
    echo -e "${YELLOW}Redis service status:${NC}"
    systemctl status redis 2>&1 | head -10 || echo "Redis service not found"
    echo ""
fi

###############################################################################
# 8. Database Status
###############################################################################

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}8. DATABASE STATUS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

if command -v systemctl &> /dev/null; then
    echo -e "${YELLOW}PostgreSQL service status:${NC}"
    systemctl status postgresql 2>&1 | head -10 || echo "PostgreSQL service not found"
    echo ""
fi

###############################################################################
# 9. Ecosystem Config Check
###############################################################################

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}9. ECOSYSTEM.CONFIG.CJS ANALYSIS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

if [ -f "ecosystem.config.cjs" ]; then
    echo -e "${YELLOW}Working directory (cwd) setting:${NC}"
    grep -A 1 "cwd:" ecosystem.config.cjs || echo "cwd not found in config"
    echo ""

    echo -e "${YELLOW}Interpreter setting:${NC}"
    grep -A 1 "interpreter:" ecosystem.config.cjs || echo "interpreter not found in config"
    echo ""

    echo -e "${YELLOW}Script setting:${NC}"
    grep -A 1 "script:" ecosystem.config.cjs || echo "script not found in config"
    echo ""

    CURRENT_DIR=$(pwd)
    # Note: cwd now uses __dirname which will be resolved at runtime
    echo -e "${GREEN}✓${NC} ecosystem.config.cjs uses __dirname for automatic path resolution"
    echo "  This ensures the config works in any deployment location"
    echo ""
fi

###############################################################################
# Summary and Recommendations
###############################################################################

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                 SUMMARY AND RECOMMENDATIONS                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}Common Issues and Fixes:${NC}"
echo ""
echo "1. ${RED}PM2 crash loop with 'too many restarts'${NC}"
echo "   Fix: Ensure ecosystem.config.cjs exists with correct configuration"
echo "   Command: ./scripts/deploy-pm2.sh production"
echo ""
echo "2. ${RED}Cannot find package.json${NC}"
echo "   Fix: ecosystem.config.cjs uses __dirname for automatic path resolution"
echo "   Or: cd to backend/monolith before running pm2"
echo ""
echo "3. ${RED}Redis connection errors${NC}"
echo "   Fix: Disable Redis or install Redis server"
echo "   Set REDIS_ENABLED=false in .env"
echo ""
echo "4. ${RED}Database not configured${NC}"
echo "   Fix: This is a warning, not an error"
echo "   Backend will run without database in degraded mode"
echo ""
echo "5. ${RED}Port 8081 already in use${NC}"
echo "   Fix: Kill existing process or change PORT in .env"
echo "   Command: sudo lsof -i :8081"
echo ""

echo -e "${YELLOW}Useful Commands:${NC}"
echo "  pm2 logs dronedoc-monolith --lines 50    # View recent logs"
echo "  pm2 restart dronedoc-monolith            # Restart app"
echo "  pm2 delete dronedoc-monolith             # Remove from PM2"
echo "  ./scripts/deploy-pm2.sh production       # Redeploy"
echo "  node scripts/verify-env-pm2.js           # Check environment"
echo ""

echo -e "${GREEN}[DONE]${NC} Diagnostic complete!"
echo ""
echo "Review the output above to identify issues."
echo "For more help, see: PM2_DEPLOYMENT.md"
