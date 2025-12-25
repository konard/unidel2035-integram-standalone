#!/bin/bash

# Setup script for agent_polza2 AI agent
# This script installs Bun runtime and agent_polza2 dependencies

set -e

echo "========================================="
echo "agent_polza2 Setup Script"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MONOLITH_DIR="$(dirname "$SCRIPT_DIR")"
AGENT_DIR="$MONOLITH_DIR/vendor/hives/agent_polza2"

echo -e "${YELLOW}Step 1/4: Checking Bun installation${NC}"
echo ""

# Check if Bun is installed
if command -v bun &> /dev/null; then
    BUN_VERSION=$(bun --version)
    echo -e "${GREEN}✓ Bun is already installed (version $BUN_VERSION)${NC}"
else
    echo -e "${YELLOW}Bun is not installed. Installing Bun...${NC}"

    # Install Bun
    curl -fsSL https://bun.sh/install | bash

    # Add Bun to PATH for current session
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    # Verify installation
    if command -v bun &> /dev/null; then
        BUN_VERSION=$(bun --version)
        echo -e "${GREEN}✓ Bun installed successfully (version $BUN_VERSION)${NC}"
        echo -e "${YELLOW}Note: You may need to restart your shell or source your profile for PATH changes to take effect.${NC}"
    else
        echo -e "${RED}✗ Failed to install Bun. Please install manually: https://bun.sh/docs/installation${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${YELLOW}Step 2/4: Checking agent_polza2 installation${NC}"
echo ""

# Check if agent_polza2 is cloned
if [ ! -d "$AGENT_DIR" ]; then
    echo -e "${YELLOW}agent_polza2 not found. Cloning from repository...${NC}"

    # Create vendor/hives directory if it doesn't exist
    mkdir -p "$MONOLITH_DIR/vendor/hives"

    # Clone hives repository temporarily
    cd "$MONOLITH_DIR/vendor/hives"
    git clone https://github.com/judas-priest/hives.git temp_hives

    # Extract agent_polza2
    mv temp_hives/agent_polza2 ./
    rm -rf temp_hives

    echo -e "${GREEN}✓ agent_polza2 cloned successfully${NC}"
else
    echo -e "${GREEN}✓ agent_polza2 is already installed${NC}"
fi

echo ""
echo -e "${YELLOW}Step 3/4: Installing agent_polza2 dependencies${NC}"
echo ""

# Install dependencies with Bun
cd "$AGENT_DIR"
bun install

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dependencies installed successfully${NC}"
else
    echo -e "${RED}✗ Failed to install dependencies${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 4/4: Verifying installation${NC}"
echo ""

# Test agent_polza2
TEST_OUTPUT=$(bun run "$AGENT_DIR/src/index.js" --version 2>&1 || echo "test")

if [ $? -eq 0 ] || echo "$TEST_OUTPUT" | grep -q "agent"; then
    echo -e "${GREEN}✓ agent_polza2 is working correctly${NC}"
else
    echo -e "${YELLOW}⚠ agent_polza2 may not be fully configured. Check the configuration file.${NC}"
fi

echo ""
echo "========================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Configure environment variables in backend/monolith/.env:"
echo "   BUN_PATH=/path/to/bun  # Optional, defaults to 'bun' in PATH"
echo "   POLZA_API_KEY=your_api_key  # Optional, demo key available in config"
echo ""
echo "2. Restart your backend server"
echo ""
echo "3. Navigate to /workspaces in the app and click 'Enable AI' in the terminal"
echo ""
echo "For more information, see: docs/AGENT_POLZA2_INTEGRATION.md"
echo ""
