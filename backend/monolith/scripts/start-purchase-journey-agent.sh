#!/bin/bash

# Start Purchase Journey Testing Agent
# This script starts the autonomous background testing agent
# that monitors the complete purchase journey every 30 minutes
#
# Usage: ./start-purchase-journey-agent.sh

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Purchase Journey Testing Agent - Startup Script${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Configuration
BACKEND_URL="${BACKEND_URL:-http://localhost:8081}"
API_ENDPOINT="${BACKEND_URL}/api/purchase-journey-testing"

echo -e "${YELLOW}🔧 Configuration:${NC}"
echo "   Backend URL: $BACKEND_URL"
echo "   API Endpoint: $API_ENDPOINT"
echo ""

# Check if backend is running
echo -e "${YELLOW}🔍 Checking backend availability...${NC}"
if curl -s --connect-timeout 5 "${BACKEND_URL}/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is running${NC}"
else
    echo -e "${YELLOW}⚠️  Backend health check failed, but proceeding anyway...${NC}"
    echo "   Make sure the backend is running: cd backend/monolith && npm start"
fi
echo ""

# Get current agent status
echo -e "${YELLOW}📊 Fetching current agent status...${NC}"
STATUS_RESPONSE=$(curl -s "${API_ENDPOINT}/status" 2>/dev/null || echo '{"success":false,"error":"Connection failed"}')

if echo "$STATUS_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Agent is initialized${NC}"

    # Parse status
    IS_ACTIVE=$(echo "$STATUS_RESPONSE" | grep -o '"backgroundTestingActive":[^,}]*' | cut -d':' -f2 | tr -d ' ')
    TOTAL_TESTS=$(echo "$STATUS_RESPONSE" | grep -o '"totalTests":[^,}]*' | cut -d':' -f2 | tr -d ' ')
    SUCCESSFUL_TESTS=$(echo "$STATUS_RESPONSE" | grep -o '"successfulTests":[^,}]*' | cut -d':' -f2 | tr -d ' ')
    FAILED_TESTS=$(echo "$STATUS_RESPONSE" | grep -o '"failedTests":[^,}]*' | cut -d':' -f2 | tr -d ' ')

    echo "   Background testing active: $IS_ACTIVE"
    echo "   Total tests executed: ${TOTAL_TESTS:-0}"
    echo "   Successful: ${SUCCESSFUL_TESTS:-0}"
    echo "   Failed: ${FAILED_TESTS:-0}"
    echo ""

    if [ "$IS_ACTIVE" = "true" ]; then
        echo -e "${GREEN}✅ Agent is already running!${NC}"
        echo ""
        echo -e "${BLUE}ℹ️  To stop: curl -X POST ${API_ENDPOINT}/stop${NC}"
        echo -e "${BLUE}ℹ️  To check status: curl ${API_ENDPOINT}/status${NC}"
        exit 0
    fi
else
    echo -e "${YELLOW}⚠️  Could not get agent status (agent may not be initialized yet)${NC}"
    echo ""
fi

# Start background testing
echo -e "${YELLOW}🚀 Starting background testing...${NC}"
START_RESPONSE=$(curl -s -X POST "${API_ENDPOINT}/start" 2>/dev/null || echo '{"success":false,"error":"Connection failed"}')

if echo "$START_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Background testing started successfully!${NC}"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ Purchase Journey Testing Agent is now running autonomously${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${BLUE}📋 What the agent does:${NC}"
    echo "   • Tests complete purchase journey every 30 minutes"
    echo "   • Monitors 6 critical steps: Request → Organization → Selection → ROI → Proposal → Registration"
    echo "   • Automatically creates GitHub issues for failures"
    echo "   • Runs auto-solve command for detected problems"
    echo "   • Tracks metrics and test history"
    echo ""
    echo -e "${BLUE}🔗 Useful commands:${NC}"
    echo "   • Check status:     curl ${API_ENDPOINT}/status | jq"
    echo "   • View metrics:     curl ${API_ENDPOINT}/metrics | jq"
    echo "   • View history:     curl ${API_ENDPOINT}/history?limit=10 | jq"
    echo "   • Run manual test:  curl -X POST ${API_ENDPOINT}/test | jq"
    echo "   • Stop agent:       curl -X POST ${API_ENDPOINT}/stop"
    echo ""
    echo -e "${BLUE}📖 Documentation:${NC}"
    echo "   backend/monolith/src/agents/PURCHASE_JOURNEY_TESTING_AGENT_README.md"
    echo ""
else
    ERROR_MSG=$(echo "$START_RESPONSE" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
    echo -e "${YELLOW}⚠️  Failed to start background testing${NC}"
    echo "   Error: ${ERROR_MSG:-Unknown error}"
    echo ""
    echo -e "${YELLOW}💡 Troubleshooting:${NC}"
    echo "   1. Make sure backend is running: cd backend/monolith && npm start"
    echo "   2. Check backend logs for errors"
    echo "   3. Verify environment variables are set correctly"
    echo "   4. Try manual initialization: curl -X POST ${API_ENDPOINT}/test"
    echo ""
    exit 1
fi
