#!/bin/bash

SOURCE="../dronedoc2025/backend/monolith"
DEST="backend/monolith"

# Копируем дополнительные необходимые файлы и директории

# Core и utils
cp -r "$SOURCE/src/core" "$DEST/src/" 2>/dev/null || true
cp -r "$SOURCE/src/utils" "$DEST/src/" 2>/dev/null || true
cp -r "$SOURCE/src/middleware" "$DEST/src/" 2>/dev/null || true

# Database
cp -r "$SOURCE/src/database" "$DEST/src/" 2>/dev/null || true

# Models (если есть)
cp -r "$SOURCE/src/models" "$DEST/src/" 2>/dev/null || true

# Controllers (если есть)
cp -r "$SOURCE/src/controllers" "$DEST/src/" 2>/dev/null || true

# Lib
cp -r "$SOURCE/src/lib" "$DEST/src/" 2>/dev/null || true

# Scripts
cp -r "$SOURCE/scripts" "$DEST/" 2>/dev/null || true

# .env.example
cp "$SOURCE/.env.example" "$DEST/" 2>/dev/null || true

echo "Additional backend files copied!"
