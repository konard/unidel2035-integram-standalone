#!/bin/bash

# Script to replace all dronedoc.ru URLs with environment variables or placeholders
# This script processes all files in the repository (excluding node_modules and .git)

# Replace dronedoc.ru in JavaScript files
find . -type f \( -name "*.js" -o -name "*.mjs" \) -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/experiments/*" -exec sed -i "s|'https://dronedoc\.ru'|process.env.INTEGRAM_SERVER_URL \|\| 'https://example.integram.io'|g" {} \;
find . -type f \( -name "*.js" -o -name "*.mjs" \) -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/experiments/*" -exec sed -i 's|"https://dronedoc\.ru"|process.env.INTEGRAM_SERVER_URL \|\| "https://example.integram.io"|g' {} \;
find . -type f \( -name "*.js" -o -name "*.mjs" \) -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/experiments/*" -exec sed -i "s|https://dronedoc\.ru|https://example.integram.io|g" {} \;

# Replace in Vue files
find . -type f -name "*.vue" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/experiments/*" -exec sed -i "s|https://dronedoc\.ru|\${VITE_INTEGRAM_URL}|g" {} \;
find . -type f -name "*.vue" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/experiments/*" -exec sed -i "s|https://drondoc\.ru|\${VITE_INTEGRAM_URL}|g" {} \;

# Replace proxy.drondoc.ru
find . -type f \( -name "*.md" -o -name "*.js" -o -name "*.vue" \) -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/experiments/*" -exec sed -i "s|proxy\.drondoc\.ru|example.integram.io|g" {} \;

# Replace dev.drondoc.ru
find . -type f \( -name "*.md" -o -name "*.sh" -o -name "*.js" \) -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/experiments/*" -exec sed -i "s|dev\.drondoc\.ru|dev.example.integram.io|g" {} \;

# Replace mail.drondoc.ru
find . -type f \( -name "*.sh" -o -name "*.md" \) -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/experiments/*" -exec sed -i "s|mail\.drondoc\.ru|mail.example.integram.io|g" {} \;

# Replace drondoc.ru domain (not in URLs)
find . -type f \( -name "*.sh" -o -name "*.md" \) -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/experiments/*" -exec sed -i "s|drondoc\.ru|example.integram.io|g" {} \;

echo "URL replacement complete!"
