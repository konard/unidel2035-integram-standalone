#!/bin/bash

# Deployment script for интеграм.рф
# Run with: sudo bash deploy-integram.sh

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════╗"
echo "║  Deploying Integram Standalone to интеграм.рф         ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root: sudo bash deploy-integram.sh"
    exit 1
fi

echo "✅ Running as root"

# Step 1: Create web directory
echo ""
echo "📁 Creating /var/www/integram directory..."
mkdir -p /var/www/integram
echo "✅ Directory created"

# Step 2: Copy frontend files
echo ""
echo "📦 Copying frontend files from ~/integram-standalone/dist..."
cp -r /home/hive/integram-standalone/dist/* /var/www/integram/
echo "✅ Frontend files copied"

# Step 3: Set correct permissions
echo ""
echo "🔐 Setting permissions..."
chown -R www-data:www-data /var/www/integram
chmod -R 755 /var/www/integram
echo "✅ Permissions set"

# Step 4: Copy nginx configuration
echo ""
echo "🌐 Installing nginx configuration..."
cp /home/hive/integram-standalone/integram.rf.nginx.conf /etc/nginx/sites-available/integram.rf
echo "✅ Nginx config copied to /etc/nginx/sites-available/integram.rf"

# Step 5: Enable site
echo ""
echo "🔗 Enabling site..."
if [ -L /etc/nginx/sites-enabled/integram.rf ]; then
    echo "⚠️  Site already enabled, removing old symlink..."
    rm /etc/nginx/sites-enabled/integram.rf
fi
ln -s /etc/nginx/sites-available/integram.rf /etc/nginx/sites-enabled/integram.rf
echo "✅ Site enabled"

# Step 6: Test nginx configuration
echo ""
echo "🧪 Testing nginx configuration..."
if nginx -t; then
    echo "✅ Nginx configuration is valid"
else
    echo "❌ Nginx configuration has errors!"
    echo "   Fix the errors and run: sudo nginx -t"
    exit 1
fi

# Step 7: Reload nginx
echo ""
echo "🔄 Reloading nginx..."
systemctl reload nginx
echo "✅ Nginx reloaded"

# Step 8: Check backend status
echo ""
echo "🔍 Checking backend status..."
if netstat -tlnp 2>/dev/null | grep -q ":3000"; then
    echo "✅ Backend is running on port 3000"
else
    echo "⚠️  Backend is NOT running on port 3000!"
    echo "   Start it with: cd ~/integram-standalone/backend/monolith && node src/server-standalone.js &"
fi

# Summary
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  ✅ Deployment Complete!                               ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Site: https://интеграм.рф"
echo "🌐 Site (punycode): https://xn--80afflxcxn.xn--p1ai"
echo "🔌 WebSocket: wss://интеграм.рф/ws"
echo "💬 Chat API: https://интеграм.рф/api/chat"
echo ""
echo "📊 Check status:"
echo "   - Nginx: systemctl status nginx"
echo "   - Backend: netstat -tlnp | grep :3000"
echo "   - Logs: tail -f /var/log/nginx/integram-error.log"
echo ""
