#!/bin/bash

SOURCE="/home/hive/dronedoc2025"
DEST="/home/hive/integram-standalone"

# Stores
cp "$SOURCE/src/stores/authStore.js" "$DEST/src/stores/" 2>/dev/null || true
cp "$SOURCE/src/stores/onboardingStore.js" "$DEST/src/stores/" 2>/dev/null || true
cp "$SOURCE/src/stores/sessionStore.js" "$DEST/src/stores/" 2>/dev/null || true
cp "$SOURCE/src/stores/userStore.js" "$DEST/src/stores/" 2>/dev/null || true

# Services
cp "$SOURCE/src/services/tokenService.js" "$DEST/src/services/" 2>/dev/null || true
cp "$SOURCE/src/services/ensembleService.js" "$DEST/src/services/" 2>/dev/null || true
cp "$SOURCE/src/axios2.js" "$DEST/src/" 2>/dev/null || true

# Router
cp "$SOURCE/src/router/index.js" "$DEST/src/router/" 2>/dev/null || true
cp -r "$SOURCE/src/router/guards/"* "$DEST/src/router/guards/" 2>/dev/null || true
cp -r "$SOURCE/src/router/helpers/"* "$DEST/src/router/helpers/" 2>/dev/null || true

# Utils
cp "$SOURCE/src/utils/redirectValidation.js" "$DEST/src/utils/" 2>/dev/null || true

# Assets
cp -r "$SOURCE/src/assets/layout/"* "$DEST/src/assets/layout/" 2>/dev/null || true
cp -r "$SOURCE/src/assets/styles/"* "$DEST/src/assets/styles/" 2>/dev/null || true

# i18n
cp -r "$SOURCE/src/i18n/"* "$DEST/src/i18n/" 2>/dev/null || true

echo "Stores, services, and other files copied!"
