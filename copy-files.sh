#!/bin/bash

SOURCE="/home/hive/dronedoc2025"
DEST="/home/hive/integram-standalone"

# Frontend - Auth pages
cp -r "$SOURCE/src/views/pages/auth/"* "$DEST/src/views/pages/auth/"

# Frontend - Welcome page
cp "$SOURCE/src/views/pages/Welcome.vue" "$DEST/src/views/pages/"
cp "$SOURCE/src/views/pages/Landing.vue" "$DEST/src/views/pages/"

# Frontend - Integram pages
cp -r "$SOURCE/src/views/pages/Integram/"* "$DEST/src/views/pages/Integram/"

# Frontend - Chat components
cp -r "$SOURCE/src/components/chat/"* "$DEST/src/components/chat/" 2>/dev/null || true

# Frontend - Integram components
cp -r "$SOURCE/src/components/integram/"* "$DEST/src/components/integram/"

# Frontend - Layout components
cp -r "$SOURCE/src/layout/"* "$DEST/src/components/layout/"

# Frontend - Onboarding components
cp -r "$SOURCE/src/components/onboarding/"* "$DEST/src/components/onboarding/" 2>/dev/null || true

# Frontend - Ensembles components
cp -r "$SOURCE/src/components/ensembles/"* "$DEST/src/components/ensembles/" 2>/dev/null || true

# Frontend - Common components
cp -r "$SOURCE/src/components/common/"* "$DEST/src/components/common/" 2>/dev/null || true

echo "Files copied successfully!"
