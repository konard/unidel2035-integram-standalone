#!/bin/bash
# Diagnostic script for Claude Chat health check issues
# Run this on the server where dev.drondoc.ru backend is deployed

echo "=========================================="
echo "Claude Chat Diagnostic Script"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check current directory
echo "1. Current directory:"
pwd
echo ""

# 2. Check if we're in the right place
echo "2. Checking repository structure..."
if [ -f "package.json" ] && [ -d "src/services" ]; then
    echo -e "${GREEN}✓${NC} In correct directory (backend/monolith)"
else
    echo -e "${RED}✗${NC} Not in backend/monolith directory!"
    echo "Please cd to backend/monolith and run again"
    exit 1
fi
echo ""

# 3. Check if required files exist
echo "3. Checking required service files..."
FILES=(
    "src/services/linkdb/AIProviderKeysService.js"
    "src/services/ClaudeSSHProxyService.js"
    "src/api/routes/claude-chat.js"
)

all_files_exist=true
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file exists"
    else
        echo -e "${RED}✗${NC} $file MISSING!"
        all_files_exist=false
    fi
done
echo ""

if [ "$all_files_exist" = false ]; then
    echo -e "${RED}ERROR: Required files are missing!${NC}"
    echo "Run: git pull origin dev"
    exit 1
fi

# 4. Check git status
echo "4. Git status:"
git branch --show-current
git log -1 --oneline
echo ""

# 5. Check if imports work
echo "5. Testing module imports..."
node -e "
import('./src/services/linkdb/AIProviderKeysService.js')
  .then(m => console.log('✓ AIProviderKeysService: OK'))
  .catch(e => console.error('✗ AIProviderKeysService ERROR:', e.message));

import('./src/services/ClaudeSSHProxyService.js')
  .then(m => console.log('✓ ClaudeSSHProxyService: OK'))
  .catch(e => console.error('✗ ClaudeSSHProxyService ERROR:', e.message));
" 2>&1
echo ""

# 6. Check .env file
echo "6. Checking .env configuration..."
if [ -f ".env" ]; then
    echo -e "${GREEN}✓${NC} .env file exists"
    if grep -q "CLAUDE_SSH_HOST" .env; then
        echo -e "${GREEN}✓${NC} CLAUDE_SSH_HOST configured"
    else
        echo -e "${YELLOW}⚠${NC} CLAUDE_SSH_HOST not configured (will use Anthropic API)"
    fi
else
    echo -e "${YELLOW}⚠${NC} .env file not found (using defaults)"
fi
echo ""

# 7. Check if backend is running
echo "7. Checking if backend is running..."
if command -v pm2 &> /dev/null; then
    pm2 list | grep -E "name|monolith|orchestrator"
else
    ps aux | grep "node.*src/index.js" | grep -v grep
fi
echo ""

# 8. Check backend logs (last 50 lines)
echo "8. Recent backend logs (checking for errors):"
echo "---"
if command -v pm2 &> /dev/null; then
    pm2 logs --nostream --lines 50 | grep -E "ERROR|claude|SSH|health" | tail -20
else
    if [ -f "/tmp/backend.log" ]; then
        tail -50 /tmp/backend.log | grep -E "ERROR|claude|SSH|health" | tail -20
    else
        echo "No log file found. Check your backend logs manually."
    fi
fi
echo ""

# 9. Test health endpoint locally
echo "9. Testing health endpoint locally..."
response=$(curl -s http://localhost:8081/api/claude-chat/health)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Health endpoint responded"
    echo "$response" | jq . 2>/dev/null || echo "$response"
else
    echo -e "${RED}✗${NC} Health endpoint failed to respond"
fi
echo ""

# 10. Recommendations
echo "=========================================="
echo "Recommendations:"
echo "=========================================="
if [ "$all_files_exist" = true ]; then
    echo "1. If backend is running: pm2 restart all (or kill and restart)"
    echo "2. If not running: npm run dev (or pm2 start ecosystem.config.cjs)"
    echo "3. Check logs: pm2 logs (or tail -f /tmp/backend.log)"
    echo "4. Test health: curl http://localhost:8081/api/claude-chat/health"
else
    echo "1. Pull latest code: git pull origin dev"
    echo "2. Install dependencies: npm install"
    echo "3. Restart backend: pm2 restart all"
fi
echo ""
echo "If issues persist, check full logs for detailed error messages."
