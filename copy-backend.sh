#!/bin/bash

SOURCE="/home/hive/dronedoc2025/backend/monolith"
DEST="/home/hive/integram-standalone/backend/monolith"

# API Routes
cp "$SOURCE/src/api/routes/auth.js" "$DEST/src/api/routes/" 2>/dev/null || true
cp "$SOURCE/src/api/routes/oauth.js" "$DEST/src/api/routes/" 2>/dev/null || true
cp "$SOURCE/src/api/routes/email-auth.js" "$DEST/src/api/routes/" 2>/dev/null || true
cp "$SOURCE/src/api/routes/unified-auth.js" "$DEST/src/api/routes/" 2>/dev/null || true
cp "$SOURCE/src/api/routes/menuConfig.js" "$DEST/src/api/routes/" 2>/dev/null || true
cp "$SOURCE/src/api/routes/menuConfigUnified.js" "$DEST/src/api/routes/" 2>/dev/null || true
cp "$SOURCE/src/api/routes/general-chat.js" "$DEST/src/api/routes/" 2>/dev/null || true
cp "$SOURCE/src/api/routes/chat.js" "$DEST/src/api/routes/" 2>/dev/null || true
cp "$SOURCE/src/api/routes/integram-organizations.js" "$DEST/src/api/routes/" 2>/dev/null || true
cp "$SOURCE/src/api/routes/drondoc-agents-integram.js" "$DEST/src/api/routes/" 2>/dev/null || true

# Services - Auth
cp -r "$SOURCE/src/services/auth/"* "$DEST/src/services/auth/" 2>/dev/null || true

# Services - Chat
cp -r "$SOURCE/src/services/chat/"* "$DEST/src/services/chat/" 2>/dev/null || true

# Services - Integram
cp -r "$SOURCE/src/services/integram/"* "$DEST/src/services/integram/" 2>/dev/null || true

# Services - MCP
cp "$SOURCE/src/services/mcp/integram-server.js" "$DEST/src/services/mcp/" 2>/dev/null || true
cp "$SOURCE/src/services/mcp/integram-sse-server.js" "$DEST/src/services/mcp/" 2>/dev/null || true

# Config
cp "$SOURCE/src/config/chat-tables.js" "$DEST/src/config/" 2>/dev/null || true

echo "Backend files copied!"
